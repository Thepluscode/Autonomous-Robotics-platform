from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=True)

from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Request, Response, Depends, Path, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from bson import ObjectId

# Mongo `_id` leak hardening — `motor.insert_one(doc)` mutates `doc` to add a
# non-JSON-serializable ObjectId. Routes that returned that dict used to 500.
# Patching insert_one once at import time pops `_id` after every insert, so
# every write site is safe by default. The `insert_and_return` helper below
# is preserved as belt-and-suspenders / documented pattern.
_orig_insert_one = AsyncIOMotorCollection.insert_one
async def _safe_insert_one(self, document, *args, **kwargs):  # type: ignore[override]
    result = await _orig_insert_one(self, document, *args, **kwargs)
    if isinstance(document, dict):
        document.pop("_id", None)
    return result
AsyncIOMotorCollection.insert_one = _safe_insert_one  # type: ignore[assignment]
import os
import json
import hashlib
import logging
import asyncio
import secrets
import bcrypt
import jwt
import base64
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import random
import math
from emergentintegrations.llm.chat import LlmChat, UserMessage
from provenance import (
    get_key_id,
    public_key_jwk,
    record_observation as _record_observation,
    sign_observation,
    verify_observation,
)
from species_id import identifier_info, identify_species as _identify_species
from simulator import (
    tick_drone_simulation,
    run_drone_simulation_loop,
    DRONE_TICK_INTERVAL_S,
    DRONE_STEP_DEG,
    DRONE_ARRIVED_DEG,
    DRONE_MIN_BATTERY,
)
# Star-import the Pydantic models so route handlers below can keep using
# them by bare name (Drone, Zone, etc.) instead of `models.Drone`. New
# request/response models go in models.py, not here.
# Explicit imports (no star) so static analysis — IDE go-to-definition,
# refactor tools, and the graphify knowledge graph — can resolve the
# server↔models contract. The previous `from models import *` made every
# model invisible to AST-based tooling. If you add a new model and need
# it in server.py, add it to this list.
from models import (
    AIAnalysisRequest,
    AIAnalysisResponse,
    Alert,
    AlertCreate,
    Comment,
    DashboardStats,
    DeployMissionRequest,
    Drone,
    DroneCreate,
    DroneUpdate,
    EcosystemForecast,
    ForgotPassword,
    Geofence,
    GeofenceCreate,
    Intervention,
    InterventionExecuteRequest,
    InterventionRule,
    InterventionRuleCreate,
    Mission,
    MissionAbortRequest,
    MissionGenerateRequest,
    Observation,
    PasswordReset,
    PatrolReport,
    PatrolSchedule,
    PatrolScheduleCreate,
    PatrolScheduleUpdate,
    Robot,
    RobotCreate,
    RobotDeployRequest,
    RobotTaskRequest,
    RobotUpdate,
    Sensor,
    SensorCreate,
    SpeciesUploadRequest,
    Task,
    TaskCreate,
    UserLogin,
    UserRegister,
    Zone,
    ZoneCreate,
    ZoneUpdate,
)

# Centralized LLM-chat builder. Reads provider/model from env at *call time*
# (not module import) so a `.env` reload — or test-injected env override — is
# picked up without restarting the worker. Replaces the previous scattered
# `.with_model("openai", "gpt-5.2")` calls (which used an alias that doesn't
# exist on real provider APIs and forced every request into the offline path).
def make_llm_chat(session_id: str, system_message: str) -> LlmChat:
    provider = os.environ.get("LLM_PROVIDER", "openai").lower()
    model = os.environ.get("LLM_MODEL", "")  # blank → LlmChat applies provider default
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(provider, model)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Configuration
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback-secret-key')
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@ecosystem.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
_frontend_url_env = os.environ.get("FRONTEND_URL", "")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "").lower() in {"1", "true", "yes"} or "https://" in _frontend_url_env
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none" if COOKIE_SECURE else "lax").lower()

app = FastAPI(title="Autonomous Ecosystem Architect API")
api_router = APIRouter(prefix="/api")

# ==================== AUTHENTICATION HELPERS ====================

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_access_cookie(response: Response, access_token: str):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=3600,
        path="/",
    )

def set_refresh_cookie(response: Response, refresh_token: str):
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=604800,
        path="/",
    )

def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    set_access_cookie(response, access_token)
    set_refresh_cookie(response, refresh_token)

def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/", secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)
    response.delete_cookie("refresh_token", path="/", secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        del user["_id"]
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

def require_role(allowed_roles: List[str]):
    async def role_checker(request: Request):
        user = await get_current_user(request)
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker

# Role permissions
ROLE_PERMISSIONS = {
    "admin": ["all"],
    "field_operator": ["drones", "patrols", "feeds", "zones"],
    "scientist": ["analytics", "species", "reports", "ai"],
    "viewer": ["dashboard", "map"]
}

# ==================== AUTH MODELS — moved to models.py ====================

# ==================== WEBSOCKET MANAGER ====================

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

# ==================== ENTITY/REQUEST/RESPONSE MODELS — moved to models.py ====================

# ==================== HELPER FUNCTIONS ====================

def serialize_datetime(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj

async def insert_and_return(collection, doc: dict) -> dict:
    """Insert `doc` and return a JSON-safe snapshot taken before the call.

    `motor.insert_one` mutates the dict by attaching a non-JSON-serializable
    Mongo `_id`. Returning the original `doc` after insertion would 500 the
    response — this helper is the codified pattern for every write endpoint.
    """
    snapshot = dict(doc)
    await collection.insert_one(doc)
    return snapshot

def deserialize_datetime(obj, fields):
    for field in fields:
        if field in obj and isinstance(obj[field], str):
            try:
                obj[field] = datetime.fromisoformat(obj[field].replace('Z', '+00:00'))
            except:
                pass
    return obj

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserRegister, response: Response):
    email = user_data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Only admin can create admin/field_operator roles
    if user_data.role in ["admin", "field_operator"]:
        user_data.role = "viewer"
    
    user_doc = {
        "email": email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": user_data.role,
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email, user_data.role)
    refresh_token = create_refresh_token(user_id)
    
    set_auth_cookies(response, access_token, refresh_token)
    
    return {"id": user_id, "email": email, "name": user_data.name, "role": user_data.role, "access_token": access_token, "refresh_token": refresh_token}

@api_router.post("/auth/login")
async def login(credentials: UserLogin, request: Request, response: Response):
    email = credentials.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    
    # Check brute force
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = attempts.get("lockout_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
    
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        # Increment failed attempts
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Clear failed attempts
    await db.login_attempts.delete_one({"identifier": identifier})
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email, user["role"])
    refresh_token = create_refresh_token(user_id)
    
    set_auth_cookies(response, access_token, refresh_token)
    
    # Log audit
    await db.audit_logs.insert_one({
        "user_id": user_id,
        "action": "login",
        "timestamp": datetime.now(timezone.utc),
        "ip": ip
    })
    
    return {"id": user_id, "email": email, "name": user["name"], "role": user["role"], "access_token": access_token, "refresh_token": refresh_token}

@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        # Also check Authorization header or request body for refresh token
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Refresh "):
            token = auth_header[8:]
        if not token:
            # Check X-Refresh-Token header
            token = request.headers.get("X-Refresh-Token", "")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"], user["role"])
        set_access_cookie(response, access_token)
        
        return {"message": "Token refreshed", "access_token": access_token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPassword):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user:
        return {"message": "If email exists, reset link sent"}
    
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "user_id": str(user["_id"]),
        "token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used": False
    })
    
    logging.info(f"Password reset token for {data.email}: {token}")
    return {"message": "If email exists, reset link sent", "token": token}

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordReset):
    token_doc = await db.password_reset_tokens.find_one({"token": data.token, "used": False})
    if not token_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    if datetime.now(timezone.utc) > token_doc["expires_at"]:
        raise HTTPException(status_code=400, detail="Token expired")
    
    await db.users.update_one(
        {"_id": ObjectId(token_doc["user_id"])},
        {"$set": {"password_hash": hash_password(data.new_password)}}
    )
    await db.password_reset_tokens.update_one({"token": data.token}, {"$set": {"used": True}})
    
    return {"message": "Password reset successfully"}

@api_router.get("/auth/users")
async def get_users(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    users = await db.users.find({}, {"password_hash": 0}).to_list(100)
    for u in users:
        u["id"] = str(u["_id"])
        del u["_id"]
    return users

@api_router.put("/auth/users/{user_id}/role")
async def update_user_role(user_id: str, role: str, request: Request):
    admin = await get_current_user(request)
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    if role not in ["admin", "field_operator", "scientist", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": role}})
    return {"message": "Role updated"}

# ==================== WEATHER ENDPOINTS (MOCKED) ====================

def generate_mock_weather(zone: dict) -> dict:
    """Generate realistic mock weather based on zone type"""
    zone_type = zone.get("zone_type", "forest")
    lat = zone.get("center_lat", 0)
    
    # Base temperature by latitude
    base_temp = 25 - abs(lat) * 0.5
    
    # Adjust by zone type
    type_adjustments = {
        "forest": {"temp": -2, "humidity": 75, "conditions": ["Partly Cloudy", "Cloudy", "Light Rain"]},
        "wetland": {"temp": -1, "humidity": 85, "conditions": ["Foggy", "Cloudy", "Rainy"]},
        "grassland": {"temp": 2, "humidity": 50, "conditions": ["Sunny", "Partly Cloudy", "Windy"]},
        "coastal": {"temp": 0, "humidity": 70, "conditions": ["Partly Cloudy", "Windy", "Clear"]},
        "desert": {"temp": 10, "humidity": 20, "conditions": ["Sunny", "Clear", "Hot"]}
    }
    
    adj = type_adjustments.get(zone_type, type_adjustments["forest"])
    temp = base_temp + adj["temp"] + random.uniform(-3, 3)
    humidity = adj["humidity"] + random.uniform(-10, 10)
    
    # Generate 7-day forecast
    forecast = []
    for i in range(1, 8):
        forecast.append({
            "day": i,
            "date": (datetime.now() + timedelta(days=i)).strftime("%Y-%m-%d"),
            "temp_high": round(temp + random.uniform(2, 5), 1),
            "temp_low": round(temp - random.uniform(3, 8), 1),
            "humidity": round(humidity + random.uniform(-5, 5)),
            "conditions": random.choice(adj["conditions"]),
            "precipitation_chance": random.randint(0, 60)
        })
    
    return {
        "zone_id": zone["id"],
        "zone_name": zone["name"],
        "temperature": round(temp, 1),
        "humidity": round(humidity),
        "wind_speed": round(random.uniform(5, 25), 1),
        "conditions": random.choice(adj["conditions"]),
        "forecast": forecast,
        "last_updated": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/weather")
async def get_all_weather():
    """Get weather for all zones (MOCKED)"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(100)
    weather_data = []
    for zone in zones:
        weather_data.append(generate_mock_weather(zone))
    return weather_data

@api_router.get("/weather/{zone_id}")
async def get_zone_weather(zone_id: str):
    """Get weather for specific zone (MOCKED)"""
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return generate_mock_weather(zone)

# ==================== INTERVENTION RULES ENDPOINTS ====================

@api_router.get("/interventions/rules")
async def get_intervention_rules():
    rules = await db.intervention_rules.find({}, {"_id": 0}).to_list(100)
    return rules

@api_router.post("/interventions/rules")
async def create_intervention_rule(rule: InterventionRuleCreate, request: Request):
    user = await get_current_user(request)
    if user.get("role") not in ["admin", "scientist"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    rule_doc = InterventionRule(
        **rule.model_dump(),
        created_by=user.get("id")
    ).model_dump()
    rule_doc["created_at"] = rule_doc["created_at"].isoformat()
    await db.intervention_rules.insert_one(rule_doc)
    return rule_doc

@api_router.delete("/interventions/rules/{rule_id}")
async def delete_intervention_rule(rule_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await db.intervention_rules.delete_one({"id": rule_id})
    return {"message": "Rule deleted"}

@api_router.post("/interventions/check")
async def check_interventions():
    """Check all intervention rules and trigger actions"""
    rules = await db.intervention_rules.find({"is_active": True}, {"_id": 0}).to_list(100)
    zones = await db.zones.find({}, {"_id": 0}).to_list(100)
    
    triggered = []
    
    for rule in rules:
        condition_type = rule.get("condition_type")
        operator = rule.get("condition_operator")
        threshold = rule.get("condition_value")
        
        for zone in zones:
            value = zone.get(condition_type, 0.5)
            
            triggered_flag = False
            if operator == "lt" and value < threshold:
                triggered_flag = True
            elif operator == "gt" and value > threshold:
                triggered_flag = True
            elif operator == "eq" and abs(value - threshold) < 0.01:
                triggered_flag = True
            
            if triggered_flag:
                action_type = rule.get("action_type")
                
                # Create alert
                alert = Alert(
                    title=f"Intervention Triggered: {rule['name']}",
                    message=f"Zone '{zone['name']}' triggered rule: {condition_type} {operator} {threshold} (current: {value:.2f})",
                    severity="warning",
                    zone_id=zone["id"],
                    alert_type="intervention"
                )
                alert_doc = alert.model_dump()
                alert_doc["created_at"] = alert_doc["created_at"].isoformat()
                await db.alerts.insert_one(alert_doc)
                
                triggered.append({
                    "rule": rule["name"],
                    "zone": zone["name"],
                    "action": action_type,
                    "value": value
                })
    
    return {"triggered_count": len(triggered), "interventions": triggered}


# ==================== CLOSED-LOOP INTERVENTIONS ====================
# The verb layer. /interventions/rules + /check above are the trigger
# system; what follows is direct invocation: "do X on zone Y with robot
# Z, sign the before/action/after triple, link them in the chain." This
# is what makes a restoration claim cryptographically defensible —
# without before, you can't prove the zone was degraded; without action,
# you can't prove what was done; without after, you can't prove anything
# changed. All three are signed by the same Ed25519 key as drone
# telemetry and species identifications.

# UUID pattern. Defined locally because the global _UUID_ID_PATTERN
# is registered later in the file (after the robot block) and the
# closed-loop intervention routes need the constraint at import time.
_INTERVENTION_ID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"

INTERVENTION_ACTIONS = {
    "drop_seed_pod": {
        "label": "Drop seed pod",
        "params_schema": {
            "seed_mix_kg": {"type": "number", "min": 0.1, "max": 50.0, "default": 1.0},
        },
        # Capped so absurd payloads can't move the index by 100% in one call;
        # the audit chain stays trustworthy under operator error.
        "compute_zone_delta": lambda params: {
            "biodiversity_index": round(min(0.05, max(0.0, 0.002 * float(params.get("seed_mix_kg", 1.0)))), 4),
            "vegetation_coverage": round(min(0.05, max(0.0, 0.001 * float(params.get("seed_mix_kg", 1.0)))), 4),
        },
        "robot_mission_type": "seed_dispersal",
    },
    "deploy_predator_deterrent": {
        "label": "Deploy predator deterrent",
        "params_schema": {
            "duration_min": {"type": "number", "min": 5, "max": 240, "default": 60},
        },
        "compute_zone_delta": lambda params: {
            "predator_prey_balance": round(min(0.03, max(0.0, 0.0005 * float(params.get("duration_min", 60)))), 4),
        },
        "robot_mission_type": "predator_deterrence",
    },
    "deploy_water_sampler": {
        "label": "Deploy water sampler",
        "params_schema": {
            "samples": {"type": "number", "min": 1, "max": 24, "default": 4},
        },
        "compute_zone_delta": lambda params: {
            "soil_health": round(min(0.02, max(0.0, 0.001 * float(params.get("samples", 4)))), 4),
        },
        "robot_mission_type": "water_sampling",
    },
}


def _validate_action_params(action: str, params: dict) -> dict:
    spec = INTERVENTION_ACTIONS.get(action)
    if not spec:
        raise HTTPException(status_code=422, detail=f"unknown action: {action}")
    schema = spec.get("params_schema", {})
    out: dict = {}
    raw = params or {}
    for name, rule in schema.items():
        val = raw.get(name, rule.get("default"))
        if val is None:
            raise HTTPException(status_code=422, detail=f"missing param: {name}")
        if rule.get("type") == "number":
            try:
                val = float(val)
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail=f"param {name} must be a number")
            lo, hi = rule.get("min"), rule.get("max")
            if lo is not None and val < lo:
                raise HTTPException(status_code=422, detail=f"param {name} below min ({lo})")
            if hi is not None and val > hi:
                raise HTTPException(status_code=422, detail=f"param {name} above max ({hi})")
        out[name] = val
    return out


def _zone_state_snapshot(zone: dict) -> dict:
    return {
        "biodiversity_index": float(zone.get("biodiversity_index", 0.0)),
        "soil_health": float(zone.get("soil_health", 0.0)),
        "predator_prey_balance": float(zone.get("predator_prey_balance", 0.0)),
        "vegetation_coverage": float(zone.get("vegetation_coverage", 0.0)),
    }


@api_router.get("/interventions/actions")
async def list_intervention_actions():
    """Catalog of executable verbs. Frontend / MCP agents introspect
    this to know what `/interventions/execute` accepts."""
    return {
        "actions": [
            {"action": name, "label": spec["label"], "params_schema": spec["params_schema"]}
            for name, spec in INTERVENTION_ACTIONS.items()
        ]
    }


@api_router.post("/interventions/execute")
async def execute_intervention(req: InterventionExecuteRequest, request: Request):
    user = await get_current_user(request)
    spec = INTERVENTION_ACTIONS.get(req.action)
    if not spec:
        raise HTTPException(status_code=422, detail=f"unknown action: {req.action}")

    robot = await db.robots.find_one({"id": req.robot_id}, {"_id": 0})
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")

    zone_id = req.zone_id or robot.get("zone_id")
    if not zone_id:
        raise HTTPException(status_code=422, detail="zone_id missing and robot has no assigned zone")

    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    params = _validate_action_params(req.action, req.params or {})

    intervention_id = str(uuid.uuid4())
    started = datetime.now(timezone.utc)

    # 1. before-state observation (signed). Captures the zone state the
    # operator/agent is about to mutate. Without this, "we improved
    # biodiversity" is unprovable.
    before_snapshot = _zone_state_snapshot(zone)
    before_obs = await _record_observation(
        db,
        source_type="intervention_before",
        source_id=intervention_id,
        zone_id=zone_id,
        payload={
            "zone_state": before_snapshot,
            "robot_id": req.robot_id,
            "robot_type": robot.get("robot_type"),
            "action": req.action,
            "params": params,
        },
        observed_at=started.isoformat(),
    )

    # 2. apply the action — zone state delta + robot status update.
    delta = spec["compute_zone_delta"](params)
    zone_updates: dict = {}
    for field, increment in delta.items():
        new_val = max(0.0, min(1.0, float(zone.get(field, 0.0)) + float(increment)))
        zone_updates[field] = new_val
    if zone_updates:
        await db.zones.update_one({"id": zone_id}, {"$set": zone_updates})

    new_mission_type = spec.get("robot_mission_type") or req.action
    await db.robots.update_one(
        {"id": req.robot_id},
        {"$set": {
            "mission_type": new_mission_type,
            "status": "intervening",
            "last_active": datetime.now(timezone.utc).isoformat(),
        }},
    )

    # 3. action observation (signed). The verb itself: who did what,
    # where, with what parameters, attributed to the operator/agent.
    action_obs = await _record_observation(
        db,
        source_type="intervention_action",
        source_id=intervention_id,
        zone_id=zone_id,
        payload={
            "action": req.action,
            "params": params,
            "robot_id": req.robot_id,
            "robot_type": robot.get("robot_type"),
            "actor_user_id": user.get("id"),
            "actor_user_name": user.get("name") or user.get("email"),
            "delta_applied": delta,
            "mission_id": req.mission_id,
            "notes": req.notes,
        },
    )

    # 4. after-state observation (signed). Captures the zone state post-
    # mutation, including the *observed* delta so an auditor can compare
    # delta_applied (intent) against delta_observed (effect).
    updated_zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    after_snapshot = _zone_state_snapshot(updated_zone or zone)
    delta_observed = {k: round(after_snapshot[k] - before_snapshot[k], 4) for k in after_snapshot}
    after_obs = await _record_observation(
        db,
        source_type="intervention_after",
        source_id=intervention_id,
        zone_id=zone_id,
        payload={
            "zone_state": after_snapshot,
            "before_state": before_snapshot,
            "delta_observed": delta_observed,
            "robot_id": req.robot_id,
            "action": req.action,
        },
    )

    # 5. persist the intervention record linking the three digests.
    completed = datetime.now(timezone.utc)
    intervention_doc = {
        "id": intervention_id,
        "action": req.action,
        "robot_id": req.robot_id,
        "zone_id": zone_id,
        "params": params,
        "mission_id": req.mission_id,
        "status": "completed",
        "before_observation_id": before_obs["id"],
        "before_digest": before_obs["digest"],
        "action_observation_id": action_obs["id"],
        "action_digest": action_obs["digest"],
        "after_observation_id": after_obs["id"],
        "after_digest": after_obs["digest"],
        "delta_applied": delta,
        "delta_observed": delta_observed,
        "notes": req.notes,
        "created_by": user.get("id"),
        "created_by_name": user.get("name") or user.get("email"),
        "created_at": started.isoformat(),
        "completed_at": completed.isoformat(),
    }
    await db.interventions.insert_one(intervention_doc)
    intervention_doc.pop("_id", None)

    return intervention_doc


@api_router.get("/interventions")
async def list_interventions(
    zone_id: Optional[str] = None,
    robot_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 50,
):
    query: dict = {}
    if zone_id:
        query["zone_id"] = zone_id
    if robot_id:
        query["robot_id"] = robot_id
    if action:
        query["action"] = action
    cap = max(1, min(int(limit or 50), 500))
    return await db.interventions.find(query, {"_id": 0}).sort("created_at", -1).limit(cap).to_list(cap)


@api_router.get("/interventions/{intervention_id}")
async def get_intervention(intervention_id: str = Path(..., pattern=_INTERVENTION_ID_PATTERN)):
    """Returns the intervention record plus cryptographic verification
    of all three linked observations. Auditor flow: GET this → confirm
    the three observation IDs match the digests → verify each via
    /api/observations/verify or /.well-known/keys.json."""
    doc = await db.interventions.find_one({"id": intervention_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Intervention not found")
    obs_ids = [doc.get("before_observation_id"), doc.get("action_observation_id"), doc.get("after_observation_id")]
    verifications = []
    for label, oid in zip(("before", "action", "after"), obs_ids):
        if not oid:
            continue
        o = await db.observations.find_one({"id": oid}, {"_id": 0})
        if not o:
            verifications.append({"phase": label, "observation_id": oid, "valid": False, "reason": "observation_missing"})
            continue
        ok, reason = verify_observation(o)
        verifications.append({"phase": label, "observation_id": oid, "valid": ok, "reason": reason, "digest": o.get("digest")})
    return {**doc, "verifications": verifications}


# ==================== FORECASTING ENDPOINTS ====================

@api_router.post("/forecasts/generate/{zone_id}")
async def generate_forecast(zone_id: str):
    """Generate ecosystem forecast for a zone using AI"""
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    # Get historical data (simulated)
    current_biodiversity = zone.get("biodiversity_index", 0.5)
    current_soil = zone.get("soil_health", 0.5)
    
    # Generate predictions using trend analysis
    def predict_trend(current_value, zone_type):
        # Simulate different trends based on zone priority
        priority = zone.get("priority", "medium")
        base_change = {"critical": -0.02, "high": -0.01, "medium": 0.005, "low": 0.01}
        
        predictions = []
        value = current_value
        for days in [30, 60, 90]:
            change = base_change.get(priority, 0) * (days / 30) + random.uniform(-0.05, 0.05)
            predicted = max(0, min(1, value + change))
            confidence = 0.9 - (days / 300)  # Confidence decreases with time
            predictions.append({
                "days": days,
                "value": round(predicted, 3),
                "confidence": round(confidence, 2)
            })
            value = predicted
        
        # Determine trend
        if predictions[-1]["value"] > current_value + 0.05:
            trend = "improving"
        elif predictions[-1]["value"] < current_value - 0.05:
            trend = "declining"
        else:
            trend = "stable"
        
        # Risk level
        final_value = predictions[-1]["value"]
        if final_value < 0.3:
            risk = "critical"
        elif final_value < 0.5:
            risk = "high"
        elif final_value < 0.7:
            risk = "medium"
        else:
            risk = "low"
        
        return predictions, trend, risk
    
    bio_predictions, bio_trend, bio_risk = predict_trend(current_biodiversity, zone.get("zone_type"))
    soil_predictions, soil_trend, soil_risk = predict_trend(current_soil, zone.get("zone_type"))
    
    # Generate AI analysis
    ai_analysis = ""
    try:
        context = f"""Analyze ecosystem forecast for {zone['name']} ({zone.get('zone_type', 'unknown')} zone):
- Current biodiversity: {current_biodiversity:.2f}, predicted 90-day: {bio_predictions[-1]['value']:.2f}, trend: {bio_trend}
- Current soil health: {current_soil:.2f}, predicted 90-day: {soil_predictions[-1]['value']:.2f}, trend: {soil_trend}
- Zone priority: {zone.get('priority', 'medium')}

Provide 2-3 sentence summary with key recommendations."""

        chat = make_llm_chat(
            session_id=f"forecast-{uuid.uuid4()}",
            system_message="You are an ecosystem forecasting AI. Be concise.",
        )
        ai_analysis = await chat.send_message(UserMessage(text=context))
    except Exception as e:
        logging.error(f"Forecast AI error: {e}")
        ai_analysis = f"Ecosystem forecast shows {bio_trend} biodiversity trend and {soil_trend} soil health trend. Risk level: {bio_risk}."
    
    # Store forecasts
    forecasts = []
    for forecast_type, predictions, trend, risk, current in [
        ("biodiversity", bio_predictions, bio_trend, bio_risk, current_biodiversity),
        ("soil_health", soil_predictions, soil_trend, soil_risk, current_soil)
    ]:
        forecast = EcosystemForecast(
            zone_id=zone_id,
            zone_name=zone["name"],
            forecast_type=forecast_type,
            current_value=current,
            predictions=predictions,
            trend=trend,
            risk_level=risk,
            ai_analysis=ai_analysis if forecast_type == "biodiversity" else ""
        )
        doc = forecast.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        forecasts.append(await insert_and_return(db.forecasts, doc))
    
    return forecasts

@api_router.get("/forecasts")
async def get_forecasts():
    forecasts = await db.forecasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return forecasts

@api_router.get("/forecasts/{zone_id}")
async def get_zone_forecasts(zone_id: str):
    forecasts = await db.forecasts.find({"zone_id": zone_id}, {"_id": 0}).sort("created_at", -1).to_list(10)
    return forecasts


@api_router.post("/forecasts/counterfactual/{zone_id}")
async def counterfactual_forecast(
    zone_id: str,
    mission_type: Optional[str] = None,
    horizon_days: int = 14,
):
    """Chart-ready counterfactual: paired no-deploy / with-deploy biodiversity
    trajectories with 80% confidence bands.

    The Mission Control UI renders this as a dual-line chart with shaded CI.
    The same helper drives the planner's `evidence.counterfactual.trajectories`
    so the chart on the launch screen and the standalone view are *the same*
    numbers, by construction.
    """
    if horizon_days < 1 or horizon_days > 90:
        raise HTTPException(status_code=422, detail="horizon_days must be in [1, 90]")
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return _counterfactual_trajectories(zone, mission_type=mission_type, horizon_days=horizon_days)

# ==================== GEOFENCING ENDPOINTS ====================

@api_router.get("/geofences")
async def get_geofences():
    geofences = await db.geofences.find({}, {"_id": 0}).to_list(100)
    return geofences

@api_router.post("/geofences")
async def create_geofence(geofence: GeofenceCreate, request: Request):
    user = await get_current_user(request)
    if user.get("role") not in ["admin", "field_operator"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    fence = Geofence(**geofence.model_dump())
    doc = fence.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    return await insert_and_return(db.geofences, doc)

@api_router.delete("/geofences/{fence_id}")
async def delete_geofence(fence_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await db.geofences.delete_one({"id": fence_id})
    return {"message": "Geofence deleted"}

@api_router.post("/geofences/check")
async def check_geofence_violations():
    """Check if any drones are violating geofences"""
    geofences = await db.geofences.find({"alerts_enabled": True}, {"_id": 0}).to_list(100)
    drones = await db.drones.find({"status": {"$in": ["deployed", "patrolling"]}}, {"_id": 0}).to_list(100)
    
    violations = []
    
    for fence in geofences:
        fence_lat = fence.get("center_lat", 0)
        fence_lng = fence.get("center_lng", 0)
        fence_radius = fence.get("radius_km", 1)
        
        for drone in drones:
            drone_lat = drone.get("latitude", 0)
            drone_lng = drone.get("longitude", 0)
            
            # Calculate distance (simplified)
            distance = math.sqrt((drone_lat - fence_lat)**2 + (drone_lng - fence_lng)**2) * 111
            
            if distance < fence_radius:
                # Drone is inside geofence
                if fence.get("fence_type") == "restricted":
                    violations.append({
                        "drone_id": drone["id"],
                        "drone_name": drone["name"],
                        "geofence_id": fence["id"],
                        "geofence_name": fence["name"],
                        "type": "restricted_zone_entry"
                    })
    
    # Create alerts for violations
    for v in violations:
        alert = Alert(
            title=f"Geofence Violation: {v['drone_name']}",
            message=f"Drone entered restricted zone: {v['geofence_name']}",
            severity="warning",
            drone_id=v["drone_id"],          # legacy
            asset_id=v["drone_id"],          # multi-domain
            asset_type="aerial",             # geofence sweep is aerial-only today
            alert_type="geofence"
        )
        alert_doc = alert.model_dump()
        alert_doc["created_at"] = alert_doc["created_at"].isoformat()
        await db.alerts.insert_one(alert_doc)
    
    return {"violations": violations}

# ==================== TEAM/COLLABORATION ENDPOINTS ====================

@api_router.get("/tasks")
async def get_tasks(request: Request):
    user = await get_current_user(request)
    tasks = await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tasks

@api_router.post("/tasks")
async def create_task(task: TaskCreate, request: Request):
    user = await get_current_user(request)
    
    task_doc = Task(
        **task.model_dump(exclude={"due_date"}),
        due_date=datetime.fromisoformat(task.due_date) if task.due_date else None,
        created_by=user.get("id")
    ).model_dump()
    task_doc["created_at"] = task_doc["created_at"].isoformat()
    if task_doc.get("due_date"):
        task_doc["due_date"] = task_doc["due_date"].isoformat()
    await db.tasks.insert_one(task_doc)
    return task_doc

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, status: str, request: Request):
    user = await get_current_user(request)
    await db.tasks.update_one({"id": task_id}, {"$set": {"status": status}})
    return {"message": "Task updated"}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, request: Request):
    user = await get_current_user(request)
    await db.tasks.delete_one({"id": task_id})
    return {"message": "Task deleted"}

@api_router.get("/comments/{entity_type}/{entity_id}")
async def get_comments(entity_type: str, entity_id: str):
    comments = await db.comments.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return comments

@api_router.post("/comments")
async def create_comment(entity_type: str, entity_id: str, content: str, request: Request):
    user = await get_current_user(request)
    
    comment = Comment(
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user.get("id"),
        user_name=user.get("name"),
        content=content
    )
    doc = comment.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    return await insert_and_return(db.comments, doc)

# ==================== REPORTING ENDPOINTS ====================

@api_router.get("/reports/export/{report_type}")
async def export_report(report_type: str, format: str = "json"):
    """Export data as JSON (CSV/PDF would need additional libraries)"""
    
    if report_type == "zones":
        data = await db.zones.find({}, {"_id": 0}).to_list(1000)
    elif report_type == "drones":
        data = await db.drones.find({}, {"_id": 0}).to_list(1000)
    elif report_type == "patrols":
        data = await db.patrol_schedules.find({}, {"_id": 0}).to_list(1000)
    elif report_type == "species":
        data = await db.species_identifications.find({}, {"_id": 0}).to_list(1000)
    elif report_type == "alerts":
        data = await db.alerts.find({}, {"_id": 0}).to_list(1000)
    else:
        raise HTTPException(status_code=400, detail="Invalid report type")
    
    if format == "csv":
        if not data:
            return {"csv": ""}
        import csv
        import io
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        for row in data:
            # Flatten complex fields
            flat_row = {}
            for k, v in row.items():
                if isinstance(v, (list, dict)):
                    flat_row[k] = str(v)
                else:
                    flat_row[k] = v
            writer.writerow(flat_row)
        return {"csv": output.getvalue(), "filename": f"{report_type}_export.csv"}
    
    return {"data": data, "count": len(data)}

@api_router.get("/reports/summary")
async def get_summary_report():
    """Generate comprehensive summary report"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(100)
    drones = await db.drones.find({}, {"_id": 0}).to_list(100)
    patrols = await db.patrol_schedules.find({}, {"_id": 0}).to_list(100)
    species = await db.species_identifications.find({}, {"_id": 0}).to_list(100)
    alerts = await db.alerts.find({"is_read": False}, {"_id": 0}).to_list(100)
    
    avg_biodiversity = sum(z.get("biodiversity_index", 0) for z in zones) / max(len(zones), 1)
    avg_soil = sum(z.get("soil_health", 0) for z in zones) / max(len(zones), 1)
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_zones": len(zones),
            "critical_zones": len([z for z in zones if z.get("priority") == "critical"]),
            "total_drones": len(drones),
            "active_drones": len([d for d in drones if d.get("status") in ["deployed", "patrolling"]]),
            "total_patrols": len(patrols),
            "active_patrols": len([p for p in patrols if p.get("status") == "active"]),
            "species_identified": len(species),
            "pending_alerts": len(alerts)
        },
        "ecosystem_health": {
            "average_biodiversity": round(avg_biodiversity, 3),
            "average_soil_health": round(avg_soil, 3),
            "zones_below_threshold": len([z for z in zones if z.get("biodiversity_index", 0) < 0.4])
        },
        "recent_activity": {
            "patrols_completed_today": len([p for p in patrols if p.get("status") == "completed"]),
            "alerts_today": len([a for a in alerts if a.get("created_at", "").startswith(datetime.now().strftime("%Y-%m-%d"))])
        }
    }

# ==================== PUBLIC DASHBOARD ENDPOINTS ====================

@api_router.get("/public/dashboard")
async def get_public_dashboard():
    """Public read-only dashboard data"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(100)
    
    avg_biodiversity = sum(z.get("biodiversity_index", 0) for z in zones) / max(len(zones), 1)
    avg_soil = sum(z.get("soil_health", 0) for z in zones) / max(len(zones), 1)
    
    return {
        "overview": {
            "total_monitored_zones": len(zones),
            "average_biodiversity_index": round(avg_biodiversity * 100, 1),
            "average_soil_health": round(avg_soil * 100, 1),
            "ecosystem_status": "Healthy" if avg_biodiversity > 0.6 else "Needs Attention" if avg_biodiversity > 0.4 else "Critical"
        },
        "zone_summary": [
            {
                "name": z["name"],
                "type": z.get("zone_type", "unknown"),
                "biodiversity": round(z.get("biodiversity_index", 0) * 100, 1),
                "status": z.get("priority", "medium")
            }
            for z in zones[:10]
        ],
        "last_updated": datetime.now(timezone.utc).isoformat()
    }

# ==================== ROBOTICS ASSET ENDPOINTS ====================

_UUID_ID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
ROBOT_TYPES = {"aerial", "ground", "aquatic", "fixed_sensor", "orbital"}


def _normalize_robot_type(robot_type: str) -> str:
    normalized = (robot_type or "").strip().lower()
    if normalized not in ROBOT_TYPES:
        raise HTTPException(status_code=422, detail=f"robot_type must be one of: {', '.join(sorted(ROBOT_TYPES))}")
    return normalized


def _deserialize_robot(robot: dict) -> dict:
    deserialize_datetime(robot, ["created_at", "last_active"])
    return robot


@api_router.get("/robots", response_model=List[Robot])
async def get_robots(robot_type: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if robot_type:
        query["robot_type"] = _normalize_robot_type(robot_type)
    if status:
        query["status"] = status

    robots = await db.robots.find(query, {"_id": 0}).to_list(1000)
    return [_deserialize_robot(robot) for robot in robots]


# Multi-domain feeds — analog of /drones/feeds for the generic robotics fleet.
# Registered before /robots/{robot_id}; the UUID Path regex on that route
# also defends against the literal "feeds" being captured as a robot_id, but
# routing this explicitly keeps semantics obvious.
_ROBOT_FEED_LABEL = {
    "aerial": "live-aerial",
    "ground": "ground-cam",
    "aquatic": "subsea",
    "fixed_sensor": "telemetry",
    "orbital": "satellite",
}
_ROBOT_ACTIVE_STATUSES = {"deployed", "patrolling", "mapping", "sampling", "tasking", "active"}

@api_router.get("/robots/feeds")
async def get_robot_feeds():
    """Returns one feed entry per active robot across all domains. Aerial
    robots reuse ZONE_FEED_IMAGES (canopy imagery); other domains carry a
    feed_type tag so the UI can render an appropriate placeholder until
    type-specific imagery / streams land. fixed_sensor and orbital return
    a metadata-only feed (no video) — feed_url is the zone snapshot URL
    so the panel renders, but feed_type signals to the client it's
    telemetry, not video."""
    robots = await db.robots.find(
        {"status": {"$in": list(_ROBOT_ACTIVE_STATUSES)}}, {"_id": 0}
    ).to_list(200)
    feeds = []
    for robot in robots:
        zone = await db.zones.find_one({"id": robot.get("zone_id")}, {"_id": 0}) if robot.get("zone_id") else None
        zone_type = zone.get("zone_type", "forest") if zone else "forest"
        rt = robot.get("robot_type", "aerial")
        feeds.append({
            "robot_id": robot["id"],
            "robot_name": robot.get("name"),
            "robot_type": rt,
            "zone_name": zone.get("name") if zone else None,
            "feed_url": random.choice(ZONE_FEED_IMAGES.get(zone_type, ZONE_FEED_IMAGES["forest"])),
            "feed_type": _ROBOT_FEED_LABEL.get(rt, "live"),
            "status": "active",
        })
    return feeds


@api_router.get("/robots/{robot_id}", response_model=Robot)
async def get_robot(robot_id: str = Path(..., pattern=_UUID_ID_PATTERN)):
    robot = await db.robots.find_one({"id": robot_id}, {"_id": 0})
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")
    return _deserialize_robot(robot)


@api_router.post("/robots", response_model=Robot)
async def create_robot(robot_data: RobotCreate):
    data = robot_data.model_dump()
    data["robot_type"] = _normalize_robot_type(data.get("robot_type", "aerial"))
    robot = Robot(**data)
    doc = robot.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["last_active"] = doc["last_active"].isoformat()
    await db.robots.insert_one(doc)
    return robot


@api_router.put("/robots/{robot_id}", response_model=Robot)
async def update_robot(update_data: RobotUpdate, robot_id: str = Path(..., pattern=_UUID_ID_PATTERN)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No update data provided")
    if "robot_type" in update_dict:
        update_dict["robot_type"] = _normalize_robot_type(update_dict["robot_type"])
    update_dict["last_active"] = datetime.now(timezone.utc).isoformat()

    await db.robots.update_one({"id": robot_id}, {"$set": update_dict})
    robot = await db.robots.find_one({"id": robot_id}, {"_id": 0})
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")
    return _deserialize_robot(robot)


@api_router.delete("/robots/{robot_id}")
async def delete_robot(robot_id: str = Path(..., pattern=_UUID_ID_PATTERN)):
    result = await db.robots.delete_one({"id": robot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Robot not found")
    return {"message": "Robot deleted successfully"}


@api_router.post("/robots/{robot_id}/task", response_model=Robot)
async def task_robot(task: RobotTaskRequest, robot_id: str = Path(..., pattern=_UUID_ID_PATTERN)):
    if task.zone_id:
        zone = await db.zones.find_one({"id": task.zone_id}, {"_id": 0})
        if not zone:
            raise HTTPException(status_code=404, detail="Zone not found")

    update = {
        "zone_id": task.zone_id,
        "mission_type": task.mission_type,
        "status": task.status,
        "last_active": datetime.now(timezone.utc).isoformat(),
        "metadata.last_task_notes": task.notes,
    }
    await db.robots.update_one({"id": robot_id}, {"$set": update})
    robot = await db.robots.find_one({"id": robot_id}, {"_id": 0})
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")
    await manager.broadcast({
        "type": "robot_tasked",
        "robot": robot,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    return _deserialize_robot(robot)


# ==================== EXISTING ENDPOINTS (PRESERVED) ====================

@api_router.get("/drones", response_model=List[Drone])
async def get_drones():
    drones = await db.drones.find({}, {"_id": 0}).to_list(1000)
    for drone in drones:
        deserialize_datetime(drone, ['created_at', 'last_active'])
    return drones

# Camera feeds — must be registered before /drones/{drone_id} so FastAPI doesn't
# match the literal "feeds" path as a drone_id.
ZONE_FEED_IMAGES = {
    "forest": ["https://images.unsplash.com/photo-1448375240586-882707db888b?w=800"],
    "wetland": ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800"],
    "grassland": ["https://images.unsplash.com/photo-1500534623283-312aade485b7?w=800"],
    "coastal": ["https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800"],
    "desert": ["https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800"]
}

@api_router.get("/drones/feeds")
async def get_drone_camera_feeds():
    drones = await db.drones.find({"status": {"$in": ["deployed", "patrolling"]}}, {"_id": 0}).to_list(100)
    feeds = []
    for drone in drones:
        zone = await db.zones.find_one({"id": drone.get('zone_id')}, {"_id": 0}) if drone.get('zone_id') else None
        zone_type = zone.get('zone_type', 'forest') if zone else 'forest'
        feeds.append({
            "drone_id": drone['id'],
            "drone_name": drone['name'],
            "zone_name": zone['name'] if zone else None,
            "feed_url": random.choice(ZONE_FEED_IMAGES.get(zone_type, ZONE_FEED_IMAGES['forest'])),
            "feed_type": "live",
            "status": "active"
        })
    return feeds

# UUID regex on drone_id guarantees `/drones/feeds` (literal) can never be
# matched as a drone_id, even if route registration order is shuffled.
_DRONE_ID_PATTERN = _UUID_ID_PATTERN

@api_router.get("/drones/{drone_id}", response_model=Drone)
async def get_drone(drone_id: str = Path(..., pattern=_DRONE_ID_PATTERN)):
    drone = await db.drones.find_one({"id": drone_id}, {"_id": 0})
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")
    deserialize_datetime(drone, ['created_at', 'last_active'])
    return drone

@api_router.post("/drones", response_model=Drone)
async def create_drone(drone_data: DroneCreate):
    drone = Drone(**drone_data.model_dump())
    doc = drone.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['last_active'] = doc['last_active'].isoformat()
    await db.drones.insert_one(doc)
    return drone

@api_router.put("/drones/{drone_id}", response_model=Drone)
async def update_drone(update_data: DroneUpdate, drone_id: str = Path(..., pattern=_DRONE_ID_PATTERN)):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No update data provided")
    update_dict['last_active'] = datetime.now(timezone.utc).isoformat()
    await db.drones.update_one({"id": drone_id}, {"$set": update_dict})
    drone = await db.drones.find_one({"id": drone_id}, {"_id": 0})
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")
    deserialize_datetime(drone, ['created_at', 'last_active'])
    return drone

@api_router.delete("/drones/{drone_id}")
async def delete_drone(drone_id: str = Path(..., pattern=_DRONE_ID_PATTERN)):
    result = await db.drones.delete_one({"id": drone_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Drone not found")
    return {"message": "Drone deleted successfully"}

@api_router.post("/drones/deploy")
async def deploy_drones(request: DeployMissionRequest):
    zone = await db.zones.find_one({"id": request.zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    
    updated_count = 0
    for drone_id in request.drone_ids:
        result = await db.drones.update_one(
            {"id": drone_id},
            {"$set": {
                "status": "deployed",
                "zone_id": request.zone_id,
                "mission_type": request.mission_type,
                "last_active": datetime.now(timezone.utc).isoformat()
            }}
        )
        if result.modified_count > 0:
            updated_count += 1
    
    alert = Alert(
        title=f"Drone Mission Deployed",
        message=f"{updated_count} drones deployed to {zone['name']} for {request.mission_type}",
        severity="info",
        zone_id=request.zone_id,
        asset_type="aerial",
        alert_type="drone"
    )
    alert_doc = alert.model_dump()
    alert_doc['created_at'] = alert_doc['created_at'].isoformat()
    await db.alerts.insert_one(alert_doc)

    return {"message": f"Deployed {updated_count} drones", "deployed_count": updated_count}


@api_router.post("/robots/deploy")
async def deploy_robots(request: RobotDeployRequest):
    """Multi-domain deploy. Updates every robot in the request to status
    `deployed` against the target zone, regardless of domain. Emits one
    summary alert tagged with the modal asset_type so the audit log
    correctly attributes ground/aquatic/orbital deployments instead of
    coercing them through the drone-only path."""
    zone = await db.zones.find_one({"id": request.zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")

    updated_count = 0
    deployed_types: Dict[str, int] = {}
    for robot_id in request.robot_ids:
        robot = await db.robots.find_one({"id": robot_id}, {"_id": 0})
        if not robot:
            continue
        rt = robot.get("robot_type", "aerial")
        result = await db.robots.update_one(
            {"id": robot_id},
            {"$set": {
                "status": "deployed",
                "zone_id": request.zone_id,
                "mission_type": request.mission_type,
                "last_active": datetime.now(timezone.utc).isoformat(),
            }},
        )
        if result.modified_count > 0:
            updated_count += 1
            deployed_types[rt] = deployed_types.get(rt, 0) + 1

    # Modal asset_type for the alert — most-deployed domain wins; ties
    # fall back to "mixed" so audit doesn't silently pick one.
    if deployed_types:
        top_count = max(deployed_types.values())
        modal_types = [t for t, c in deployed_types.items() if c == top_count]
        modal_asset_type = modal_types[0] if len(modal_types) == 1 else "mixed"
    else:
        modal_asset_type = None

    breakdown = ", ".join(f"{n} {t}" for t, n in sorted(deployed_types.items())) or "no robots"
    alert = Alert(
        title="Robotics Mission Deployed",
        message=f"{updated_count} robots deployed to {zone['name']} for {request.mission_type} ({breakdown})",
        severity="info",
        zone_id=request.zone_id,
        asset_type=modal_asset_type,
        alert_type="robotics",
    )
    alert_doc = alert.model_dump()
    alert_doc["created_at"] = alert_doc["created_at"].isoformat()
    await db.alerts.insert_one(alert_doc)

    return {
        "message": f"Deployed {updated_count} robots",
        "deployed_count": updated_count,
        "by_type": deployed_types,
    }

# Mission endpoints
def _mission_audit_event(action: str, user: dict, detail: str = "") -> dict:
    return {
        "action": action,
        "detail": detail,
        "user_id": user.get("id"),
        "user_name": user.get("name") or user.get("email"),
        "ts": datetime.now(timezone.utc).isoformat(),
    }

def _deserialize_mission(mission: dict) -> dict:
    deserialize_datetime(mission, [
        "created_at",
        "updated_at",
        "authorized_at",
        "launched_at",
        "completed_at",
        "aborted_at",
    ])
    return mission

async def _broadcast_mission_update(action: str, mission: dict):
    await manager.broadcast({
        "type": "mission_update",
        "action": action,
        "mission": mission,
        "ts": datetime.now(timezone.utc).isoformat(),
    })

# UUID regex for mission_id paths (consistent with /drones/{drone_id}). Stops
# `/missions/generate` from being misrouted as `mission_id == "generate"`.
_MISSION_ID_PATTERN = _DRONE_ID_PATTERN

# Authorize-time gate: a mission with go_score below this floor remains a
# draft and cannot launch. Stops click-through auth on clearly-not-ready plans.
MISSION_GO_SCORE_FLOOR = 0.6


def _counterfactual_trajectories(
    zone: dict,
    *,
    mission_type: Optional[str] = None,
    horizon_days: int = 14,
    n_samples: int = 200,
) -> dict:
    """Counterfactual biodiversity-index trajectories for a zone.

    Pair of Monte Carlo simulations over a domain drift model:

      - **no_deploy**: zone evolves under its own decay process — degraded
        zones (low biodiversity, low soil_health) drift down faster.
      - **with_deploy**: same decay, plus a positive recovery shock whose
        magnitude depends on `mission_type` (intervene > patrol > inspect).

    Returns the per-day mean trajectory plus 10/90 percentile bands so the
    frontend can render a chart with shaded confidence intervals. The seed
    is derived from the zone id so the same zone produces the same
    trajectories across calls (important for tests + repeatable demos).

    Honest framing: this is a *domain model*, not an empirically-fit
    forecast — we don't yet have a per-zone time-series of observations to
    fit on. The schema is locked so when real history lands, only this
    function changes. `fit_quality` is intentionally < 1 to flag that.
    """
    biodiv = float(zone.get("biodiversity_index", 0.5))
    soil = float(zone.get("soil_health", 0.5))
    priority = zone.get("priority", "medium")
    priority_decay_mult = {"critical": 1.4, "high": 1.2, "medium": 1.0, "low": 0.8}.get(priority, 1.0)

    # Drift signal: per-day decay, larger when biodiversity & soil are low.
    decay_mu = (0.003 + 0.012 * (1 - biodiv) + 0.004 * (1 - soil)) * priority_decay_mult
    decay_sigma = 0.0035

    # Recovery signal: positive shock from intervention. Calibrated so that
    # `intervene` on a high-priority degraded zone (biodiv ≤ 0.4) produces a
    # net positive 7-day delta — matches the operational intuition that real
    # interventions (seed pods, predator-prey rebalancing) show measurable
    # gains within a week. Patrols are net-flat to slightly-negative on
    # critical zones, which is also realistic.
    recovery_mu = {"intervene": 0.025, "patrol": 0.013, "inspect": 0.008}.get(mission_type, 0.013)
    recovery_sigma = 0.004

    rng = random.Random(f"counterfactual::{zone.get('id', 'unknown')}")

    no_deploy_paths: List[List[float]] = []
    with_deploy_paths: List[List[float]] = []
    for _ in range(n_samples):
        nd = [biodiv]
        wd = [biodiv]
        for _ in range(horizon_days):
            nd.append(max(0.0, min(1.0, nd[-1] - rng.gauss(decay_mu, decay_sigma))))
            wd.append(max(0.0, min(1.0, wd[-1] - rng.gauss(decay_mu, decay_sigma) + rng.gauss(recovery_mu, recovery_sigma))))
        no_deploy_paths.append(nd)
        with_deploy_paths.append(wd)

    points = []
    for d in range(horizon_days + 1):
        nd_d = sorted(p[d] for p in no_deploy_paths)
        wd_d = sorted(p[d] for p in with_deploy_paths)
        n = len(nd_d)
        points.append({
            "day": d,
            "no_deploy_value":    round(sum(nd_d) / n, 4),
            "no_deploy_lo":       round(nd_d[int(n * 0.10)], 4),
            "no_deploy_hi":       round(nd_d[int(n * 0.90)], 4),
            "with_deploy_value":  round(sum(wd_d) / n, 4),
            "with_deploy_lo":     round(wd_d[int(n * 0.10)], 4),
            "with_deploy_hi":     round(wd_d[int(n * 0.90)], 4),
        })

    # 7-day deltas — preserved for the planner's legacy summary keys.
    day7 = points[min(7, horizon_days)]
    summary = {
        "no_deploy_final":     points[-1]["no_deploy_value"],
        "with_deploy_final":   points[-1]["with_deploy_value"],
        "horizon_delta":       round(points[-1]["with_deploy_value"] - points[-1]["no_deploy_value"], 4),
        "no_deploy_delta_7d":  round(day7["no_deploy_value"] - biodiv, 4),
        "with_deploy_delta_7d": round(day7["with_deploy_value"] - biodiv, 4),
    }
    return {
        "zone_id": zone.get("id"),
        "mission_type": mission_type,
        "horizon_days": horizon_days,
        "n_samples": n_samples,
        "points": points,
        "summary": summary,
        "method": "bayesian-mc-v1 (Monte Carlo over a domain drift model; replace with empirical fit when zone_observations history lands)",
        "fit_quality": 0.6,  # honest: heuristic, not empirically validated
    }


MISSION_MOBILE_ROBOT_TYPES = {"aerial", "ground", "aquatic"}
MISSION_EVIDENCE_ROBOT_TYPES = {"fixed_sensor", "orbital"}
MISSION_ROBOT_READY_STATUSES = {"idle", "standby", "charging", "queued"}


def _mission_robot_priority(mission_type: str, zone: dict) -> Dict[str, int]:
    mission = (mission_type or "").lower()
    zone_type = (zone.get("zone_type") or "").lower()
    priority = {"aerial": 3, "ground": 2, "aquatic": 1, "fixed_sensor": 1, "orbital": 1}
    if mission in {"inspect", "patrol", "survey"}:
        priority.update({"aerial": 4, "ground": 3, "orbital": 2, "fixed_sensor": 2})
    if mission in {"intervene", "restore", "reforest", "seed"}:
        priority.update({"ground": 4, "aerial": 4, "aquatic": 2})
    if mission in {"soil", "sample", "ranger"} or zone_type in {"forest", "grassland", "desert"}:
        priority["ground"] += 2
    if mission in {"reef", "kelp", "aquatic", "marine"} or zone_type in {"coastal", "reef", "wetland", "marine"}:
        priority["aquatic"] += 4
        priority["orbital"] += 1
    return priority


def _robot_rejection_reason(robot: dict) -> Optional[str]:
    if robot.get("robot_type") in MISSION_EVIDENCE_ROBOT_TYPES:
        return None
    if robot.get("status") not in MISSION_ROBOT_READY_STATUSES:
        return f"status={robot.get('status')}"
    if float(robot.get("battery", 0)) < 50:
        return f"battery={robot.get('battery')}<50"
    if float(robot.get("health", 0)) < 60:
        return f"health={robot.get('health')}<60"
    return None


def _select_mission_robots(all_robots: List[dict], zone: dict, mission_type: str, max_robots: int) -> tuple[List[dict], List[dict], List[dict]]:
    priority = _mission_robot_priority(mission_type, zone)
    rejected: List[dict] = []
    candidates: List[dict] = []
    evidence_sources: List[dict] = []
    zone_id = zone.get("id")

    for robot in all_robots:
        robot_type = robot.get("robot_type", "aerial")
        zone_match = robot.get("zone_id") in {None, zone_id} or robot_type == "orbital"
        reason = _robot_rejection_reason(robot)
        if reason:
            rejected.append({"id": robot["id"], "name": robot.get("name"), "robot_type": robot_type, "reason": reason})
            continue
        if robot_type in MISSION_EVIDENCE_ROBOT_TYPES:
            if zone_match and len(evidence_sources) < 3:
                evidence_sources.append(robot)
            continue
        if robot_type not in MISSION_MOBILE_ROBOT_TYPES:
            rejected.append({"id": robot["id"], "name": robot.get("name"), "robot_type": robot_type, "reason": "unsupported robot_type"})
            continue
        if not zone_match:
            rejected.append({"id": robot["id"], "name": robot.get("name"), "robot_type": robot_type, "reason": "assigned to another zone"})
            continue
        candidates.append(robot)

    candidates.sort(key=lambda r: (
        -priority.get(r.get("robot_type", "aerial"), 0),
        -float(r.get("battery", 0)),
        -float(r.get("health", 0)),
    ))
    selected = candidates[:max(0, max_robots)]
    for robot in candidates[len(selected):]:
        rejected.append({"id": robot["id"], "name": robot.get("name"), "robot_type": robot.get("robot_type"), "reason": "robotics cap reached"})
    return selected, evidence_sources, rejected


async def _plan_mission(req: MissionGenerateRequest, user: dict) -> dict:
    """Server-side mission planner.

    Picks the zone (auto if not given), scores available robots/drones, computes
    readiness checks that can actually abort the launch, and packages a
    counterfactual `evidence` block so operators can see what the system
    expects to *change* by deploying. Returns a dict that satisfies
    `Mission.model_validate(...)`.

    Deterministic + transparent on purpose — every input that drives a
    number on the dashboard comes from a Mongo document the operator can
    inspect. When we swap in real ML for biodiversity forecasting (BioCLIP,
    N-BEATS, etc.), only this function changes.
    """
    if req.zone_id:
        zone = await db.zones.find_one({"id": req.zone_id}, {"_id": 0})
        if not zone:
            raise HTTPException(status_code=404, detail=f"Zone {req.zone_id} not found")
    else:
        candidates = await db.zones.find({}, {"_id": 0}).sort("biodiversity_index", 1).to_list(1)
        if not candidates:
            raise HTTPException(status_code=409, detail="No zones available to plan a mission for")
        zone = candidates[0]

    biodiversity = float(zone.get("biodiversity_index", 0.5))
    soil_health = float(zone.get("soil_health", 0.5))
    priority_weight = {"critical": 1.0, "high": 0.8, "medium": 0.6, "low": 0.4}.get(
        zone.get("priority", "medium"), 0.6
    )

    all_robots = await db.robots.find({}, {"_id": 0}).to_list(1000)
    requested_robot_cap = max(0, int(getattr(req, "max_robots", 0) or getattr(req, "max_drones", 0) or 0))
    selected_robots, evidence_robots, rejected_robots = _select_mission_robots(
        all_robots,
        zone,
        req.mission_type,
        requested_robot_cap,
    )

    all_drones = await db.drones.find({}, {"_id": 0}).to_list(500)
    selected_drones: List[dict] = []
    rejected_drones: List[dict] = []
    for d in sorted(all_drones, key=lambda x: -float(x.get("battery", 0))):
        if d.get("status") not in {"idle", "charging"}:
            rejected_drones.append({"id": d["id"], "name": d.get("name"), "reason": f"status={d.get('status')}"})
            continue
        if float(d.get("battery", 0)) < 50:
            rejected_drones.append({"id": d["id"], "name": d.get("name"), "reason": f"battery={d.get('battery')}<50"})
            continue
        if len(selected_drones) < req.max_drones:
            selected_drones.append(d)
        else:
            rejected_drones.append({"id": d["id"], "name": d.get("name"), "reason": "fleet cap reached"})

    geofence_docs = await db.geofences.find({"zone_id": zone["id"]}, {"_id": 0}).to_list(50)
    active_in_zone = await db.missions.count_documents(
        {"zone_id": zone["id"], "status": {"$in": ["authorized", "active"]}}
    )

    assigned_mobile_assets = selected_robots or selected_drones
    avg_battery = sum(float(asset.get("battery", 0)) for asset in assigned_mobile_assets) / max(1, len(assigned_mobile_assets))
    readiness = [
        {"label": "robots_available", "value": min(1.0, len(selected_robots) / max(1, requested_robot_cap))},
        {"label": "drones_available", "value": min(1.0, len(selected_drones) / max(1, req.max_drones))},
        {"label": "battery_avg", "value": min(1.0, avg_battery / 100.0)},
        {"label": "geofence_clear", "value": 1.0 if not geofence_docs else 0.7},
        {"label": "no_conflicting_mission", "value": 0.0 if active_in_zone else 1.0},
        # Weather is mocked until the real provider integration lands; keep
        # the slot so the UI doesn't have to know it's missing.
        {"label": "weather_clear", "value": 0.85},
    ]
    weights = {"robots_available": 0.25, "drones_available": 0.10, "battery_avg": 0.20,
               "geofence_clear": 0.10, "no_conflicting_mission": 0.20, "weather_clear": 0.15}
    go_score = sum(c["value"] * weights[c["label"]] for c in readiness)

    risk_score = round(min(1.0, (1 - biodiversity) * priority_weight + 0.1), 3)

    trajectories = _counterfactual_trajectories(zone, mission_type=req.mission_type, horizon_days=14)
    summary = trajectories["summary"]
    evidence = {
        "zone_state_at_plan": {
            "biodiversity_index": biodiversity,
            "soil_health": soil_health,
            "priority": zone.get("priority"),
        },
        "counterfactual": {
            # Legacy summary keys — preserved so older clients keep working.
            "if_no_deploy_7d": {"biodiversity_index_delta": round(summary["no_deploy_delta_7d"], 3)},
            "if_deploy_7d":    {"biodiversity_index_delta": round(summary["with_deploy_delta_7d"], 3)},
            # Chart-ready: dual trajectories with 80% CI bands.
            "trajectories": trajectories,
            "method": trajectories["method"],
        },
        "selected_robots": [
            {"id": r.get("id"), "name": r.get("name"), "robot_type": r.get("robot_type"), "battery": r.get("battery"), "health": r.get("health")}
            for r in selected_robots
        ],
        "evidence_sources": [
            {"id": r.get("id"), "name": r.get("name"), "robot_type": r.get("robot_type"), "capabilities": r.get("capabilities", [])}
            for r in evidence_robots
        ],
        "rejected_robots": rejected_robots,
        "rejected_drones": rejected_drones,
        "active_geofences": [g.get("id") for g in geofence_docs],
        "operator_notes": req.notes,
    }

    # Provenance: attach digests of recent signed zone observations as
    # source_hashes. The mission plan is now *attestable* — anyone can
    # walk the digests to /api/observations/{id} and verify each
    # signature independently against /.well-known/keys.json.
    recent_obs = await db.observations.find(
        {"zone_id": zone["id"]},
        {"_id": 0, "id": 1, "digest": 1, "source_type": 1, "observed_at": 1, "key_id": 1},
    ).sort("observed_at", -1).limit(50).to_list(50)
    evidence["source_hashes"] = [o["digest"] for o in recent_obs if o.get("digest")]
    evidence["attestation"] = {
        "key_id": get_key_id(),
        "observation_count": len(recent_obs),
        "verify_endpoint": "/api/observations/verify",
        "public_key_jwk_url": "/.well-known/keys.json",
    }

    mobile_count = len(assigned_mobile_assets)
    coverage_km = round(zone.get("radius_km", 5.0) * 2 * max(1, mobile_count), 2)
    duration = 30 + 10 * mobile_count + (15 if req.mission_type == "inspect" else 0)
    timeline = [
        f"T-30m  robot readiness checks ({len(selected_robots)} robots, {len(selected_drones)} legacy drones)",
        f"T-15m  weather + geofence sweep",
        f"T-0    launch sequence — {zone.get('name')}",
        f"T+{duration//2}m  mid-mission telemetry checkpoint",
        f"T+{duration}m  return-to-base, debrief",
    ]
    directives = [
        f"Maintain altitude 60-80m; respect {len(geofence_docs)} active geofence(s)",
        "Photograph any anomaly with confidence > 0.7 and emit alert",
        "Abort and RTB if any mobile robot battery < 25% mid-mission",
    ]
    if req.mission_type == "intervene":
        directives.append("Drop seed pod at zone center (subject to GO confirmation)")

    return {
        "name": f"{req.mission_type.title()} • {zone.get('name')}",
        "zone_id": zone["id"],
        "zone_name": zone.get("name", ""),
        "mission_type": req.mission_type,
        "robot_ids": [r["id"] for r in selected_robots],
        "drone_ids": [d["id"] for d in selected_drones],
        "sensor_ids": [],
        "geofence_ids": [g["id"] for g in geofence_docs],
        "risk_score": risk_score,
        "go_score": round(go_score, 3),
        "estimated_duration_mins": duration,
        "coverage_km": coverage_km,
        "readiness": readiness,
        "timeline": timeline,
        "directives": directives,
        "evidence": evidence,
    }


async def _validate_mission_can_authorize(mission: dict):
    if mission.get("status") != "ready":
        raise HTTPException(status_code=400, detail=f"Mission cannot be authorized from {mission.get('status')} status")
    if float(mission.get("go_score", 0)) < MISSION_GO_SCORE_FLOOR:
        raise HTTPException(status_code=400, detail="Mission GO score is below launch floor")
    robot_ids = mission.get("robot_ids", [])
    if robot_ids:
        valid_robots = await db.robots.find({
            "id": {"$in": robot_ids},
            "robot_type": {"$in": list(MISSION_MOBILE_ROBOT_TYPES)},
            "status": {"$in": list(MISSION_ROBOT_READY_STATUSES)},
            "battery": {"$gte": 50},
            "health": {"$gte": 60},
        }, {"_id": 0}).to_list(len(robot_ids))
        if len(valid_robots) != len(robot_ids):
            raise HTTPException(status_code=400, detail="Mission has invalid or unavailable robot assignments")
        return

    drone_ids = mission.get("drone_ids", [])
    if not drone_ids:
        raise HTTPException(status_code=400, detail="Mission has no assigned robots or drones")
    valid_drones = await db.drones.find({
        "id": {"$in": drone_ids},
        "status": {"$in": ["idle", "charging"]},
        "battery": {"$gte": 50},
    }, {"_id": 0}).to_list(len(drone_ids))
    if len(valid_drones) != len(drone_ids):
        raise HTTPException(status_code=400, detail="Mission has invalid or unavailable drone assignments")


async def _deploy_mission_assets(mission: dict) -> dict:
    zone = await db.zones.find_one({"id": mission["zone_id"]}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Mission zone not found")

    updated_count = 0
    updated_robot_count = 0
    for robot_id in mission.get("robot_ids", []):
        result = await db.robots.update_one(
            {"id": robot_id},
            {"$set": {
                "status": "deployed",
                "zone_id": mission["zone_id"],
                "mission_type": mission["mission_type"],
                "last_active": datetime.now(timezone.utc).isoformat(),
                "metadata.active_mission_id": mission.get("id"),
            }}
        )
        if result.modified_count > 0:
            updated_robot_count += 1

    updated_drone_count = 0
    for drone_id in mission.get("drone_ids", []):
        result = await db.drones.update_one(
            {"id": drone_id},
            {"$set": {
                "status": "deployed",
                "zone_id": mission["zone_id"],
                "mission_type": mission["mission_type"],
                "last_active": datetime.now(timezone.utc).isoformat(),
            }}
        )
        if result.modified_count > 0:
            updated_drone_count += 1

    updated_count = updated_robot_count + updated_drone_count

    alert = Alert(
        title="Mission Authorized",
        message=f"{updated_count} robots deployed to {zone['name']} for {mission['mission_type']}",
        severity="info",
        zone_id=mission["zone_id"],
        alert_type="mission",
    )
    alert_doc = alert.model_dump()
    alert_doc["created_at"] = alert_doc["created_at"].isoformat()
    await db.alerts.insert_one(alert_doc)

    return {
        "message": f"Mission active with {updated_count} robots deployed",
        "deployed_count": updated_count,
        "robot_count": updated_robot_count,
        "drone_count": updated_drone_count,
    }

async def _build_post_mission_report(mission: dict, completed_at: str, audit: List[dict]) -> dict:
    robot_ids = mission.get("robot_ids", [])
    drone_ids = mission.get("drone_ids", [])
    sensor_ids = mission.get("sensor_ids", [])
    geofence_ids = mission.get("geofence_ids", [])

    robots = await db.robots.find({"id": {"$in": robot_ids}}, {"_id": 0}).to_list(max(1, len(robot_ids)))
    drones = await db.drones.find({"id": {"$in": drone_ids}}, {"_id": 0}).to_list(max(1, len(drone_ids)))
    sensors = await db.sensors.find({"id": {"$in": sensor_ids}}, {"_id": 0}).to_list(max(1, len(sensor_ids)))
    geofences = await db.geofences.find({"id": {"$in": geofence_ids}}, {"_id": 0}).to_list(max(1, len(geofence_ids)))
    alerts = await db.alerts.find({"zone_id": mission.get("zone_id")}, {"_id": 0}).sort("created_at", -1).to_list(10)

    robot_evidence = [{
        "id": robot.get("id"),
        "name": robot.get("name"),
        "robot_type": robot.get("robot_type"),
        "status": robot.get("status"),
        "battery": robot.get("battery", 0),
        "health": robot.get("health", 0),
        "autonomy_level": robot.get("autonomy_level", 0),
        "capabilities": robot.get("capabilities", []),
        "location": {
            "latitude": robot.get("latitude", 0),
            "longitude": robot.get("longitude", 0),
            "altitude": robot.get("altitude", 0),
            "depth_m": robot.get("depth_m"),
        },
        "mission_type": robot.get("mission_type"),
    } for robot in robots]
    drone_evidence = [{
        "id": drone.get("id"),
        "name": drone.get("name"),
        "status": drone.get("status"),
        "battery": drone.get("battery", 0),
        "location": {
            "latitude": drone.get("latitude", 0),
            "longitude": drone.get("longitude", 0),
            "altitude": drone.get("altitude", 0),
        },
        "mission_type": drone.get("mission_type"),
    } for drone in drones]
    sensor_evidence = [{
        "id": sensor.get("id"),
        "name": sensor.get("name"),
        "sensor_type": sensor.get("sensor_type"),
        "status": sensor.get("status"),
        "current_value": sensor.get("current_value"),
        "unit": sensor.get("unit", ""),
        "last_reading": sensor.get("last_reading"),
    } for sensor in sensors]
    geofence_context = [{
        "id": fence.get("id"),
        "name": fence.get("name"),
        "fence_type": fence.get("fence_type"),
        "radius_km": fence.get("radius_km"),
        "alerts_enabled": fence.get("alerts_enabled", True),
    } for fence in geofences]

    low_battery = [asset for asset in [*robot_evidence, *drone_evidence] if float(asset.get("battery") or 0) < 25]
    offline_sensors = [s for s in sensor_evidence if s.get("status") != "active"]
    anomalies = []
    if low_battery:
        anomalies.append({"type": "battery", "severity": "warning", "count": len(low_battery)})
    if offline_sensors:
        anomalies.append({"type": "sensor", "severity": "warning", "count": len(offline_sensors)})
    if not anomalies:
        anomalies.append({"type": "mission", "severity": "info", "message": "No critical anomalies detected during completion sweep."})

    counterfactual = mission.get("evidence", {}).get("counterfactual", {})
    impact_delta = counterfactual.get("if_deploy_7d", {}).get("biodiversity_index_delta", 0)
    restoration_impact = {
        "biodiversity_delta_7d_estimate": impact_delta,
        "coverage_km": mission.get("coverage_km", 0),
        "risk_score_at_plan": mission.get("risk_score", 0),
        "confidence": round(min(0.92, 0.55 + len(robot_evidence) * 0.07 + len(drone_evidence) * 0.05 + len(sensor_evidence) * 0.03), 2),
        "method": counterfactual.get("method", "mission-evidence-rollup-v0"),
    }

    return {
        "mission_id": mission.get("id"),
        "mission_name": mission.get("name"),
        "zone_id": mission.get("zone_id"),
        "zone_name": mission.get("zone_name"),
        "status": "completed",
        "started_at": mission.get("launched_at"),
        "completed_at": completed_at,
        "duration_mins_planned": mission.get("estimated_duration_mins", 0),
        "mission_type": mission.get("mission_type"),
        "robots": robot_evidence,
        "drones": drone_evidence,
        "sensors": sensor_evidence,
        "geofences": geofence_context,
        "alerts": alerts,
        "timeline": mission.get("timeline", []),
        "directives": mission.get("directives", []),
        "audit_trail": audit,
        "anomalies": anomalies,
        "restoration_impact": restoration_impact,
        "recommendations": [
            "Review robotics media and telemetry against anomaly thresholds before closing field actions.",
            "Schedule follow-up sensor validation within 24 hours for the target zone.",
            "Compare biodiversity estimate against next patrol to validate the impact model.",
        ],
    }

@api_router.post("/missions/generate", response_model=Mission)
async def generate_mission(req: MissionGenerateRequest, request: Request):
    """Plan a mission server-side. The body is intentionally minimal — the
    *plan* (drone selection, readiness, risk, counterfactual evidence) is
    the product, and is computed here, not by the client.

    Result lands in `ready` status if go_score ≥ MISSION_GO_SCORE_FLOOR;
    below that it's `draft` and cannot be authorized.
    """
    user = await get_current_user(request)
    plan = await _plan_mission(req, user)
    initial_status = "ready" if plan["go_score"] >= MISSION_GO_SCORE_FLOOR else "draft"
    detail = (
        f"Plan synthesized for zone {plan['zone_name']} "
        f"(go_score={plan['go_score']}, risk={plan['risk_score']}, "
        f"robots={len(plan.get('robot_ids', []))}, drones={len(plan.get('drone_ids', []))}, status={initial_status})."
    )
    mission = Mission(
        **plan,
        status=initial_status,
        created_by=user.get("id"),
        created_by_name=user.get("name") or user.get("email"),
        audit_trail=[_mission_audit_event("generated", user, detail)],
    )
    doc = mission.model_dump()
    for field in ["created_at", "updated_at"]:
        doc[field] = doc[field].isoformat()
    saved = await insert_and_return(db.missions, doc)
    await _broadcast_mission_update("generated", saved)
    return saved

@api_router.get("/missions", response_model=List[Mission])
async def get_missions():
    missions = await db.missions.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [_deserialize_mission(mission) for mission in missions]

@api_router.get("/missions/{mission_id}", response_model=Mission)
async def get_mission(mission_id: str = Path(..., pattern=_MISSION_ID_PATTERN)):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    return _deserialize_mission(mission)

@api_router.post("/missions/{mission_id}/authorize", response_model=Mission)
async def authorize_mission(request: Request, mission_id: str = Path(..., pattern=_MISSION_ID_PATTERN)):
    user = await get_current_user(request)
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    await _validate_mission_can_authorize(mission)

    launch_result = await _deploy_mission_assets(mission)
    now = datetime.now(timezone.utc).isoformat()
    audit = mission.get("audit_trail", [])
    audit.append(_mission_audit_event("authorized", user, "Operator authorized mission launch."))
    audit.append(_mission_audit_event("launched", user, launch_result["message"]))
    await db.missions.update_one(
        {"id": mission_id},
        {"$set": {
            "status": "active",
            "authorized_by": user.get("id"),
            "authorized_at": now,
            "launched_at": now,
            "launch_result": launch_result,
            "audit_trail": audit,
            "updated_at": now,
        }}
    )
    updated = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    await _broadcast_mission_update("authorized", updated)
    return _deserialize_mission(updated)

@api_router.post("/missions/{mission_id}/abort", response_model=Mission)
async def abort_mission(abort: MissionAbortRequest, request: Request, mission_id: str = Path(..., pattern=_MISSION_ID_PATTERN)):
    user = await get_current_user(request)
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.get("status") != "active":
        raise HTTPException(status_code=400, detail=f"Mission cannot be aborted from {mission.get('status')} status")

    now = datetime.now(timezone.utc).isoformat()
    audit = mission.get("audit_trail", [])
    audit.append(_mission_audit_event("aborted", user, abort.reason))
    await db.missions.update_one(
        {"id": mission_id},
        {"$set": {"status": "aborted", "aborted_at": now, "audit_trail": audit, "updated_at": now}}
    )
    updated = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    await _broadcast_mission_update("aborted", updated)
    return _deserialize_mission(updated)

@api_router.post("/missions/{mission_id}/complete", response_model=Mission)
async def complete_mission(request: Request, mission_id: str = Path(..., pattern=_MISSION_ID_PATTERN)):
    user = await get_current_user(request)
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.get("status") != "active":
        raise HTTPException(status_code=400, detail=f"Mission cannot be completed from {mission.get('status')} status")

    summary = (
        f"Mission completed for {mission.get('zone_name')}. "
        f"{len(mission.get('robot_ids', []))} robots, {len(mission.get('drone_ids', []))} legacy drones, "
        f"{len(mission.get('sensor_ids', []))} sensors, "
        f"risk score {mission.get('risk_score', 0)}."
    )
    now = datetime.now(timezone.utc).isoformat()
    audit = mission.get("audit_trail", [])
    audit.append(_mission_audit_event("completed", user, summary))
    report = await _build_post_mission_report(mission, now, audit)
    await db.missions.update_one(
        {"id": mission_id},
        {"$set": {
            "status": "completed",
            "completed_at": now,
            "post_mission_summary": summary,
            "post_mission_report": report,
            "audit_trail": audit,
            "updated_at": now,
        }}
    )
    updated = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    await _broadcast_mission_update("completed", updated)
    return _deserialize_mission(updated)

# Zone endpoints
@api_router.get("/zones", response_model=List[Zone])
async def get_zones():
    zones = await db.zones.find({}, {"_id": 0}).to_list(1000)
    for zone in zones:
        deserialize_datetime(zone, ['created_at'])
    return zones

@api_router.get("/zones/{zone_id}", response_model=Zone)
async def get_zone(zone_id: str):
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    deserialize_datetime(zone, ['created_at'])
    return zone

@api_router.post("/zones", response_model=Zone)
async def create_zone(zone_data: ZoneCreate):
    zone = Zone(**zone_data.model_dump())
    doc = zone.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.zones.insert_one(doc)
    return zone

@api_router.put("/zones/{zone_id}", response_model=Zone)
async def update_zone(zone_id: str, update_data: ZoneUpdate):
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No update data provided")
    await db.zones.update_one({"id": zone_id}, {"$set": update_dict})
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    deserialize_datetime(zone, ['created_at'])
    return zone

@api_router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str):
    result = await db.zones.delete_one({"id": zone_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")
    return {"message": "Zone deleted successfully"}

# Sensor endpoints
@api_router.get("/sensors", response_model=List[Sensor])
async def get_sensors():
    sensors = await db.sensors.find({}, {"_id": 0}).to_list(1000)
    for sensor in sensors:
        deserialize_datetime(sensor, ['created_at', 'last_reading'])
    return sensors

@api_router.post("/sensors", response_model=Sensor)
async def create_sensor(sensor_data: SensorCreate):
    sensor = Sensor(**sensor_data.model_dump())
    doc = sensor.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['last_reading'] = doc['last_reading'].isoformat()
    await db.sensors.insert_one(doc)
    return sensor

# Alert endpoints
@api_router.get("/alerts", response_model=List[Alert])
async def get_alerts(unread_only: bool = False):
    query = {"is_read": False} if unread_only else {}
    alerts = await db.alerts.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for alert in alerts:
        deserialize_datetime(alert, ['created_at'])
    return alerts

@api_router.post("/alerts", response_model=Alert)
async def create_alert(alert_data: AlertCreate):
    alert = Alert(**alert_data.model_dump())
    doc = alert.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.alerts.insert_one(doc)
    return alert

@api_router.put("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    await db.alerts.update_one({"id": alert_id}, {"$set": {"is_read": True}})
    return {"message": "Alert marked as read"}

@api_router.put("/alerts/read-all")
async def mark_all_alerts_read():
    await db.alerts.update_many({}, {"$set": {"is_read": True}})
    return {"message": "All alerts marked as read"}

# AI Analysis
@api_router.post("/ai/analyze", response_model=AIAnalysisResponse)
async def analyze_ecosystem(request: AIAnalysisRequest):
    zones_data = []
    if request.zone_id:
        zone = await db.zones.find_one({"id": request.zone_id}, {"_id": 0})
        if zone:
            zones_data = [zone]
    else:
        zones_data = await db.zones.find({}, {"_id": 0}).to_list(10)
    
    sensors_data = await db.sensors.find({}, {"_id": 0}).to_list(50)
    drones_data = await db.drones.find({}, {"_id": 0}).to_list(20)
    
    context = f"""You are an advanced ecosystem management AI. Analysis Type: {request.analysis_type}
    
Current Data: {len(zones_data)} zones, {len(sensors_data)} sensors, {len(drones_data)} drones.
Zone Details:"""
    
    for zone in zones_data:
        context += f"\n- {zone.get('name')}: Biodiversity {zone.get('biodiversity_index', 0):.2f}, Soil {zone.get('soil_health', 0):.2f}"
    
    prompts = {
        "general": "Provide ecosystem health assessment and top 3 priority actions.",
        "rewilding": "Suggest rewilding interventions including species reintroduction.",
        "soil": "Analyze soil health and recommend restoration techniques.",
        "predator_prey": "Evaluate predator-prey dynamics and suggest balance strategies.",
        "species": "Recommend species for reintroduction based on ecosystem conditions."
    }
    
    try:
        chat = make_llm_chat(
            session_id=f"ecosystem-{uuid.uuid4()}",
            system_message=context,
        )
        recommendations = await chat.send_message(UserMessage(text=prompts.get(request.analysis_type, prompts["general"])))
    except Exception as e:
        logging.error(f"AI Analysis error: {e}")
        recommendations = "AI analysis temporarily unavailable. Focus on zones with biodiversity below 0.5."
    
    response = AIAnalysisResponse(
        zone_id=request.zone_id,
        analysis_type=request.analysis_type,
        recommendations=recommendations
    )
    
    doc = response.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.ai_analyses.insert_one(doc)
    
    return response

@api_router.get("/ai/history", response_model=List[AIAnalysisResponse])
async def get_ai_history():
    analyses = await db.ai_analyses.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    for analysis in analyses:
        deserialize_datetime(analysis, ['created_at'])
    return analyses

# Dashboard
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    drones = await db.drones.find({}, {"_id": 0}).to_list(1000)
    robots = await db.robots.find({}, {"_id": 0}).to_list(2000)
    zones = await db.zones.find({}, {"_id": 0}).to_list(1000)
    sensors = await db.sensors.find({}, {"_id": 0}).to_list(1000)
    unread_alerts = await db.alerts.count_documents({"is_read": False})

    avg_biodiversity = sum(z.get('biodiversity_index', 0) for z in zones) / max(len(zones), 1)
    avg_soil_health = sum(z.get('soil_health', 0) for z in zones) / max(len(zones), 1)

    # Multi-domain robot stats so the public Gaia Prime story (5 domains)
    # is backed by actual numbers, not just labels.
    robots_by_type: Dict[str, int] = {}
    active_robots = 0
    for r in robots:
        robots_by_type[r.get("robot_type", "aerial")] = robots_by_type.get(r.get("robot_type", "aerial"), 0) + 1
        if r.get("status") in _ROBOT_ACTIVE_STATUSES:
            active_robots += 1

    return DashboardStats(
        total_drones=len(drones),
        active_drones=len([d for d in drones if d.get('status') in ['deployed', 'patrolling']]),
        total_robots=len(robots),
        active_robots=active_robots,
        robots_by_type=robots_by_type,
        total_zones=len(zones),
        critical_zones=len([z for z in zones if z.get('priority') == 'critical']),
        total_sensors=len(sensors),
        active_sensors=len([s for s in sensors if s.get('status') == 'active']),
        unread_alerts=unread_alerts,
        avg_biodiversity=round(avg_biodiversity, 2),
        avg_soil_health=round(avg_soil_health, 2)
    )

@api_router.get("/dashboard/trends")
async def get_trends():
    return {
        "biodiversity": [{"month": m, "value": 0.42 + i*0.03} for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun"])],
        "soil_health": [{"month": m, "value": 0.38 + i*0.03} for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun"])],
        "predator_prey": [{"month": m, "value": 0.35 + i*0.03} for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun"])],
        "drone_missions": [{"month": m, "monitoring": 45+i*5, "sampling": 12+i*2, "reforestation": 8+i*2} for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun"])]
    }

# Patrols (abbreviated - keep existing patrol endpoints)
@api_router.get("/patrols")
async def get_patrol_schedules():
    schedules = await db.patrol_schedules.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for schedule in schedules:
        deserialize_datetime(schedule, ['created_at'])
    return schedules

@api_router.post("/patrols/generate")
async def generate_patrol_schedule(request: PatrolScheduleCreate):
    zones = await db.zones.find({}, {"_id": 0}).to_list(100)
    if not zones:
        raise HTTPException(status_code=400, detail="No zones available")
    
    priority_weights = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    zone_scores = []
    for zone in zones:
        biodiversity_need = 1 - zone.get('biodiversity_index', 0.5)
        soil_need = 1 - zone.get('soil_health', 0.5)
        base_priority = priority_weights.get(zone.get('priority', 'medium'), 2)
        score = biodiversity_need * 0.3 + soil_need * 0.3 + base_priority * 0.4
        zone_scores.append({"zone": zone, "score": score})
    
    zone_scores.sort(key=lambda x: x['score'], reverse=True)
    
    waypoints = []
    for zs in zone_scores[:5]:
        zone = zs['zone']
        waypoints.append({
            "zone_id": zone['id'],
            "zone_name": zone['name'],
            "priority_score": round(zs['score'], 2),
            "estimated_duration_mins": int(zone.get('radius_km', 5) * 4) + 30,
            "tasks": ["monitoring", "soil_sampling"],
            "latitude": zone.get('center_lat', 0),
            "longitude": zone.get('center_lng', 0)
        })
    
    schedule = PatrolSchedule(
        name=request.name,
        drone_ids=request.drone_ids,
        schedule_type=request.schedule_type,
        waypoints=waypoints,
        total_distance_km=round(sum(abs(w["latitude"]) for w in waypoints) * 10, 2),
        estimated_duration_mins=sum(w["estimated_duration_mins"] for w in waypoints),
        efficiency_score=0.85,
        ai_reasoning="Route optimized for balanced coverage across priority zones."
    )
    
    doc = schedule.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    return await insert_and_return(db.patrol_schedules, doc)

@api_router.put("/patrols/{patrol_id}")
async def update_patrol_schedule(patrol_id: str, update: PatrolScheduleUpdate):
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_dict:
        await db.patrol_schedules.update_one({"id": patrol_id}, {"$set": update_dict})
    schedule = await db.patrol_schedules.find_one({"id": patrol_id}, {"_id": 0})
    return schedule

@api_router.delete("/patrols/{patrol_id}")
async def delete_patrol_schedule(patrol_id: str):
    await db.patrol_schedules.delete_one({"id": patrol_id})
    return {"message": "Patrol deleted"}

@api_router.post("/patrols/{patrol_id}/complete")
async def complete_patrol(patrol_id: str):
    patrol = await db.patrol_schedules.find_one({"id": patrol_id}, {"_id": 0})
    if not patrol:
        raise HTTPException(status_code=404, detail="Patrol not found")
    
    report = PatrolReport(
        patrol_id=patrol_id,
        patrol_name=patrol.get('name', 'Unknown'),
        total_waypoints_visited=len(patrol.get('waypoints', [])),
        total_duration_mins=patrol.get('estimated_duration_mins', 0),
        total_distance_km=patrol.get('total_distance_km', 0),
        drone_ids=patrol.get('drone_ids', []),
        wildlife_sightings=random.randint(10, 50),
        soil_samples_collected=random.randint(5, 20),
        efficiency_achieved=patrol.get('efficiency_score', 0.8),
        ai_summary="Patrol completed successfully with comprehensive zone coverage."
    )
    
    doc = report.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    response = await insert_and_return(db.patrol_reports, doc)
    await db.patrol_schedules.update_one({"id": patrol_id}, {"$set": {"status": "completed"}})

    return response

@api_router.get("/patrols/reports")
async def get_patrol_reports():
    reports = await db.patrol_reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return reports

# Species identification
SPECIES_PROMPT = (
    "Identify the wildlife species visible in this image. "
    "Return ONLY a JSON object with EXACTLY these keys (no markdown, no prose):\n"
    '{\n'
    '  "species_name": "common name in English",\n'
    '  "scientific_name": "binomial nomenclature",\n'
    '  "confidence": <number between 0.0 and 1.0>,\n'
    '  "conservation_status": "IUCN code: one of LC, NT, VU, EN, CR, EW, EX, DD",\n'
    '  "summary": "one short paragraph: habitat, behavior, notable observations"\n'
    '}\n'
    'If you cannot identify the species, set species_name to "Unknown" '
    'and confidence to 0.0.'
)

_VALID_IUCN = {"LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD"}
MAX_SPECIES_UPLOAD_BYTES = 5 * 1024 * 1024

def _parse_species_json(text: str) -> dict:
    """Best-effort parse of the model's JSON response. Strips ```json fences if present."""
    raw = (text or "").strip()
    if raw.startswith("```"):
        # ```json ... ``` or ``` ... ```
        raw = raw.split("```", 2)[1]
        if raw.lower().startswith("json"):
            raw = raw[4:]
        raw = raw.strip().rstrip("`").strip()
    try:
        return json.loads(raw)
    except Exception:
        return {}

async def _identify_species_from_image(
    image_ref: str,
    zone_id: Optional[str] = None,
    image_source: str = "url",
    image_filename: Optional[str] = None,
    image_content_type: Optional[str] = None,
) -> dict:
    """Real species identification: deterministic-v1 by default, BioCLIP
    behind SPECIES_IDENTIFIER=bioclip. Output is reproducible per
    (image_bytes, zone_type) and the result is written as a signed
    observation so 'rare species detected at zone X by drone Y' is
    cryptographically defensible.
    """
    # Resolve the zone's biome so the classifier can apply the right priors.
    zone_doc = None
    if zone_id:
        zone_doc = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    biome = (zone_doc or {}).get("zone_type")

    # Recover the image bytes used by the classifier. For data-URL uploads
    # the bytes are inside image_ref; for plain URLs we hash the URL string
    # itself (not the remote bytes — fetching arbitrary URLs from prod is
    # an SSRF surface; the URL string is sufficient for deterministic ID).
    image_bytes: bytes
    if image_ref.startswith("data:image/") and ";base64," in image_ref:
        try:
            image_bytes = base64.b64decode(image_ref.split(";base64,", 1)[1], validate=True)
        except Exception:
            image_bytes = image_ref.encode("utf-8")
    else:
        image_bytes = (image_ref or "").encode("utf-8")

    try:
        result = _identify_species(image_bytes, zone_type=biome, top_k=3)
    except Exception as exc:
        logging.error("species identifier failed: %s", exc, exc_info=True)
        # Fail closed: emit Unknown with a minimal record so the dashboard
        # never sees None.
        result = {
            "top": {"species_name": "Unknown", "scientific_name": "", "conservation_status": "DD", "confidence": 0.0},
            "candidates": [],
            "method": "error-fallback",
            "biome": biome or "unknown",
            "input_hash": hashlib.sha256(image_bytes or b"").hexdigest(),
        }

    top = result["top"]
    identification_id = str(uuid.uuid4())
    identification = {
        "id": identification_id,
        "image_url": image_ref,
        "image_source": image_source,
        "image_filename": image_filename,
        "image_content_type": image_content_type,
        "zone_id": zone_id,
        "species_name": str(top.get("species_name") or "Unknown"),
        "scientific_name": str(top.get("scientific_name") or ""),
        "confidence": float(top.get("confidence") or 0.0),
        "conservation_status": str(top.get("conservation_status") or "DD"),
        "candidates": result.get("candidates", []),
        "method": result.get("method"),
        "biome": result.get("biome"),
        "input_hash": result.get("input_hash"),
        "ai_analysis": (
            f"Identified {top.get('species_name')} ({top.get('scientific_name')}) at "
            f"{int((top.get('confidence') or 0.0) * 100)}% confidence in {result.get('biome')} biome "
            f"via {result.get('method')}."
        ),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Provenance: every identification is a signed observation. This is
    # what makes "rare species detected" cryptographically defensible —
    # an auditor can verify the input_hash + species + zone tuple was
    # signed by us, didn't drift, and is anchored in time.
    try:
        await _record_observation(
            db,
            source_type="species_identification",
            source_id=identification_id,
            zone_id=zone_id,
            payload={
                "species_name": identification["species_name"],
                "scientific_name": identification["scientific_name"],
                "confidence": identification["confidence"],
                "conservation_status": identification["conservation_status"],
                "biome": identification["biome"],
                "input_hash": identification["input_hash"],
                "method": identification["method"],
            },
            observed_at=identification["created_at"],
        )
    except Exception as exc:
        # Don't fail the identification on a provenance write error — log
        # and carry on. The gap shows up in the attestation chain, which
        # is itself a signal worth investigating.
        logging.warning("provenance: failed to record species identification: %s", exc)

    return identification

@api_router.post("/species/identify")
async def identify_species(image_url: str, zone_id: Optional[str] = None):
    identification = await _identify_species_from_image(image_url, zone_id)
    return await insert_and_return(db.species_identifications, identification)

@api_router.post("/species/identify-upload")
async def identify_species_upload(payload: SpeciesUploadRequest):
    data_url = (payload.image_data_url or "").strip()
    if not data_url.startswith("data:image/") or ";base64," not in data_url:
        raise HTTPException(status_code=400, detail="Uploaded image must be a base64 image data URL")

    header, encoded = data_url.split(";base64,", 1)
    content_type = (payload.image_content_type or header.removeprefix("data:")).lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Uploaded image data is not valid base64")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")
    if len(image_bytes) > MAX_SPECIES_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded image must be 5MB or smaller")

    identification = await _identify_species_from_image(
        data_url,
        zone_id=payload.zone_id,
        image_source="upload",
        image_filename=payload.image_filename,
        image_content_type=content_type,
    )
    return await insert_and_return(db.species_identifications, identification)

@api_router.get("/species/identifiers")
async def get_species_identifiers():
    """Surfaces which species classifier is active so frontend / auditors
    can distinguish a deterministic-v1 ID from a real BioCLIP one. The
    `bioclip` slot is gated on SPECIES_IDENTIFIER=bioclip + torch +
    open_clip being importable; `available` always lists both options."""
    return identifier_info()


@api_router.get("/species/history")
async def get_species_identifications():
    return await db.species_identifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)

@api_router.get("/species/stats")
async def get_species_stats():
    identifications = await db.species_identifications.find({}, {"_id": 0}).to_list(1000)
    return {
        "total_identifications": len(identifications),
        "unique_species": len(set(i.get('species_name', '') for i in identifications)),
        "endangered_count": 0,
        "vulnerable_count": 0
    }

# Notifications
@api_router.post("/notifications/subscribe")
async def subscribe_to_notifications(email: str, name: str = ""):
    await db.email_subscriptions.update_one(
        {"email": email},
        {"$set": {"name": name, "is_active": True, "subscribed_to": ["critical_alert"]}},
        upsert=True
    )
    return {"message": "Subscribed"}

@api_router.get("/notifications/subscriptions")
async def get_subscriptions():
    return await db.email_subscriptions.find({"is_active": True}, {"_id": 0}).to_list(100)

@api_router.get("/notifications/history")
async def get_notification_history():
    return await db.email_notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)

# Seed data
@api_router.post("/seed")
async def seed_data(user: dict = Depends(require_role(["admin"]))):
    # Clear and reseed
    for collection in ['drones', 'robots', 'zones', 'sensors', 'alerts']:
        await db[collection].delete_many({})
    
    zones = [
        Zone(name="Amazon Basin Sector A", zone_type="forest", priority="critical", center_lat=-3.46, center_lng=-62.21, radius_km=50, biodiversity_index=0.72, soil_health=0.65, predator_prey_balance=0.58, vegetation_coverage=0.85),
        Zone(name="Borneo Peatland Reserve", zone_type="wetland", priority="high", center_lat=1.5, center_lng=110.0, radius_km=30, biodiversity_index=0.45, soil_health=0.38, predator_prey_balance=0.42, vegetation_coverage=0.55),
        Zone(name="Serengeti Corridor", zone_type="grassland", priority="medium", center_lat=-2.33, center_lng=34.83, radius_km=80, biodiversity_index=0.68, soil_health=0.72, predator_prey_balance=0.75, vegetation_coverage=0.62),
        Zone(name="Great Barrier Reef Edge", zone_type="coastal", priority="critical", center_lat=-18.28, center_lng=147.69, radius_km=25, biodiversity_index=0.35, soil_health=0.42, predator_prey_balance=0.48, vegetation_coverage=0.30),
        Zone(name="Gobi Restoration Site", zone_type="desert", priority="low", center_lat=42.5, center_lng=103.5, radius_km=100, biodiversity_index=0.25, soil_health=0.30, predator_prey_balance=0.55, vegetation_coverage=0.15),
    ]
    
    for zone in zones:
        doc = zone.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.zones.insert_one(doc)
    
    seeded_robot_count = 0

    async def _insert_seed_robot(robot: Robot):
        nonlocal seeded_robot_count
        doc = robot.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['last_active'] = doc['last_active'].isoformat()
        await db.robots.insert_one(doc)
        seeded_robot_count += 1

    for i in range(12):
        zone = random.choice(zones)
        drone = Drone(
            name=f"Sentinel-{str(i+1).zfill(3)}",
            zone_id=zone.id if random.random() > 0.3 else None,
            status=random.choice(["idle", "patrolling", "deployed", "charging"]),
            battery=random.randint(20, 100),
            latitude=zone.center_lat + random.uniform(-0.5, 0.5),
            longitude=zone.center_lng + random.uniform(-0.5, 0.5)
        )
        doc = drone.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['last_active'] = doc['last_active'].isoformat()
        await db.drones.insert_one(doc)
        await _insert_seed_robot(Robot(
            name=drone.name,
            robot_type="aerial",
            zone_id=drone.zone_id,
            status=drone.status,
            battery=drone.battery,
            health=max(45, min(100, drone.battery * 0.72 + 22)),
            autonomy_level=0.86,
            maintenance_state="charging_required" if drone.battery < 30 else "nominal",
            latitude=drone.latitude,
            longitude=drone.longitude,
            altitude=drone.altitude,
            mission_type=drone.mission_type,
            capabilities=["aerial_survey", "seed_dispersal", "overwatch"],
            metadata={"compat_drone_id": drone.id},
        ))

    robot_specs = [
        ("Soil Rover 11", "ground", zones[0], "standby", 82, 91, 0.74, ["soil_sampling", "trail_mapping", "payload_delivery"]),
        ("Ranger Mule 18", "ground", zones[1], "standby", 76, 88, 0.72, ["ranger_support", "payload_delivery"]),
        ("Trail Scout 23", "ground", zones[2], "mapping", 69, 84, 0.76, ["trail_inspection", "thermal_scan"]),
        ("Coral Medic", "aquatic", zones[3], "restoring", 91, 90, 0.81, ["coral_repair", "reef_mapping"]),
        ("Kelp Sower", "aquatic", zones[3], "seeding", 86, 87, 0.79, ["kelp_seeding", "carbon_monitoring"]),
        ("Net Cutter", "aquatic", zones[3], "intercept", 74, 79, 0.77, ["ghost_net_removal", "acoustic_relay"]),
        ("Acoustic Buoy 44", "fixed_sensor", zones[0], "listening", 96, 93, 0.68, ["bioacoustics", "edge_inference"]),
        ("Soil Probe C-12", "fixed_sensor", zones[4], "calibrating", 88, 81, 0.64, ["soil_carbon", "moisture_sensing"]),
        ("Camera Trap 09", "fixed_sensor", zones[1], "detecting", 72, 86, 0.70, ["camera_trap", "species_detection"]),
        ("Verdant Polar", "orbital", zones[0], "sweeping", 98, 98, 0.92, ["hyperspectral", "wide_area_detection"]),
        ("Verdant SWIR", "orbital", zones[0], "tasking", 94, 94, 0.91, ["swir_scan", "canopy_water_detection"]),
        ("Verdant Thermal", "orbital", zones[3], "queued", 91, 91, 0.89, ["thermal_scan", "reef_heat_stress"]),
    ]
    for name, robot_type, zone, status, battery, health, autonomy, capabilities in robot_specs:
        await _insert_seed_robot(Robot(
            name=name,
            robot_type=robot_type,
            zone_id=zone.id,
            status=status,
            battery=battery,
            health=health,
            autonomy_level=autonomy,
            maintenance_state="nominal" if health >= 80 else "inspection_due",
            latitude=zone.center_lat + random.uniform(-0.2, 0.2),
            longitude=zone.center_lng + random.uniform(-0.2, 0.2),
            depth_m=random.choice([22, 38, 61]) if robot_type == "aquatic" else None,
            altitude=random.choice([500000, 550000, 620000]) if robot_type == "orbital" else None,
            mission_type=status,
            capabilities=capabilities,
            metadata={"domain": robot_type, "seeded": True},
        ))
    
    return {"message": "Seed data created", "zones": len(zones), "drones": 12, "robots": seeded_robot_count}

@api_router.post("/_internal/drone-tick", include_in_schema=False)
async def drone_tick(user: dict = Depends(require_role(["admin"]))):
    """Run one drone-simulation step and return the broadcast payload.

    Internal helper — lets the test suite drive the simulator deterministically
    instead of sleeping for `DRONE_TICK_INTERVAL_S`. Excluded from OpenAPI.
    """
    updates = await tick_drone_simulation(db, manager)
    return {"updated": len(updates), "drones": updates}

# WebSocket
@app.websocket("/ws/updates")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(default=None)):
    # Auth: require a valid access token, supplied either via `?token=...`
    # query string (browsers can't set headers on WebSocket connections) or
    # via the Authorization: Bearer <token> header (for non-browser clients).
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:]
    if not token:
        # Browser WebSocket clients can't set headers, but cookies on the
        # handshake do come through — falls back to the access_token cookie
        # set by /api/auth/login so the React app doesn't need to surface
        # the raw JWT to JS just to open a socket.
        token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise jwt.InvalidTokenError("non-access token")
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4401)
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Root
@api_router.get("/")
async def root():
    return {"message": "Autonomous Ecosystem Architect API", "version": "2.0.0"}

# Include router
# ==================== PROVENANCE / OBSERVATION CHAIN ====================
# The verifiable rewilding layer. Every observation we record is signed
# with Ed25519 against a key whose public half is published at
# /.well-known/keys.json. Auditors verify the chain without trusting our
# servers — this is what turns the counterfactual chart into a primitive
# conservation credit issuers (Verra, Gold Standard) can defend.

@app.get("/.well-known/keys.json", include_in_schema=False)
async def well_known_keys():
    """Public verification keys (JWK format). Standard discovery path
    for any JOSE-compatible verifier — Ed25519 is OKP/Ed25519 in JWK terms."""
    return {"keys": [public_key_jwk()]}


@api_router.get("/observations")
async def list_observations(
    zone_id: Optional[str] = None,
    source_type: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 200,
):
    query: dict = {}
    if zone_id:
        query["zone_id"] = zone_id
    if source_type:
        query["source_type"] = source_type
    if since:
        query["observed_at"] = {"$gte": since}
    cap = max(1, min(int(limit or 200), 1000))
    return await db.observations.find(query, {"_id": 0}).sort("observed_at", -1).limit(cap).to_list(cap)


@api_router.get("/observations/{observation_id}")
async def get_observation(observation_id: str = Path(..., pattern=_UUID_ID_PATTERN)):
    obs = await db.observations.find_one({"id": observation_id}, {"_id": 0})
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")
    ok, reason = verify_observation(obs)
    return {**obs, "verification": {"valid": ok, "reason": reason}}


@api_router.post("/observations/verify")
async def verify_observation_endpoint(observation: dict):
    """Externally-verifiable: pass any signed observation, get back
    {valid, reason}. Doesn't require the observation to live in our DB —
    third-party auditors can hand-construct or fetch the payload from
    elsewhere and confirm it was signed by us."""
    ok, reason = verify_observation(observation)
    return {
        "valid": ok,
        "reason": reason,
        "key_id": observation.get("key_id"),
        "current_key_id": get_key_id(),
    }


@api_router.get("/zones/{zone_id}/attestation")
async def zone_attestation(
    zone_id: str = Path(..., pattern=_UUID_ID_PATTERN),
    hours: int = 24,
):
    """Aggregate root over recent signed zone observations. Auditor
    flow: GET this → verify each observation's signature → recompute
    the aggregate root → match. The flow is O(N), good enough for v1
    (upgrade to a real Merkle tree when N gets large)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max(1, min(int(hours or 24), 24 * 30)))).isoformat()
    obs = await db.observations.find(
        {"zone_id": zone_id, "observed_at": {"$gte": cutoff}},
        {"_id": 0, "id": 1, "digest": 1, "observed_at": 1, "source_type": 1, "source_id": 1, "key_id": 1, "signature": 1},
    ).sort("observed_at", 1).to_list(5000)
    digests = [o["digest"] for o in obs if o.get("digest")]
    aggregate = (
        hashlib.sha256("\n".join(sorted(digests)).encode("utf-8")).hexdigest()
        if digests
        else None
    )
    return {
        "zone_id": zone_id,
        "since": cutoff,
        "count": len(obs),
        "aggregate_root": aggregate,
        "key_id": get_key_id(),
        "observations": obs,
    }


app.include_router(api_router)

# ==================== MCP SURFACE ====================
# Mount the MCP server (Model Context Protocol) at /mcp so any MCP-
# compatible agent — Claude Desktop, Claude Code, MCP-aware GPT clients,
# custom LangChain agents — can run the platform autonomously. Gated on
# MCP_API_KEY; if the SDK isn't installed or the env var isn't set, the
# mount is skipped or returns 503 respectively. Backend boot does not
# fail when MCP is unavailable.
try:
    from mcp_server import mcp_http_app as _mcp_http_app
    if _mcp_http_app is not None:
        app.mount("/mcp", _mcp_http_app)
        logging.info("MCP server mounted at /mcp")
    else:
        logging.warning("MCP server module loaded but no HTTP app available; /mcp not mounted")
except Exception as _mcp_exc:  # pragma: no cover — defensive
    import traceback as _tb
    logging.warning("MCP server failed to mount, continuing without it: %s\n%s", _mcp_exc, _tb.format_exc())

# CORS — credentials=True requires an explicit origin allowlist (the wildcard
# `"*"` is incompatible with `Access-Control-Allow-Credentials: true`). Cookies
# are httpOnly and the frontend uses `withCredentials` to send them, so the
# allowlist must name every origin the frontend may run on.
_frontend_origins = []
for _origin_source in (
    os.environ.get("FRONTEND_URL", "http://localhost:3000"),
    os.environ.get("CORS_ORIGINS", ""),
):
    for _origin in _origin_source.split(","):
        _origin = _origin.strip()
        if _origin and _origin != "*" and _origin not in _frontend_origins:
            _frontend_origins.append(_origin)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_frontend_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mongo init runs in the background with retries so a transient Mongo
# outage at boot doesn't crash-loop the entire backend. Idempotent —
# `create_index` is a no-op when the index already exists; the admin
# seed checks-then-creates. Once Mongo cooperates, this exits.
_MONGO_INIT_RETRY_SECONDS = 30


async def _ensure_mongo_init():
    while True:
        try:
            await db.users.create_index("email", unique=True)
            await db.login_attempts.create_index("identifier")
            existing = await db.users.find_one({"email": ADMIN_EMAIL})
            if not existing:
                await db.users.insert_one({
                    "email": ADMIN_EMAIL,
                    "password_hash": hash_password(ADMIN_PASSWORD),
                    "name": "System Admin",
                    "role": "admin",
                    "created_at": datetime.now(timezone.utc)
                })
                logging.info("Admin user created: %s", ADMIN_EMAIL)
            logging.info("Mongo init complete (indexes + admin seed)")
            return
        except Exception as exc:
            logging.warning(
                "Mongo init failed (retrying in %ds): %s",
                _MONGO_INIT_RETRY_SECONDS, exc,
            )
            await asyncio.sleep(_MONGO_INIT_RETRY_SECONDS)


# Startup events — must NOT raise. A failure here causes the whole
# FastAPI lifespan to fail, the app exits, Railway restart-loops it,
# and a transient Mongo blip becomes a full platform outage. Every
# Mongo-touching op is now deferred to a background coroutine that
# retries with backoff. The app stays up serving requests; routes that
# need Mongo will surface their own 503s when they hit a closed
# connection, which is the right granularity.
@app.on_event("startup")
async def startup_events():
    # Defer Mongo init — won't block startup, won't crash the app.
    asyncio.create_task(_ensure_mongo_init())

    # DEV_MODE-gated credentials file write — pure filesystem, no Mongo.
    # The file contains the admin password in plaintext, so it must
    # never be created in any environment other than local dev.
    try:
        if os.environ.get("DEV_MODE", "").lower() in {"1", "true", "yes"}:
            creds_dir = ROOT_DIR.parent / "memory"
            creds_dir.mkdir(exist_ok=True)
            with open(creds_dir / "test_credentials.md", "w") as f:
                f.write(f"""# Test Credentials

## Admin Account
- Email: {ADMIN_EMAIL}
- Password: {ADMIN_PASSWORD}
- Role: admin

## Auth Endpoints
- POST /api/auth/login
- POST /api/auth/register
- POST /api/auth/logout
- GET /api/auth/me
""")
    except Exception as exc:
        logging.warning("test_credentials.md write skipped: %s", exc)

    # Start drone simulation (loop lives in simulator.py and is itself
    # supervised — each tick is wrapped in try/except + backoff).
    asyncio.create_task(run_drone_simulation_loop(db, manager))

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

logging.basicConfig(level=logging.INFO)
