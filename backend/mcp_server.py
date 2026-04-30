"""MCP (Model Context Protocol) surface for the autonomous robotics platform.

Mounted on the FastAPI app at ``/mcp``, this exposes the high-leverage
verbs of the platform — pick a zone, plan a mission, authorize, execute
an intervention, verify observations — as MCP tools. Any MCP-compatible
agent (Claude Desktop, Claude Code, MCP-aware GPT clients, custom
LangChain agents) can connect, discover the tool catalog, and run the
platform autonomously.

Why MCP, not just our REST API
------------------------------
The dashboard is the *debug surface*. The intended primary user of
this platform is an autonomous AI ranger that:

  pick_high_leverage_zone()
    → generate_mission(zone)
      → authorize_mission(mission)
        → execute_intervention(action, robot, zone)
          → verify_observation(after_observation_id)

…all without a human touching a UI. MCP makes that loop work for *any*
agent model, not just Claude. The dashboard remains, but it becomes
secondary.

Auth
----
Gate the entire ``/mcp`` mount with the ``MCP_API_KEY`` env var. Set
it once in Railway, share it with each agent operator, rotate by
changing the env var (Railway redeploys, old key invalidates). If
unset, the mount returns 503 to make the gap obvious — we don't want
an unprotected agent surface.

Design choices
--------------
* Tools call internal helpers via ``from server import …`` *inside* the
  tool body, not at module top. This dodges the circular import
  (server.py imports this module at the bottom; this module would
  otherwise need server's exports at import time).
* Tools are intentionally thin wrappers — every business-logic decision
  (planner, signed observation, audit trail) lives in the existing
  handlers. MCP just routes.
* If the ``mcp`` SDK is missing from the deploy, this module logs and
  exposes ``mcp_http_app = None``. Backend boot must not fail just
  because the optional MCP transport is unavailable.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

mcp_http_app = None  # ASGI app to mount on FastAPI; None when SDK is absent

try:
    from mcp.server.fastmcp import FastMCP
    _MCP_AVAILABLE = True
except ImportError as exc:
    logger.warning("mcp SDK not importable; /mcp endpoint disabled: %s", exc)
    _MCP_AVAILABLE = False


if _MCP_AVAILABLE:
    mcp = FastMCP("autonomous-robotics-platform")

    # ==================== DISCOVERY / STATUS ====================

    @mcp.tool()
    async def list_zones() -> list:
        """List every rewilding zone the platform manages, with biodiversity
        index, soil health, predator-prey balance, vegetation coverage,
        and priority. Use this first to decide which zone needs help."""
        from server import db
        return await db.zones.find({}, {"_id": 0}).to_list(1000)

    @mcp.tool()
    async def list_robots(robot_type: Optional[str] = None) -> list:
        """List robotics assets across all five domains: aerial / ground /
        aquatic / fixed_sensor / orbital. Filter by `robot_type` to scope
        to one domain. Returns autonomy level, battery, health, status,
        zone assignment, and capabilities for each."""
        from server import db
        query: dict = {}
        if robot_type:
            query["robot_type"] = robot_type
        return await db.robots.find(query, {"_id": 0}).to_list(2000)

    @mcp.tool()
    async def get_dashboard_stats() -> dict:
        """Multi-domain platform snapshot: counts by robot_type, active
        robots, zones, critical zones, sensors, unread alerts, and
        average biodiversity / soil health across all zones."""
        from server import get_dashboard_stats as _stats
        return (await _stats()).model_dump()

    @mcp.tool()
    async def pick_high_leverage_zone() -> dict:
        """Returns the zone with the lowest biodiversity index — the
        single highest-leverage target for intervention right now. Use
        this as the input to generate_mission when running an autonomous
        loop."""
        from server import db
        candidates = await db.zones.find({}, {"_id": 0}).sort("biodiversity_index", 1).limit(1).to_list(1)
        if not candidates:
            raise ValueError("no zones available")
        return candidates[0]

    # ==================== MISSION PLANNING ====================

    @mcp.tool()
    async def generate_mission(
        mission_type: str = "intervene",
        zone_id: Optional[str] = None,
        max_drones: int = 3,
        notes: str = "",
    ) -> dict:
        """Plan a multi-domain robotics mission server-side. If zone_id
        is omitted, the planner auto-picks the highest-leverage zone.
        Returns the mission with status=ready (above the go_score floor)
        or draft (below). The plan includes counterfactual trajectories
        with 80% CI bands and source_hashes referencing recent signed
        zone observations — the chart that closes the Series A.

        mission_type: patrol | inspect | intervene
        """
        from server import db, _plan_mission, _mission_audit_event, MISSION_GO_SCORE_FLOOR
        from models import Mission, MissionGenerateRequest

        req = MissionGenerateRequest(
            mission_type=mission_type, zone_id=zone_id, max_drones=max_drones, notes=notes,
        )
        user = {"id": "mcp-agent", "name": "MCP agent", "email": "mcp@platform.internal"}
        plan = await _plan_mission(req, user)
        initial_status = "ready" if plan["go_score"] >= MISSION_GO_SCORE_FLOOR else "draft"
        mission = Mission(
            **plan,
            status=initial_status,
            created_by=user["id"],
            created_by_name=user["name"],
            audit_trail=[_mission_audit_event(
                "generated", user,
                f"Plan synthesized via MCP for zone {plan['zone_name']} (go_score={plan['go_score']}).",
            )],
        )
        doc = mission.model_dump()
        for field in ("created_at", "updated_at"):
            doc[field] = doc[field].isoformat()
        await db.missions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @mcp.tool()
    async def get_mission(mission_id: str) -> dict:
        """Fetch a single mission with its full state, audit trail, and
        evidence (counterfactual trajectories + source hashes +
        attestation pointers)."""
        from server import db, _deserialize_mission
        mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
        if not mission:
            raise ValueError(f"mission {mission_id} not found")
        return _deserialize_mission(mission)

    # ==================== CLOSED-LOOP INTERVENTIONS ====================

    @mcp.tool()
    async def list_intervention_actions() -> dict:
        """Catalog of executable verbs (drop_seed_pod, deploy_predator_deterrent,
        deploy_water_sampler) with their parameter schemas. Use this to
        discover what `execute_intervention` accepts."""
        from server import INTERVENTION_ACTIONS
        return {
            "actions": [
                {"action": name, "label": spec["label"], "params_schema": spec["params_schema"]}
                for name, spec in INTERVENTION_ACTIONS.items()
            ]
        }

    @mcp.tool()
    async def execute_intervention(
        action: str,
        robot_id: str,
        zone_id: Optional[str] = None,
        params: Optional[dict] = None,
        mission_id: Optional[str] = None,
        notes: str = "",
    ) -> dict:
        """Execute one of the registered intervention verbs against a
        robot in a zone. Records a signed before/action/after triple in
        the verifiable rewilding chain. Returns the intervention with
        all three observation digests linked. Cryptographically
        defensible — Verra/Gold Standard auditors verify each digest
        offline against /.well-known/keys.json.
        """
        from server import db, INTERVENTION_ACTIONS, _validate_action_params, _zone_state_snapshot, _record_observation
        spec = INTERVENTION_ACTIONS.get(action)
        if not spec:
            raise ValueError(f"unknown action: {action}")
        robot = await db.robots.find_one({"id": robot_id}, {"_id": 0})
        if not robot:
            raise ValueError(f"robot {robot_id} not found")
        target_zone_id = zone_id or robot.get("zone_id")
        if not target_zone_id:
            raise ValueError("zone_id missing and robot has no assigned zone")
        zone = await db.zones.find_one({"id": target_zone_id}, {"_id": 0})
        if not zone:
            raise ValueError(f"zone {target_zone_id} not found")

        validated = _validate_action_params(action, params or {})
        intervention_id = __import__("uuid").uuid4().__str__()
        started = datetime.now(timezone.utc)

        before_snapshot = _zone_state_snapshot(zone)
        before_obs = await _record_observation(
            db, source_type="intervention_before", source_id=intervention_id, zone_id=target_zone_id,
            payload={"zone_state": before_snapshot, "robot_id": robot_id, "action": action, "params": validated},
            observed_at=started.isoformat(),
        )

        delta = spec["compute_zone_delta"](validated)
        zone_updates: dict = {}
        for field, increment in delta.items():
            zone_updates[field] = max(0.0, min(1.0, float(zone.get(field, 0.0)) + float(increment)))
        if zone_updates:
            await db.zones.update_one({"id": target_zone_id}, {"$set": zone_updates})
        await db.robots.update_one(
            {"id": robot_id},
            {"$set": {
                "mission_type": spec.get("robot_mission_type") or action,
                "status": "intervening",
                "last_active": datetime.now(timezone.utc).isoformat(),
            }},
        )

        action_obs = await _record_observation(
            db, source_type="intervention_action", source_id=intervention_id, zone_id=target_zone_id,
            payload={
                "action": action, "params": validated, "robot_id": robot_id,
                "robot_type": robot.get("robot_type"),
                "actor_user_id": "mcp-agent", "actor_user_name": "MCP agent",
                "delta_applied": delta, "mission_id": mission_id, "notes": notes,
            },
        )

        updated_zone = await db.zones.find_one({"id": target_zone_id}, {"_id": 0})
        after_snapshot = _zone_state_snapshot(updated_zone or zone)
        delta_observed = {k: round(after_snapshot[k] - before_snapshot[k], 4) for k in after_snapshot}
        after_obs = await _record_observation(
            db, source_type="intervention_after", source_id=intervention_id, zone_id=target_zone_id,
            payload={
                "zone_state": after_snapshot, "before_state": before_snapshot,
                "delta_observed": delta_observed, "robot_id": robot_id, "action": action,
            },
        )

        completed = datetime.now(timezone.utc)
        intervention_doc = {
            "id": intervention_id, "action": action, "robot_id": robot_id,
            "zone_id": target_zone_id, "params": validated, "mission_id": mission_id,
            "status": "completed",
            "before_observation_id": before_obs["id"], "before_digest": before_obs["digest"],
            "action_observation_id": action_obs["id"], "action_digest": action_obs["digest"],
            "after_observation_id": after_obs["id"], "after_digest": after_obs["digest"],
            "delta_applied": delta, "delta_observed": delta_observed,
            "notes": notes, "created_by": "mcp-agent", "created_by_name": "MCP agent",
            "created_at": started.isoformat(), "completed_at": completed.isoformat(),
        }
        await db.interventions.insert_one(intervention_doc)
        intervention_doc.pop("_id", None)
        return intervention_doc

    # ==================== PROVENANCE ====================

    @mcp.tool()
    async def verify_observation_by_id(observation_id: str) -> dict:
        """Fetch a signed observation by id and return whether its
        Ed25519 signature is currently valid. Use this to walk the
        before/action/after triple of an intervention or the
        source_hashes of a mission."""
        from server import db, verify_observation
        obs = await db.observations.find_one({"id": observation_id}, {"_id": 0})
        if not obs:
            raise ValueError(f"observation {observation_id} not found")
        ok, reason = verify_observation(obs)
        return {**obs, "verification": {"valid": ok, "reason": reason}}

    @mcp.tool()
    async def get_zone_attestation(zone_id: str, hours: int = 24) -> dict:
        """Aggregate root over recent signed observations for a zone
        plus the observations themselves. The standard auditor flow:
        recompute SHA-256 over sorted digests, compare to the server's
        aggregate_root, then verify each observation's signature."""
        import hashlib
        from datetime import timedelta
        from server import db, get_key_id
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=max(1, min(int(hours or 24), 24 * 30)))).isoformat()
        obs = await db.observations.find(
            {"zone_id": zone_id, "observed_at": {"$gte": cutoff}}, {"_id": 0},
        ).sort("observed_at", 1).to_list(5000)
        digests = [o["digest"] for o in obs if o.get("digest")]
        aggregate = hashlib.sha256("\n".join(sorted(digests)).encode("utf-8")).hexdigest() if digests else None
        return {
            "zone_id": zone_id, "since": cutoff, "count": len(obs),
            "aggregate_root": aggregate, "key_id": get_key_id(),
            "observations": obs,
        }

    # ==================== FORECASTING ====================

    @mcp.tool()
    async def forecast_counterfactual(
        zone_id: str, mission_type: Optional[str] = None, horizon_days: int = 14,
    ) -> dict:
        """Chart-ready counterfactual: paired no-deploy / with-deploy
        biodiversity-index trajectories with 80% CI bands. Same data
        the Mission Control launch screen renders, exposed for agent
        loops that want to compare hypothetical interventions."""
        from server import db, _counterfactual_trajectories
        zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
        if not zone:
            raise ValueError(f"zone {zone_id} not found")
        return _counterfactual_trajectories(zone, mission_type=mission_type, horizon_days=horizon_days)

    # ==================== SPECIES ====================

    @mcp.tool()
    async def identify_species_from_url(image_url: str, zone_id: Optional[str] = None) -> dict:
        """Run the species classifier (deterministic-v1 or BioCLIP if
        env-flagged) on an image URL. Output is biome-aware and writes a
        signed species_identification observation in the chain — every
        identification is independently auditable.
        """
        from server import _identify_species_from_image, db, insert_and_return
        identification = await _identify_species_from_image(image_url, zone_id)
        return await insert_and_return(db.species_identifications, identification)

    # ==================== AUTH WRAPPER + APP MOUNT ====================
    # Wrap the FastMCP-returned ASGI app with a pure-ASGI auth shim
    # rather than calling .add_middleware() — newer Starlette ASGI
    # apps coming out of FastMCP can reject add_middleware after the
    # app's been instantiated (seen in deploy as "issubclass() arg 1
    # must be a class"). Wrapping at the ASGI layer skips Starlette's
    # middleware stack entirely.

    class _MCPAuthWrapper:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            if scope.get("type") == "http":
                api_key = os.environ.get("MCP_API_KEY", "").strip()
                if not api_key:
                    await self._send_json(send, 503, {
                        "error": "MCP disabled: MCP_API_KEY not set in deploy environment",
                    })
                    return
                headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
                sent = headers.get("x-mcp-api-key", "").strip()
                if sent != api_key:
                    await self._send_json(send, 401, {
                        "error": "missing or invalid X-MCP-API-Key header",
                    })
                    return
            await self.app(scope, receive, send)

        @staticmethod
        async def _send_json(send, status: int, body: dict):
            import json as _json
            payload = _json.dumps(body).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode()),
                ],
            })
            await send({"type": "http.response.body", "body": payload})

    # Newer FastMCP exposes streamable_http_app(); older versions use sse_app().
    _inner_app = None
    try:
        _inner_app = mcp.streamable_http_app()
    except AttributeError:
        try:
            _inner_app = mcp.sse_app()
        except AttributeError as exc:
            logger.warning("FastMCP has no HTTP transport method: %s", exc)
            _inner_app = None

    if _inner_app is not None:
        mcp_http_app = _MCPAuthWrapper(_inner_app)
