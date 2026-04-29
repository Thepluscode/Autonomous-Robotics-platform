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

# ==================== AUTH MODELS ====================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "viewer"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime

class PasswordReset(BaseModel):
    token: str
    new_password: str

class ForgotPassword(BaseModel):
    email: EmailStr

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

# ==================== EXISTING MODELS ====================

class DroneBase(BaseModel):
    name: str
    zone_id: Optional[str] = None
    status: str = "idle"
    battery: float = 100
    latitude: float = 0.0
    longitude: float = 0.0
    altitude: float = 50.0
    mission_type: Optional[str] = None

class Drone(DroneBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_active: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DroneCreate(DroneBase):
    pass

class DroneUpdate(BaseModel):
    name: Optional[str] = None
    zone_id: Optional[str] = None
    status: Optional[str] = None
    battery: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    mission_type: Optional[str] = None

class ZoneBase(BaseModel):
    name: str
    description: Optional[str] = None
    zone_type: str = "forest"
    priority: str = "medium"
    center_lat: float = 0.0
    center_lng: float = 0.0
    radius_km: float = 5.0
    biodiversity_index: float = 0.5
    soil_health: float = 0.5
    predator_prey_balance: float = 0.5
    vegetation_coverage: float = 0.5

class Zone(ZoneBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ZoneCreate(ZoneBase):
    pass

class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    zone_type: Optional[str] = None
    priority: Optional[str] = None
    biodiversity_index: Optional[float] = None
    soil_health: Optional[float] = None
    predator_prey_balance: Optional[float] = None
    vegetation_coverage: Optional[float] = None

class SensorBase(BaseModel):
    name: str
    sensor_type: str
    zone_id: Optional[str] = None
    latitude: float = 0.0
    longitude: float = 0.0
    status: str = "active"
    current_value: float = 0.0
    unit: str = ""

class Sensor(SensorBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_reading: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SensorCreate(SensorBase):
    pass

class AlertBase(BaseModel):
    title: str
    message: str
    severity: str = "info"
    zone_id: Optional[str] = None
    drone_id: Optional[str] = None
    alert_type: str = "system"

class Alert(AlertBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_read: bool = False

class AlertCreate(AlertBase):
    pass

class AIAnalysisRequest(BaseModel):
    zone_id: Optional[str] = None
    analysis_type: str = "general"

class AIAnalysisResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    zone_id: Optional[str] = None
    analysis_type: str
    recommendations: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeployMissionRequest(BaseModel):
    drone_ids: List[str]
    zone_id: str
    mission_type: str

class DashboardStats(BaseModel):
    total_drones: int
    active_drones: int
    total_zones: int
    critical_zones: int
    total_sensors: int
    active_sensors: int
    unread_alerts: int
    avg_biodiversity: float
    avg_soil_health: float

# Patrol Models
class PatrolWaypoint(BaseModel):
    zone_id: str
    zone_name: str
    priority_score: float
    estimated_duration_mins: int
    tasks: List[str]
    latitude: float
    longitude: float

class PatrolScheduleBase(BaseModel):
    name: str
    drone_ids: List[str]
    schedule_type: str = "daily"
    start_time: Optional[str] = None
    status: str = "pending"

class PatrolSchedule(PatrolScheduleBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    waypoints: List[dict] = []
    total_distance_km: float = 0.0
    estimated_duration_mins: int = 0
    efficiency_score: float = 0.0
    ai_reasoning: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PatrolScheduleCreate(BaseModel):
    name: str
    drone_ids: List[str]
    schedule_type: str = "daily"
    optimization_priority: str = "balanced"

class PatrolScheduleUpdate(BaseModel):
    status: Optional[str] = None
    start_time: Optional[str] = None

class PatrolReportBase(BaseModel):
    patrol_id: str
    patrol_name: str
    status: str = "completed"
    total_waypoints_visited: int = 0
    total_duration_mins: int = 0
    total_distance_km: float = 0.0

class PatrolReport(PatrolReportBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    drone_ids: List[str] = []
    zone_data_collected: List[dict] = []
    biodiversity_observations: List[dict] = []
    soil_samples_collected: int = 0
    wildlife_sightings: int = 0
    anomalies_detected: List[dict] = []
    efficiency_achieved: float = 0.0
    ai_summary: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Weather Models (Mocked)
class WeatherData(BaseModel):
    zone_id: str
    zone_name: str
    temperature: float
    humidity: float
    wind_speed: float
    conditions: str
    forecast: List[dict] = []
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Intervention Rules Models
class InterventionRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    condition_type: str  # biodiversity, soil_health, predator_prey
    condition_operator: str  # lt, gt, eq
    condition_value: float
    condition_duration_days: int = 1
    action_type: str  # deploy_drones, alert, schedule_patrol
    action_config: dict = {}
    is_active: bool = True
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InterventionRuleCreate(BaseModel):
    name: str
    description: str
    condition_type: str
    condition_operator: str
    condition_value: float
    condition_duration_days: int = 1
    action_type: str
    action_config: dict = {}

# Forecasting Models
class EcosystemForecast(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    zone_id: str
    zone_name: str
    forecast_type: str  # biodiversity, soil_health
    current_value: float
    predictions: List[dict] = []  # [{days: 30, value: 0.45, confidence: 0.8}]
    trend: str  # improving, declining, stable
    risk_level: str  # low, medium, high, critical
    ai_analysis: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Geofencing Models
class Geofence(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    zone_id: Optional[str] = None
    fence_type: str = "protected"  # protected, restricted, monitored
    coordinates: List[dict] = []  # polygon points
    center_lat: float = 0.0
    center_lng: float = 0.0
    radius_km: float = 1.0
    alerts_enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GeofenceCreate(BaseModel):
    name: str
    zone_id: Optional[str] = None
    fence_type: str = "protected"
    center_lat: float
    center_lng: float
    radius_km: float

# Team/Organization Models
class Organization(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    admin_user_id: str
    member_ids: List[str] = []
    shared_zone_ids: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    assigned_to: Optional[str] = None
    zone_id: Optional[str] = None
    priority: str = "medium"
    status: str = "pending"  # pending, in_progress, completed
    due_date: Optional[datetime] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskCreate(BaseModel):
    title: str
    description: str = ""
    assigned_to: Optional[str] = None
    zone_id: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[str] = None

class Comment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str  # zone, patrol, task
    entity_id: str
    user_id: str
    user_name: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SpeciesUploadRequest(BaseModel):
    image_data_url: str
    zone_id: Optional[str] = None
    image_filename: Optional[str] = None
    image_content_type: Optional[str] = None

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
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
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
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
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
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
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
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        
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
            drone_id=v["drone_id"],
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
_DRONE_ID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"

@api_router.get("/drones/{drone_id}", response_model=Drone)
async def get_drone(drone_id: str = Path(..., regex=_DRONE_ID_PATTERN)):
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
async def update_drone(update_data: DroneUpdate, drone_id: str = Path(..., regex=_DRONE_ID_PATTERN)):
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
async def delete_drone(drone_id: str = Path(..., regex=_DRONE_ID_PATTERN)):
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
        alert_type="drone"
    )
    alert_doc = alert.model_dump()
    alert_doc['created_at'] = alert_doc['created_at'].isoformat()
    await db.alerts.insert_one(alert_doc)
    
    return {"message": f"Deployed {updated_count} drones", "deployed_count": updated_count}

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
    zones = await db.zones.find({}, {"_id": 0}).to_list(1000)
    sensors = await db.sensors.find({}, {"_id": 0}).to_list(1000)
    unread_alerts = await db.alerts.count_documents({"is_read": False})
    
    avg_biodiversity = sum(z.get('biodiversity_index', 0) for z in zones) / max(len(zones), 1)
    avg_soil_health = sum(z.get('soil_health', 0) for z in zones) / max(len(zones), 1)
    
    return DashboardStats(
        total_drones=len(drones),
        active_drones=len([d for d in drones if d.get('status') in ['deployed', 'patrolling']]),
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
    try:
        chat = make_llm_chat(
            session_id=f"species-{uuid.uuid4()}",
            system_message="You are a wildlife biologist. Identify species from images.",
        )
        response = await chat.send_message(
            UserMessage(text=SPECIES_PROMPT, image_urls=[image_ref]),
            json_mode=True,
        )

        parsed = _parse_species_json(response)

        # Coerce + validate every field; fall back to safe defaults on bad data so
        # the dashboard never sees None/wrong-type values.
        try:
            confidence = float(parsed.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        status = str(parsed.get("conservation_status", "DD")).upper().strip()
        if status not in _VALID_IUCN:
            status = "DD"

        identification = {
            "id": str(uuid.uuid4()),
            "image_url": image_ref,
            "image_source": image_source,
            "image_filename": image_filename,
            "image_content_type": image_content_type,
            "zone_id": zone_id,
            "species_name": str(parsed.get("species_name") or "Unknown"),
            "scientific_name": str(parsed.get("scientific_name") or ""),
            "confidence": confidence,
            "conservation_status": status,
            "ai_analysis": str(parsed.get("summary") or response),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logging.error(f"Species identification error: {e}", exc_info=True)
        identification = {
            "id": str(uuid.uuid4()),
            "image_url": image_ref,
            "image_source": image_source,
            "image_filename": image_filename,
            "image_content_type": image_content_type,
            "zone_id": zone_id,
            "species_name": "Unknown",
            "confidence": 0,
            "ai_analysis": str(e),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
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
    for collection in ['drones', 'zones', 'sensors', 'alerts']:
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
    
    return {"message": "Seed data created", "zones": len(zones), "drones": 12}

@api_router.post("/_internal/drone-tick", include_in_schema=False)
async def drone_tick(user: dict = Depends(require_role(["admin"]))):
    """Run one drone-simulation step and return the broadcast payload.

    Internal helper — lets the test suite drive the simulator deterministically
    instead of sleeping for `DRONE_TICK_INTERVAL_S`. Excluded from OpenAPI.
    """
    updates = await _tick_drone_simulation()
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
app.include_router(api_router)

# CORS
frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup events
@app.on_event("startup")
async def startup_events():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    
    # Seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "System Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logging.info(f"Admin user created: {ADMIN_EMAIL}")
    
    # Write test credentials — gated on DEV_MODE because the file contains
    # the admin password in plaintext. In any non-dev environment the file
    # would be a credential leak waiting to happen.
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
    
    # Start drone simulation
    asyncio.create_task(simulate_drone_movements())

# Drone simulation — converges drones toward their assigned zone center each
# tick (replaces the previous random-jitter loop, which was the visible source
# of "no dynamic operation"). Position diffs are broadcast over the WebSocket
# so connected clients update in real time without polling.

DRONE_TICK_INTERVAL_S = 5
DRONE_STEP_DEG = 0.05      # ≈5 km horizontal move per tick at the equator
DRONE_ARRIVED_DEG = 0.04   # within this distance the drone is "on station"
DRONE_MIN_BATTERY = 5.0

async def _tick_drone_simulation() -> List[dict]:
    """One simulation tick. Returns the list of broadcast payloads (also
    extracted so tests can drive the simulator deterministically)."""
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

async def simulate_drone_movements():
    while True:
        try:
            await _tick_drone_simulation()
        except Exception as exc:
            logging.warning("drone simulation tick failed: %s", exc)
            await asyncio.sleep(DRONE_TICK_INTERVAL_S * 2)
            continue
        await asyncio.sleep(DRONE_TICK_INTERVAL_S)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

logging.basicConfig(level=logging.INFO)
