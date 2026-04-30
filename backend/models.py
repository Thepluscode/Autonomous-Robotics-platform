"""Pydantic request/response/entity models.

Pulled out of server.py so the models live in one searchable place. Server
re-exports everything via `from models import *`, so route handlers don't
need to change. Add new models here, not in server.py.

The user model is *not* defined here because it's stored as a raw Mongo
document keyed by ObjectId (auth code in server.py converts on the way
in/out). Keeping that asymmetry visible in server.py is intentional.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


# ==================== DRONE / ZONE / SENSOR / ALERT ====================

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


class RobotBase(BaseModel):
    name: str
    robot_type: str = "aerial"  # aerial, ground, aquatic, fixed_sensor, orbital
    zone_id: Optional[str] = None
    status: str = "idle"
    battery: float = 100
    health: float = 100
    autonomy_level: float = 0.75
    maintenance_state: str = "nominal"
    latitude: float = 0.0
    longitude: float = 0.0
    altitude: Optional[float] = None
    depth_m: Optional[float] = None
    mission_type: Optional[str] = None
    capabilities: List[str] = []
    metadata: dict = {}


class Robot(RobotBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_active: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RobotCreate(RobotBase):
    pass


class RobotUpdate(BaseModel):
    name: Optional[str] = None
    robot_type: Optional[str] = None
    zone_id: Optional[str] = None
    status: Optional[str] = None
    battery: Optional[float] = None
    health: Optional[float] = None
    autonomy_level: Optional[float] = None
    maintenance_state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude: Optional[float] = None
    depth_m: Optional[float] = None
    mission_type: Optional[str] = None
    capabilities: Optional[List[str]] = None
    metadata: Optional[dict] = None


class RobotTaskRequest(BaseModel):
    zone_id: Optional[str] = None
    mission_type: str = "monitoring"
    status: str = "assigned"
    notes: str = ""


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


# ==================== AI ====================

class AIAnalysisRequest(BaseModel):
    zone_id: Optional[str] = None
    analysis_type: str = "general"


class AIAnalysisResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    zone_id: Optional[str] = None
    analysis_type: str
    recommendations: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== DEPLOY / DASHBOARD ====================

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


# ==================== MISSIONS ====================

class MissionReadinessCheck(BaseModel):
    label: str
    value: float


class MissionGenerateRequest(BaseModel):
    """Minimal input the operator (or an AI agent) sends to ask for a plan.

    Everything else on `MissionCreate` (drones, readiness, risk, timeline,
    directives, counterfactual evidence) is computed server-side by the
    planner. This is the moonshot wedge: the *plan* is the product, not the
    UI of clicking through a wizard.
    """
    zone_id: Optional[str] = None  # if absent, planner picks the highest-leverage zone
    mission_type: str = "patrol"   # patrol | inspect | intervene
    max_drones: int = 3            # planner won't assign more than this; may assign fewer
    notes: str = ""                # free-text context the operator wants surfaced in the audit trail


class MissionAbortRequest(BaseModel):
    """Aborts must carry a reason — silent aborts hide signal we need to learn from."""
    reason: str


class MissionCreate(BaseModel):
    name: str
    zone_id: str
    zone_name: str
    mission_type: str
    drone_ids: List[str] = []
    sensor_ids: List[str] = []
    geofence_ids: List[str] = []
    risk_score: float = 0.0
    go_score: float = 0.0
    estimated_duration_mins: int = 0
    coverage_km: float = 0.0
    readiness: List[MissionReadinessCheck] = []
    timeline: List[str] = []
    directives: List[str] = []
    evidence: dict = {}


class Mission(MissionCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "draft"  # draft, ready, authorized, active, completed, aborted
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    authorized_by: Optional[str] = None
    authorized_at: Optional[datetime] = None
    launched_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    aborted_at: Optional[datetime] = None
    launch_result: Optional[dict] = None
    post_mission_summary: str = ""
    post_mission_report: dict = {}
    audit_trail: List[dict] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== PATROL ====================

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


# ==================== WEATHER (mocked) ====================

class WeatherData(BaseModel):
    zone_id: str
    zone_name: str
    temperature: float
    humidity: float
    wind_speed: float
    conditions: str
    forecast: List[dict] = []
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== INTERVENTION RULES ====================

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


# ==================== FORECASTING ====================

class EcosystemForecast(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    zone_id: str
    zone_name: str
    forecast_type: str  # biodiversity, soil_health
    current_value: float
    predictions: List[dict] = []
    trend: str  # improving, declining, stable
    risk_level: str  # low, medium, high, critical
    ai_analysis: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== GEOFENCING ====================

class Geofence(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    zone_id: Optional[str] = None
    fence_type: str = "protected"  # protected, restricted, monitored
    coordinates: List[dict] = []
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


# ==================== TEAM / ORG / TASKS / COMMENTS ====================

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


# ==================== SPECIES ====================

class SpeciesUploadRequest(BaseModel):
    image_data_url: str
    zone_id: Optional[str] = None
    image_filename: Optional[str] = None
    image_content_type: Optional[str] = None
