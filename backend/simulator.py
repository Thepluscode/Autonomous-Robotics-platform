"""Drone movement simulator.

Pulled out of server.py so the converge-toward-zone-center loop is easy to
read and test in isolation. The two public callables (`tick_drone_simulation`
and `run_drone_simulation_loop`) take the Mongo db handle and the WebSocket
ConnectionManager explicitly so this module has no compile-time dependency
on server.py — eliminates the circular-import risk that comes with going
the other way.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone
from typing import List

# Tick cadence + per-tick movement budget. 0.05° ≈ 5km at the equator.
DRONE_TICK_INTERVAL_S = 5
DRONE_STEP_DEG = 0.05
DRONE_ARRIVED_DEG = 0.04   # within this distance the drone is "on station"
DRONE_MIN_BATTERY = 5.0


async def tick_drone_simulation(db, manager) -> List[dict]:
    """Run one simulation tick.

    Pulls drones in `patrolling` / `deployed` status, steps each toward its
    assigned zone center, drains battery proportionally to distance moved,
    persists the new state, and broadcasts the diff to all WebSocket
    clients. Returns the broadcast payload so callers (notably the
    `/api/_internal/drone-tick` endpoint) can drive the simulator
    deterministically without sleeping.
    """
    drones = await db.drones.find(
        {"status": {"$in": ["patrolling", "deployed"]}}, {"_id": 0}
    ).to_list(200)

    updates: List[dict] = []
    for drone in drones:
        target = None
        if drone.get("zone_id"):
            zone = await db.zones.find_one({"id": drone["zone_id"]}, {"_id": 0})
            if zone:
                target = (zone.get("center_lat", 0.0), zone.get("center_lng", 0.0))

        lat, lng = drone.get("latitude", 0.0), drone.get("longitude", 0.0)
        if target is None:
            # Unassigned drone: hover. (Battery still drains while hovering.)
            new_lat, new_lng, dist_moved = lat, lng, 0.0
        else:
            dlat, dlng = target[0] - lat, target[1] - lng
            dist = math.hypot(dlat, dlng)
            if dist <= DRONE_ARRIVED_DEG:
                new_lat, new_lng, dist_moved = target[0], target[1], dist
            else:
                ratio = DRONE_STEP_DEG / dist
                new_lat = lat + dlat * ratio
                new_lng = lng + dlng * ratio
                dist_moved = DRONE_STEP_DEG

        battery = max(DRONE_MIN_BATTERY, drone.get("battery", 100) - (0.05 + dist_moved * 5))
        battery = round(battery, 2)
        last_active = datetime.now(timezone.utc).isoformat()

        await db.drones.update_one(
            {"id": drone["id"]},
            {"$set": {
                "latitude": new_lat,
                "longitude": new_lng,
                "battery": battery,
                "last_active": last_active,
            }},
        )

        updates.append({
            "id": drone["id"],
            "name": drone.get("name"),
            "latitude": new_lat,
            "longitude": new_lng,
            "battery": battery,
            "status": drone.get("status"),
            "zone_id": drone.get("zone_id"),
        })

    if updates:
        await manager.broadcast({
            "type": "drone_positions",
            "drones": updates,
            "ts": datetime.now(timezone.utc).isoformat(),
        })

    return updates


async def run_drone_simulation_loop(db, manager) -> None:
    """Forever loop calling `tick_drone_simulation` every TICK_INTERVAL_S.

    Caught exceptions back off to 2× the interval so a transient Mongo blip
    doesn't tight-loop on errors. The supervisor never raises — it's
    expected to live for the lifetime of the FastAPI app.
    """
    while True:
        try:
            await tick_drone_simulation(db, manager)
        except Exception as exc:
            logging.warning("drone simulation tick failed: %s", exc)
            await asyncio.sleep(DRONE_TICK_INTERVAL_S * 2)
            continue
        await asyncio.sleep(DRONE_TICK_INTERVAL_S)
