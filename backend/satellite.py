"""Satellite cross-witness module.

Pulls a recent Sentinel-2 scene covering each registered zone, hashes the
scene metadata + thumbnail, and appends it to the chain as a signed
observation with `source_type="satellite_image_hash"`. The point is
*independence*: the platform operator does not control Sentinel-2
imagery, so a satellite witness cross-checks any other claim about
what's happening on the ground.

Default-OFF — set `SATELLITE_WITNESS_ENABLED=1` to start the loop.
Disabled in dev/test so the suite doesn't make network calls.

Auditor verification flow
-------------------------
1. Find a satellite_image_hash observation in the chain
2. Read its `payload.stac_url` — points to the canonical Element84
   STAC item for the scene
3. Re-fetch the STAC metadata; recompute the body digest; verify the
   signature using the public key at /.well-known/keys.json
4. Independently download the same thumbnail from `payload.thumbnail_url`
   and recompute its SHA-256 — match against `payload.thumbnail_sha256`

Element84's earth-search STAC endpoint is the right backend for v0.1:
free, no API key, well-documented, and the canonical reference for
Sentinel-2 L2A products. We deliberately do NOT host our own copy of
the imagery — the auditor fetches from Element84/AWS directly so the
chain depends only on a public free service we cannot rewrite.

Module shape mirrors `simulator.py`: pure callables that take db handle
explicitly so this file has no compile-time dependency on server.py.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

# Element84's earth-search STAC API. Free, no auth, well-documented.
SATELLITE_STAC_URL = os.environ.get(
    "SATELLITE_STAC_URL",
    "https://earth-search.aws.element84.com/v1/search",
)
SATELLITE_COLLECTION = os.environ.get("SATELLITE_COLLECTION", "sentinel-2-l2a")

# Tick cadence — once every 6 hours by default. STAC has new Sentinel-2
# scenes for each location every 5 days; querying more often than every
# few hours wastes the (free) API quota without surfacing new data.
SATELLITE_TICK_INTERVAL_S = int(os.environ.get("SATELLITE_TICK_INTERVAL_S", str(6 * 60 * 60)))

# Per-tick limits to keep the loop bounded.
SATELLITE_MAX_ZONES_PER_TICK = int(os.environ.get("SATELLITE_MAX_ZONES_PER_TICK", "20"))
SATELLITE_MAX_CLOUD_COVER = float(os.environ.get("SATELLITE_MAX_CLOUD_COVER", "60"))
SATELLITE_HTTP_TIMEOUT_S = 30.0


def _zone_bbox(zone: dict) -> Optional[List[float]]:
    """Return [min_lon, min_lat, max_lon, max_lat] for a zone document.

    Tries the explicit `bbox` field first, then derives from a polygon
    `coordinates`, then falls back to a small box around (center_lat,
    center_lng) if those are present. Returns None if the zone has
    nothing geographic on it (caller should skip such zones).
    """
    if isinstance(zone.get("bbox"), list) and len(zone["bbox"]) == 4:
        return [float(x) for x in zone["bbox"]]

    coords = None
    polygon = zone.get("polygon") or zone.get("coordinates")
    if isinstance(polygon, list):
        # GeoJSON polygons are [[[lon, lat], ...]] (one outer ring); flatten.
        if polygon and isinstance(polygon[0], list) and polygon[0] and isinstance(polygon[0][0], list):
            coords = polygon[0]
        elif polygon and isinstance(polygon[0], list):
            coords = polygon
    if coords:
        lons = [float(p[0]) for p in coords if isinstance(p, list) and len(p) >= 2]
        lats = [float(p[1]) for p in coords if isinstance(p, list) and len(p) >= 2]
        if lons and lats:
            return [min(lons), min(lats), max(lons), max(lats)]

    lat = zone.get("center_lat")
    lng = zone.get("center_lng")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        # Half-degree box around the centroid (~55km) — coarse but enough
        # to find a covering Sentinel-2 tile when no polygon was supplied.
        return [float(lng) - 0.5, float(lat) - 0.5, float(lng) + 0.5, float(lat) + 0.5]
    return None


async def _fetch_latest_scene(client: httpx.AsyncClient, bbox: List[float]) -> Optional[Dict[str, Any]]:
    """STAC search for the most recent Sentinel-2 L2A scene covering bbox.

    Returns the raw STAC item (a feature dict) or None on failure / no
    matches. Network errors are caught and logged — caller treats them
    the same as "no scene available", which is the right semantics for
    a witness loop that can retry later.
    """
    body = {
        "collections": [SATELLITE_COLLECTION],
        "bbox": bbox,
        "limit": 1,
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "query": {"eo:cloud_cover": {"lte": SATELLITE_MAX_CLOUD_COVER}},
    }
    try:
        res = await client.post(SATELLITE_STAC_URL, json=body, timeout=SATELLITE_HTTP_TIMEOUT_S)
        res.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logging.warning("satellite STAC search failed for bbox=%s: %s", bbox, exc)
        return None

    payload = res.json()
    features = payload.get("features") or []
    return features[0] if features else None


async def _hash_thumbnail(client: httpx.AsyncClient, thumbnail_url: Optional[str]) -> Optional[str]:
    """Fetch the scene's thumbnail and SHA-256 it. None on failure or
    no URL — the witness still records the scene by id even without a
    thumbnail hash, just with that field omitted."""
    if not thumbnail_url:
        return None
    try:
        res = await client.get(thumbnail_url, timeout=SATELLITE_HTTP_TIMEOUT_S)
        res.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logging.warning("satellite thumbnail fetch failed for %s: %s", thumbnail_url, exc)
        return None
    return hashlib.sha256(res.content).hexdigest()


def _build_witness_payload(zone: dict, scene: dict, thumbnail_sha256: Optional[str]) -> Dict[str, Any]:
    """Distill the STAC item into the witness body. Compact by design —
    the load-bearing fields are scene_id (so the auditor can re-fetch
    the canonical record from Element84) and the thumbnail hash (so
    the auditor can independently confirm the bytes the platform saw)."""
    props = scene.get("properties") or {}
    assets = scene.get("assets") or {}
    thumbnail_asset = assets.get("thumbnail") or assets.get("preview") or {}
    return {
        "scene_id": scene.get("id"),
        "platform": props.get("platform") or props.get("constellation"),
        "acquisition_at": props.get("datetime"),
        "cloud_cover_pct": props.get("eo:cloud_cover"),
        "bbox": scene.get("bbox"),
        "stac_collection": SATELLITE_COLLECTION,
        "stac_url": (
            f"{SATELLITE_STAC_URL.rstrip('/search')}"
            f"/collections/{SATELLITE_COLLECTION}/items/{scene.get('id')}"
        ) if scene.get("id") else None,
        "thumbnail_url": thumbnail_asset.get("href"),
        "thumbnail_sha256": thumbnail_sha256,
        "zone_bbox": _zone_bbox(zone),
    }


async def record_satellite_witness(db, zone: dict, client: Optional[httpx.AsyncClient] = None) -> Optional[dict]:
    """Run one zone's satellite witness pass. Returns the recorded
    observation document (with signature) on success, None on no-scene
    / network failure / signing failure. Never raises — caller is the
    supervisor loop which logs and continues.

    Idempotent on (zone_id, scene_id): if the same scene is already in
    the chain for this zone, we skip — the chain is append-only but
    repeating the same witness adds noise without adding evidence.
    """
    bbox = _zone_bbox(zone)
    if not bbox:
        return None

    own_client = client is None
    if client is None:
        client = httpx.AsyncClient()
    try:
        scene = await _fetch_latest_scene(client, bbox)
        if not scene or not scene.get("id"):
            return None

        existing = await db.observations.find_one(
            {
                "zone_id": zone.get("id"),
                "source_type": "satellite_image_hash",
                "payload.scene_id": scene["id"],
            },
            {"_id": 0, "id": 1},
        )
        if existing:
            return None

        thumbnail_url = None
        assets = scene.get("assets") or {}
        thumbnail_asset = assets.get("thumbnail") or assets.get("preview") or {}
        thumbnail_url = thumbnail_asset.get("href")
        thumbnail_sha = await _hash_thumbnail(client, thumbnail_url)

        payload = _build_witness_payload(zone, scene, thumbnail_sha)
        try:
            from provenance import record_observation
            obs = await record_observation(
                db,
                source_type="satellite_image_hash",
                source_id=scene["id"],
                zone_id=zone.get("id"),
                payload=payload,
                observed_at=(scene.get("properties") or {}).get("datetime")
                or datetime.now(timezone.utc).isoformat(),
            )
            return obs
        except Exception as exc:
            logging.warning("satellite witness signing failed for zone %s: %s", zone.get("id"), exc)
            return None
    finally:
        if own_client:
            await client.aclose()


async def tick_satellite_witness(db) -> int:
    """Run one pass over all zones. Returns the number of new witnesses
    recorded — useful for the supervisor to log progress and for the
    on-demand admin trigger to report a count back to the operator."""
    zones = await db.zones.find({}, {"_id": 0}).limit(SATELLITE_MAX_ZONES_PER_TICK).to_list(SATELLITE_MAX_ZONES_PER_TICK)
    if not zones:
        return 0
    recorded = 0
    async with httpx.AsyncClient() as client:
        for zone in zones:
            obs = await record_satellite_witness(db, zone, client=client)
            if obs:
                recorded += 1
    return recorded


def is_enabled() -> bool:
    return os.environ.get("SATELLITE_WITNESS_ENABLED", "").lower() in {"1", "true", "yes"}


async def run_satellite_witness_loop(db) -> None:
    """Forever loop. Default-OFF — only starts if SATELLITE_WITNESS_ENABLED.

    Mirrors the drone simulator's supervisor pattern: each tick wrapped
    in try/except, transient failures back off to 2× the interval, the
    supervisor itself never raises so it lives for the FastAPI lifetime.
    """
    if not is_enabled():
        logging.info("satellite witness loop disabled (SATELLITE_WITNESS_ENABLED unset)")
        return
    logging.info(
        "satellite witness loop enabled — interval=%ds, max_zones_per_tick=%d",
        SATELLITE_TICK_INTERVAL_S,
        SATELLITE_MAX_ZONES_PER_TICK,
    )
    while True:
        try:
            recorded = await tick_satellite_witness(db)
            if recorded:
                logging.info("satellite witness tick: recorded %d new observation(s)", recorded)
        except Exception as exc:
            logging.warning("satellite witness tick failed: %s", exc)
            await asyncio.sleep(SATELLITE_TICK_INTERVAL_S * 2)
            continue
        await asyncio.sleep(SATELLITE_TICK_INTERVAL_S)
