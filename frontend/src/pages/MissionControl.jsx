import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import {
  Activity,
  AlertTriangle,
  Battery,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FileText,
  Gauge,
  Map,
  Radar,
  Rocket,
  Route,
  SatelliteDish,
  Shield,
  Target,
  Timer,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  alertAPI,
  droneAPI,
  geofenceAPI,
  missionAPI,
  patrolAPI,
  robotAPI,
  sensorAPI,
  zoneAPI,
} from "../lib/api";
import { cn } from "../lib/utils";
import useWebSocket from "../hooks/useWebSocket";

const priorityWeight = {
  critical: 28,
  high: 20,
  medium: 12,
  low: 5,
};

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function zoneHealth(zone) {
  const values = [
    zone.biodiversity_index,
    zone.soil_health,
    zone.predator_prey_balance,
    zone.vegetation_coverage,
  ].filter((value) => typeof value === "number");
  if (!values.length) return 0.5;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function riskScore(zone, sensors, geofences, alerts) {
  const healthRisk = (1 - zoneHealth(zone)) * 62;
  const priorityRisk = priorityWeight[zone.priority] || priorityWeight.medium;
  const sensorRisk = sensors.filter((sensor) => sensor.zone_id === zone.id && sensor.status !== "active").length * 7;
  const fenceRisk = geofences.filter((fence) => fence.zone_id === zone.id && fence.fence_type === "restricted").length * 6;
  const alertRisk = alerts.filter((alert) => alert.zone_id === zone.id && !alert.is_read).length * 8;
  return clamp(Math.round(healthRisk + priorityRisk + sensorRisk + fenceRisk + alertRisk));
}

function riskBand(score) {
  if (score >= 78) return { label: "redline", variant: "destructive", className: "text-red-700" };
  if (score >= 58) return { label: "elevated", variant: "warning", className: "text-amber-700" };
  return { label: "go", variant: "success", className: "text-emerald-700" };
}

function statusClass(status) {
  if (status === "idle") return "success";
  if (status === "charging") return "warning";
  if (status === "deployed" || status === "patrolling") return "info";
  return "outline";
}

function formatMissionType(type) {
  return (type || "mission").replaceAll("_", " ");
}

function toPercent(value) {
  const numeric = Number(value || 0);
  return clamp(Math.round(numeric <= 1 ? numeric * 100 : numeric));
}

function readinessIcon(label) {
  const normalized = label.toLowerCase();
  if (normalized.includes("robot") || normalized.includes("drone") || normalized.includes("battery")) return Rocket;
  if (normalized.includes("geofence")) return Shield;
  if (normalized.includes("weather")) return Gauge;
  return SatelliteDish;
}

function labelize(value) {
  return (value || "").replaceAll("_", " ");
}

function legacyDroneAsRobot(drone) {
  return {
    ...drone,
    robot_type: "aerial",
    health: drone.battery,
    autonomy_level: 0.76,
    capabilities: ["aerial_survey", "legacy_drone_feed"],
    source: "legacy_drone",
  };
}

function missionAssets(mission, robots, drones, sensors, geofences, alerts) {
  if (!mission) return { robots: [], drones: [], sensors: [], geofences: [], alerts: [] };
  const assignedRobots = robots.filter((robot) => mission.robot_ids?.includes(robot.id));
  const assignedDrones = drones.filter((drone) => mission.drone_ids?.includes(drone.id));
  const projectedRobots = assignedRobots.length ? assignedRobots : assignedDrones.map(legacyDroneAsRobot);
  return {
    robots: projectedRobots,
    drones: assignedDrones,
    sensors: sensors.filter((sensor) => mission.sensor_ids?.includes(sensor.id)),
    geofences: geofences.filter((fence) => mission.geofence_ids?.includes(fence.id)),
    alerts: alerts.filter((alert) => alert.zone_id === mission.zone_id).slice(0, 5),
  };
}

function missionToPlan(mission, targetZone, robots, drones, sensors, geofences, alerts, patrols) {
  if (!mission) return null;
  const assets = missionAssets(mission, robots, drones, sensors, geofences, alerts);
  return {
    id: mission.id,
    name: mission.name,
    targetZone: targetZone || { id: mission.zone_id, name: mission.zone_name },
    targetRisk: toPercent(mission.risk_score),
    missionType: mission.mission_type,
    goScore: toPercent(mission.go_score),
    readiness: (mission.readiness || []).map((item) => ({
      label: labelize(item.label),
      value: toPercent(item.value),
      icon: readinessIcon(item.label || ""),
    })),
    assets,
    adjacentZones: [],
    estimatedDuration: mission.estimated_duration_mins || 0,
    coverageKm: mission.coverage_km || 0,
    patrolCount: patrols.length,
    timeline: mission.timeline || [],
    directives: mission.directives || [],
    evidence: mission.evidence || {},
  };
}

function hasCoordinate(item, latKey = "latitude", lngKey = "longitude") {
  return typeof item?.[latKey] === "number" && typeof item?.[lngKey] === "number";
}

function buildMissionProjector(zone, drones, sensors, geofences) {
  const points = [];
  if (hasCoordinate(zone, "center_lat", "center_lng")) points.push([zone.center_lat, zone.center_lng]);
  drones.forEach((drone) => {
    if (hasCoordinate(drone)) points.push([drone.latitude, drone.longitude]);
  });
  sensors.forEach((sensor) => {
    if (hasCoordinate(sensor)) points.push([sensor.latitude, sensor.longitude]);
  });
  geofences.forEach((fence) => {
    if (hasCoordinate(fence, "center_lat", "center_lng")) points.push([fence.center_lat, fence.center_lng]);
  });

  const bounds = points.length
    ? points.reduce((acc, [lat, lng]) => ({
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
      minLng: Math.min(acc.minLng, lng),
      maxLng: Math.max(acc.maxLng, lng),
    }), { minLat: points[0][0], maxLat: points[0][0], minLng: points[0][1], maxLng: points[0][1] })
    : { minLat: -1, maxLat: 1, minLng: 19, maxLng: 21 };

  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.02);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.02);
  const scale = 28 / Math.max(latSpan, lngSpan);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const midLng = (bounds.minLng + bounds.maxLng) / 2;

  return {
    project(lat = midLat, lng = midLng, altitude = 0) {
      return new THREE.Vector3((lng - midLng) * scale, altitude, -(lat - midLat) * scale);
    },
    radius(km = 1) {
      return clamp(km * scale * 0.01, 0.9, 8);
    },
  };
}

function disposeThreeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material.dispose();
    }
  });
}

function makeTheatreLabel(text, eyebrow = "mission asset") {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 104;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(246, 249, 239, 0.92)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(77, 99, 74, 0.58)";
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  context.fillStyle = "#16311f";
  context.font = "700 27px 'DM Sans', sans-serif";
  context.fillText(String(text || "Asset").slice(0, 18), 18, 42);
  context.fillStyle = "rgba(79, 91, 72, 0.88)";
  context.font = "500 15px 'JetBrains Mono', monospace";
  context.fillText(eyebrow.slice(0, 28), 18, 70);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.2, 1.35, 1);
  return sprite;
}

function MissionTheatre3D({ mission, plan, selectedZone, robots, drones, sensors, geofences, isConnected }) {
  const mountRef = useRef(null);
  const fallbackCanvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const groupRef = useRef(null);
  const animatedRef = useRef([]);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    if (webglUnavailable) return undefined;
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef2e7");
    scene.fog = new THREE.Fog("#eef2e7", 36, 82);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 180);
    camera.position.set(21, 22, 27);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (error) {
      setWebglUnavailable(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.dataset.testid = "mission-theatre-canvas";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 13;
    controls.maxDistance = 58;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.HemisphereLight("#fbfff0", "#7a6b49", 2.25);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight("#fff4d2", 2.5);
    sun.position.set(18, 30, 16);
    sun.castShadow = true;
    scene.add(sun);

    const group = new THREE.Group();
    scene.add(group);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    groupRef.current = group;

    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = performance.now() * 0.001;
      animatedRef.current.forEach((object) => {
        if (object.userData.kind === "drone") {
          object.position.y = object.userData.baseY + Math.sin(elapsed * 2.2 + object.userData.offset) * 0.18;
          object.rotation.y += 0.012;
        }
        if (object.userData.kind === "radar") {
          object.rotation.z += object.userData.speed;
        }
      });
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      controls.dispose();
      disposeThreeObject(group);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [webglUnavailable]);

  useEffect(() => {
    if (!webglUnavailable) return;
    const canvas = fallbackCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(640, Math.round(rect.width * window.devicePixelRatio));
    const height = Math.max(420, Math.round(rect.height * window.devicePixelRatio));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = width / window.devicePixelRatio;
    const h = height / window.devicePixelRatio;
    ctx.fillStyle = "#eef2e7";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(91, 113, 78, 0.28)";
    ctx.lineWidth = 1;
    for (let x = -w; x < w * 1.5; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + w * 0.65, 0);
      ctx.stroke();
    }
    for (let y = 40; y < h + 120; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y - w * 0.45);
      ctx.stroke();
    }

    const cx = w * 0.48;
    const cy = h * 0.54;
    ctx.fillStyle = "#506a45";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 94, 38, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d98c45";
    ctx.lineWidth = 3;
    [58, 92, 128].forEach((radius) => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * 0.42, -0.28, 0, Math.PI * 2);
      ctx.stroke();
    });

    const theatreRobots = (plan?.assets.robots.length ? plan.assets.robots : robots.length ? robots : drones.map(legacyDroneAsRobot)).slice(0, 6);
    theatreRobots.forEach((robot, index) => {
      const angle = (index / Math.max(1, theatreRobots.length)) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * (150 + index * 8);
      const y = cy + Math.sin(angle) * (64 + index * 4);
      ctx.strokeStyle = "rgba(217, 140, 69, 0.86)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + cx) / 2, Math.min(y, cy) - 88, cx, cy);
      ctx.stroke();
      ctx.fillStyle = "#243d2c";
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillRect(-16, -5, 32, 10);
      ctx.fillStyle = "#d98c45";
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(8, 2);
      ctx.lineTo(-8, 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#16311f";
      ctx.font = "600 12px 'DM Sans', sans-serif";
      ctx.fillText(robot.name || `Robot ${index + 1}`, x + 14, y - 14);
    });

    const theatreSensors = (plan?.assets.sensors.length ? plan.assets.sensors : sensors.filter((sensor) => sensor.zone_id === selectedZone?.id)).slice(0, 10);
    theatreSensors.forEach((sensor, index) => {
      const x = 60 + (index % 5) * 88;
      const y = h - 92 - Math.floor(index / 5) * 54;
      ctx.fillStyle = sensor.status === "active" ? "#315f3a" : "#b7791f";
      ctx.fillRect(x, y - 26, 8, 26);
      ctx.strokeStyle = sensor.status === "active" ? "#5fa66d" : "#d6a044";
      ctx.beginPath();
      ctx.ellipse(x + 4, y - 30, 20, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.fillStyle = "#16311f";
    ctx.font = "700 20px 'DM Sans', sans-serif";
    ctx.fillText(plan?.targetZone?.name || selectedZone?.name || "Mission Theatre", 24, 86);
    ctx.font = "500 12px 'JetBrains Mono', monospace";
    ctx.fillText(`${mission?.status || "planning"} / ${isConnected ? "live stream" : "polling"}`, 24, 108);
  }, [webglUnavailable, mission, plan, selectedZone, robots, drones, sensors, isConnected]);

  useEffect(() => {
    if (webglUnavailable) return;
    const group = groupRef.current;
    if (!group) return;
    while (group.children.length) {
      const child = group.children.pop();
      disposeThreeObject(child);
    }
    animatedRef.current = [];

    const zone = plan?.targetZone || selectedZone;
    const assets = plan?.assets || missionAssets(mission, robots, drones, sensors, geofences, []);
    const theatreRobots = assets.robots.length ? assets.robots : robots.length ? robots.slice(0, 6) : drones.slice(0, 6).map(legacyDroneAsRobot);
    const theatreSensors = assets.sensors.length ? assets.sensors : sensors.filter((sensor) => sensor.zone_id === zone?.id).slice(0, 10);
    const theatreGeofences = assets.geofences.length ? assets.geofences : geofences.filter((fence) => fence.zone_id === zone?.id).slice(0, 5);
    const projector = buildMissionProjector(zone, theatreRobots, theatreSensors, theatreGeofences);
    const target = hasCoordinate(zone, "center_lat", "center_lng")
      ? projector.project(zone.center_lat, zone.center_lng, 0.16)
      : new THREE.Vector3(0, 0.16, 0);

    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42, 32, 32),
      new THREE.MeshStandardMaterial({ color: "#dce2ca", roughness: 0.95, metalness: 0.02 })
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    group.add(terrain);

    const grid = new THREE.GridHelper(42, 24, "#7d8d67", "#c1c9ae");
    grid.position.y = 0.03;
    group.add(grid);

    const targetBase = new THREE.Mesh(
      new THREE.CylinderGeometry(2.8, 3.6, 0.36, 72),
      new THREE.MeshStandardMaterial({ color: "#506a45", roughness: 0.74, metalness: 0.08 })
    );
    targetBase.position.copy(target);
    targetBase.position.y = 0.18;
    targetBase.castShadow = true;
    group.add(targetBase);

    const targetRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.9, 0.035, 10, 128),
      new THREE.MeshBasicMaterial({ color: "#d98c45" })
    );
    targetRing.position.set(target.x, 0.45, target.z);
    targetRing.rotation.x = Math.PI / 2;
    targetRing.userData = { kind: "radar", speed: 0.004 };
    animatedRef.current.push(targetRing);
    group.add(targetRing);

    const targetLabel = makeTheatreLabel(zone?.name || mission?.zone_name || "Target zone", `${mission?.status || "planning"} / risk ${plan?.targetRisk ?? 0}`);
    targetLabel.position.set(target.x, 3.4, target.z);
    group.add(targetLabel);

    theatreGeofences.forEach((fence) => {
      if (!hasCoordinate(fence, "center_lat", "center_lng")) return;
      const position = projector.project(fence.center_lat, fence.center_lng, 0.08);
      const radius = projector.radius(fence.radius_km || 2);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.045, 8, 128),
        new THREE.MeshBasicMaterial({ color: fence.fence_type === "restricted" ? "#c2412f" : "#627a50" })
      );
      ring.position.set(position.x, 0.3, position.z);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    });

    theatreSensors.forEach((sensor, index) => {
      if (!hasCoordinate(sensor)) return;
      const position = projector.project(sensor.latitude, sensor.longitude, 0.28);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.11, 0.85, 12),
        new THREE.MeshStandardMaterial({ color: sensor.status === "active" ? "#315f3a" : "#b7791f", roughness: 0.62 })
      );
      mast.position.set(position.x, 0.48, position.z);
      mast.castShadow = true;
      group.add(mast);

      const pulse = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.018, 8, 36),
        new THREE.MeshBasicMaterial({ color: sensor.status === "active" ? "#5fa66d" : "#d6a044" })
      );
      pulse.position.set(position.x, 0.94, position.z);
      pulse.rotation.x = Math.PI / 2;
      pulse.userData = { kind: "radar", speed: 0.008 + index * 0.0006 };
      animatedRef.current.push(pulse);
      group.add(pulse);
    });

    theatreRobots.forEach((robot, index) => {
      if (!hasCoordinate(robot)) return;
      const altitude = robot.robot_type === "ground" ? 0.72 : robot.robot_type === "aquatic" ? 0.48 : 2.2 + index * 0.18;
      const position = projector.project(robot.latitude, robot.longitude, altitude);
      const droneGroup = new THREE.Group();
      droneGroup.position.copy(position);
      droneGroup.userData = { kind: "drone", baseY: position.y, offset: index * 0.8 };

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.16, 0.42),
        new THREE.MeshStandardMaterial({ color: robot.status === "offline" ? "#8a4b3f" : "#243d2c", roughness: 0.48, metalness: 0.18 })
      );
      body.castShadow = true;
      droneGroup.add(body);

      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.38, 18),
        new THREE.MeshStandardMaterial({ color: "#d98c45", roughness: 0.42, metalness: 0.12 })
      );
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = 0.48;
      droneGroup.add(nose);

      [[-0.52, -0.34], [-0.52, 0.34], [0.52, -0.34], [0.52, 0.34]].forEach(([x, z]) => {
        const rotor = new THREE.Mesh(
          new THREE.TorusGeometry(0.16, 0.012, 8, 24),
          new THREE.MeshBasicMaterial({ color: "#16311f" })
        );
        rotor.position.set(x, 0.02, z);
        rotor.rotation.x = Math.PI / 2;
        droneGroup.add(rotor);
      });

      if (mission?.robot_ids?.includes(robot.id) || mission?.drone_ids?.includes(robot.id)) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(position.x, 0.8, position.z),
          new THREE.Vector3((position.x + target.x) / 2, 4.4, (position.z + target.z) / 2),
          new THREE.Vector3(target.x, 0.9, target.z),
        ]);
        const arc = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 40, 0.035, 8, false),
          new THREE.MeshBasicMaterial({ color: "#d98c45" })
        );
        group.add(arc);
      }

      const label = makeTheatreLabel(robot.name || `Robot ${index + 1}`, `${Math.round(robot.battery || 0)}% / ${robot.robot_type || "robot"}`);
      label.position.set(0, 1.2, 0);
      droneGroup.add(label);
      animatedRef.current.push(droneGroup);
      group.add(droneGroup);
    });
  }, [webglUnavailable, mission, plan, selectedZone, robots, drones, sensors, geofences]);

  const assignedRobots = plan?.assets.robots.length || 0;
  const theatreStatus = mission?.status || "planning";

  return (
    <section className="overflow-hidden rounded-sm border border-border bg-card" data-testid="mission-theatre-3d">
      <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative min-h-[520px] bg-[#eef2e7]">
          {webglUnavailable ? (
            <canvas ref={fallbackCanvasRef} className="absolute inset-0 h-full w-full" data-testid="mission-theatre-canvas" />
          ) : (
            <div ref={mountRef} className="absolute inset-0" />
          )}
          <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2">
            <Badge variant={isConnected ? "success" : "warning"}>{isConnected ? "live stream" : "polling"}</Badge>
            <Badge variant="outline">3D theatre</Badge>
            <Badge variant={theatreStatus === "active" ? "info" : theatreStatus === "ready" ? "success" : "outline"}>{theatreStatus}</Badge>
          </div>
        </div>
        <div className="border-t border-border bg-background p-4 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" strokeWidth={1.5} />
            <p className="text-sm font-semibold">Mission Theatre</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm border border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Target</p>
              <p className="mt-2 truncate text-sm font-semibold">{plan?.targetZone?.name || selectedZone?.name || "pending"}</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Robots</p>
              <p className="mt-2 text-2xl font-bold">{assignedRobots || robots.length || drones.length}</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Sensors</p>
              <p className="mt-2 text-2xl font-bold">{plan?.assets.sensors.length || sensors.filter((sensor) => sensor.zone_id === selectedZone?.id).length}</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Fences</p>
              <p className="mt-2 text-2xl font-bold">{plan?.assets.geofences.length || geofences.filter((fence) => fence.zone_id === selectedZone?.id).length}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-sm border border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Routes</p>
              <p className="mt-2 text-2xl font-bold">{assignedRobots}</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Coverage</p>
              <p className="mt-2 text-2xl font-bold">{plan?.coverageKm || 0}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-4" data-testid="mission-control-loading">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-32 rounded-sm border border-border bg-card p-4">
          <div className="mb-4 h-3 w-24 animate-pulse rounded-sm bg-muted" />
          <div className="h-12 animate-pulse rounded-sm bg-muted" />
        </div>
      ))}
    </div>
  );
}

function TelemetryTile({ icon: Icon, label, value, tone = "default" }) {
  const toneClass = {
    default: "text-foreground",
    good: "text-emerald-700",
    warn: "text-amber-700",
    danger: "text-red-700",
  }[tone];

  return (
    <div className="rounded-sm border border-border bg-card p-4" data-testid={`mission-tile-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="mb-3 flex items-center justify-between">
        <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">live</span>
      </div>
      <p className={cn("font-heading text-3xl font-bold tabular-nums", toneClass)}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
    </div>
  );
}

function ZoneRow({ zone, active, score, onSelect }) {
  const band = riskBand(score);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-sm border p-3 text-left transition-all duration-200 hover:border-primary hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring",
        active ? "border-primary bg-primary/10" : "border-border bg-card"
      )}
      data-testid={`mission-zone-${zone.id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{zone.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{zone.zone_type || "zone"} / {zone.priority || "medium"}</p>
        </div>
        <Badge variant={band.variant}>{score}</Badge>
      </div>
      <Progress value={score} className="mt-3 h-1.5" indicatorClassName={score >= 78 ? "bg-destructive" : score >= 58 ? "bg-amber-500" : "bg-primary"} />
    </button>
  );
}

function ReadinessCheck({ item }) {
  const Icon = item.icon;
  const tone = item.value >= 75 ? "bg-primary" : item.value >= 55 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="rounded-sm border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
          {item.label}
        </span>
        <span className="font-mono text-sm">{item.value}%</span>
      </div>
      <Progress value={item.value} className="h-1.5" indicatorClassName={tone} />
    </div>
  );
}

function AssetManifest({ plan }) {
  if (!plan) {
    return (
      <Card className="h-full" data-testid="mission-assets">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4 text-primary" strokeWidth={1.5} />Asset Manifest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            Generate a backend mission to bind robots, sensors, and geofences.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full" data-testid="mission-assets">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4 text-primary" strokeWidth={1.5} />Asset Manifest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Robotics stack</p>
          <div className="space-y-2">
            {plan.assets.robots.length ? plan.assets.robots.map((robot) => (
              <div key={robot.id} className="rounded-sm border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{robot.name}</span>
                  <Badge variant={statusClass(robot.status)}>{robot.status}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Battery className="h-3.5 w-3.5" />{Math.round(robot.battery || 0)}% battery</span>
                  <span className="font-mono">{labelize(robot.robot_type || "robot")}</span>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No robotics assets available.</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-sm border border-border p-3">
            <p className="text-2xl font-bold">{plan.assets.sensors.length}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Sensors</p>
          </div>
          <div className="rounded-sm border border-border p-3">
            <p className="text-2xl font-bold">{plan.assets.geofences.length}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Fences</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MissionTabs({ plan, mission }) {
  if (!plan) {
    return (
      <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="mission-plan-pending">
        Generate a backend mission package to review flight, risk, timeline, audit, and report data.
      </div>
    );
  }

  return (
    <Tabs defaultValue="flight" className="h-full" data-testid="mission-plan-tabs">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="flight" data-testid="mission-tab-flight"><Route className="mr-1 h-3.5 w-3.5" />Flight</TabsTrigger>
        <TabsTrigger value="risk" data-testid="mission-tab-risk"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Risk</TabsTrigger>
        <TabsTrigger value="timeline" data-testid="mission-tab-timeline"><Timer className="mr-1 h-3.5 w-3.5" />Timeline</TabsTrigger>
        <TabsTrigger value="audit" data-testid="mission-tab-audit"><ClipboardCheck className="mr-1 h-3.5 w-3.5" />Audit</TabsTrigger>
        <TabsTrigger value="report" data-testid="mission-tab-report"><FileText className="mr-1 h-3.5 w-3.5" />Report</TabsTrigger>
      </TabsList>

      <TabsContent value="flight" className="mt-4 space-y-3">
        <div className="rounded-sm border border-border p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Primary burn</p>
          <p className="mt-2 text-lg font-semibold">{formatMissionType(plan.missionType)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.coverageKm} km autonomous sweep across {plan.targetZone.name}.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {plan.adjacentZones.map((zone) => (
            <div key={zone.id} className="rounded-sm border border-border p-3">
              <p className="truncate text-sm font-medium">{zone.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">Secondary observation arc</p>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="risk" className="mt-4 space-y-3">
        {plan.directives.map((directive) => (
          <div key={directive} className="flex gap-3 rounded-sm border border-border p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
            <p className="text-sm">{directive}</p>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="timeline" className="mt-4 space-y-3">
        {plan.timeline.map((step, index) => (
          <div key={step} className="grid grid-cols-[2rem_1fr] gap-3 rounded-sm border border-border p-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-xs font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <p className="self-center text-sm">{step}</p>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="audit" className="mt-4 space-y-3">
        {mission?.audit_trail?.length ? mission.audit_trail.slice().reverse().map((event, index) => (
          <div key={`${event.action}-${event.ts}-${index}`} className="rounded-sm border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{event.action}</p>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {event.ts ? new Date(event.ts).toLocaleTimeString() : "audit"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{event.detail || "Mission lifecycle event recorded."}</p>
            <p className="mt-2 text-xs text-muted-foreground">{event.user_name || "system"}</p>
          </div>
        )) : (
          <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            Generate this mission to start the audit trail.
          </div>
        )}
      </TabsContent>

      <TabsContent value="report" className="mt-4">
        <MissionReport mission={mission} />
      </TabsContent>
    </Tabs>
  );
}

function MissionReport({ mission }) {
  const report = mission?.post_mission_report;
  if (!report || Object.keys(report).length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground" data-testid="mission-report-pending">
        Complete an active mission to generate the structured post-mission report.
      </div>
    );
  }

  const impact = report.restoration_impact || {};
  return (
    <div className="space-y-4" data-testid="mission-report-ready">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-sm border border-border p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Robots</p>
          <p className="mt-1 text-2xl font-bold">{report.robots?.length || report.drones?.length || 0}</p>
        </div>
        <div className="rounded-sm border border-border p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Sensors</p>
          <p className="mt-1 text-2xl font-bold">{report.sensors?.length || 0}</p>
        </div>
        <div className="rounded-sm border border-border p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Impact</p>
          <p className="mt-1 text-2xl font-bold">{Number(impact.biodiversity_delta_7d_estimate || 0).toFixed(3)}</p>
        </div>
        <div className="rounded-sm border border-border p-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Confidence</p>
          <p className="mt-1 text-2xl font-bold">{Math.round((impact.confidence || 0) * 100)}%</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-sm border border-border p-4">
          <p className="mb-3 text-sm font-semibold">Evidence Snapshot</p>
          <div className="space-y-2">
            {((report.robots || []).length ? report.robots : report.drones || []).slice(0, 4).map((robot) => (
              <div key={robot.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="truncate text-sm">{robot.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{Math.round(robot.battery || 0)}% / {robot.robot_type || robot.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-sm border border-border p-4">
          <p className="mb-3 text-sm font-semibold">Anomalies</p>
          <div className="space-y-2">
            {(report.anomalies || []).map((anomaly, index) => (
              <div key={`${anomaly.type}-${index}`} className="rounded-sm border border-border p-2 text-sm">
                <span className="font-medium">{anomaly.type}</span>
                <span className="ml-2 text-muted-foreground">{anomaly.message || `${anomaly.count || 0} ${anomaly.severity}`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-border p-4">
        <p className="mb-3 text-sm font-semibold">Recommendations</p>
        <div className="space-y-2">
          {(report.recommendations || []).map((recommendation) => (
            <div key={recommendation} className="flex gap-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
              <span>{recommendation}</span>
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-sm border border-border p-4">
        <summary className="cursor-pointer text-sm font-semibold" data-testid="mission-report-json-toggle">Export JSON</summary>
        <pre className="mt-3 max-h-72 overflow-auto rounded-sm bg-muted p-3 text-xs">
          {JSON.stringify(report, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function MissionArchive({ missions, activeMission, onSelect }) {
  return (
    <Card data-testid="mission-archive">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary" strokeWidth={1.5} />Mission Archive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {missions.length ? missions.slice(0, 5).map((mission) => (
          <button
            key={mission.id}
            type="button"
            onClick={() => onSelect(mission)}
            className={cn(
              "w-full rounded-sm border p-3 text-left transition-all duration-200 hover:border-primary hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring",
              activeMission?.id === mission.id ? "border-primary bg-primary/10" : "border-border bg-card"
            )}
            data-testid={`saved-mission-${mission.id}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{mission.name}</p>
              <Badge variant={mission.status === "active" ? "info" : mission.status === "completed" ? "success" : mission.status === "aborted" ? "destructive" : "outline"}>
                {mission.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{mission.zone_name} / GO {Math.round(mission.go_score || 0)}</p>
          </button>
        )) : (
          <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            No saved missions yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function mergeMission(current, incoming) {
  return [incoming, ...current.filter((mission) => mission.id !== incoming.id)]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
}

function missionProgress(mission) {
  if (!mission) return 0;
  if (mission.status === "completed") return 100;
  if (mission.status === "aborted") return 0;
  if (mission.status === "ready") return 24;
  if (mission.status === "authorized") return 42;
  if (mission.status === "active") {
    const started = mission.launched_at ? new Date(mission.launched_at).getTime() : Date.now();
    const elapsedMins = Math.max(0, (Date.now() - started) / 60000);
    const duration = Math.max(1, mission.estimated_duration_mins || 60);
    return clamp(Math.round(42 + (elapsedMins / duration) * 52), 42, 94);
  }
  return 12;
}

function ActiveMissionTelemetry({ mission, robots, drones, isConnected }) {
  if (!mission) {
    return (
      <Card data-testid="active-mission-telemetry">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-primary" strokeWidth={1.5} />Active Telemetry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            Generate and authorize a mission to bind live robotics telemetry.
          </p>
        </CardContent>
      </Card>
    );
  }

  const assignedRobots = robots.filter((robot) => mission.robot_ids?.includes(robot.id));
  const assignedDrones = drones.filter((drone) => mission.drone_ids?.includes(drone.id)).map(legacyDroneAsRobot);
  const assigned = assignedRobots.length ? assignedRobots : assignedDrones;
  const averageBattery = assigned.length
    ? Math.round(assigned.reduce((sum, robot) => sum + (robot.battery || 0), 0) / assigned.length)
    : 0;
  const progress = missionProgress(mission);
  const stalled = assigned.filter((robot) => ["offline", "maintenance"].includes(robot.status) || (robot.battery || 0) < 15);

  return (
    <Card data-testid="active-mission-telemetry">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-primary" strokeWidth={1.5} />Active Telemetry
          </span>
          <Badge variant={isConnected ? "success" : "warning"}>{isConnected ? "streaming" : "polling"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-sm border border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{mission.name}</span>
            <Badge variant={mission.status === "active" ? "info" : mission.status === "completed" ? "success" : mission.status === "aborted" ? "destructive" : "outline"}>
              {mission.status}
            </Badge>
          </div>
          <Progress value={progress} className="h-2" indicatorClassName={mission.status === "aborted" ? "bg-destructive" : "bg-primary"} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <span>{progress}% progress</span>
            <span>{assigned.length} robots</span>
            <span>{averageBattery}% avg battery</span>
          </div>
        </div>

        <div className="space-y-2">
          {assigned.length ? assigned.map((robot) => (
            <div key={robot.id} className="rounded-sm border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{robot.name}</span>
                <Badge variant={statusClass(robot.status)}>{robot.status}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Battery className="h-3.5 w-3.5" />{Math.round(robot.battery || 0)}%</span>
                <span className="font-mono">{Number(robot.latitude || 0).toFixed(2)}, {Number(robot.longitude || 0).toFixed(2)}</span>
              </div>
            </div>
          )) : (
            <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
              No assigned robots are reporting yet.
            </p>
          )}
        </div>

        {stalled.length > 0 && (
          <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {stalled.length} assigned robot{stalled.length === 1 ? "" : "s"} require operator attention.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MissionControl() {
  const { isConnected, lastMessage } = useWebSocket();
  const [zones, setZones] = useState([]);
  const [robots, setRobots] = useState([]);
  const [drones, setDrones] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [patrols, setPatrols] = useState([]);
  const [missions, setMissions] = useState([]);
  const [activeMission, setActiveMission] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [missionRequest, setMissionRequest] = useState({ missionType: "patrol", maxRobots: 5, notes: "" });
  const [loading, setLoading] = useState(true);
  const [launchState, setLaunchState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    let cancelled = false;
    const fetchMissionData = async () => {
      setLoading(true);
      const [zoneRes, robotRes, droneRes, sensorRes, fenceRes, alertRes, patrolRes, missionRes] = await Promise.allSettled([
        zoneAPI.getAll(),
        robotAPI.getAll(),
        droneAPI.getAll(),
        sensorAPI.getAll(),
        geofenceAPI.getAll(),
        alertAPI.getAll(false),
        patrolAPI.getAll(),
        missionAPI.getAll(),
      ]);
      if (cancelled) return;
      setZones(zoneRes.status === "fulfilled" ? zoneRes.value.data || [] : []);
      setRobots(robotRes.status === "fulfilled" ? robotRes.value.data || [] : []);
      setDrones(droneRes.status === "fulfilled" ? droneRes.value.data || [] : []);
      setSensors(sensorRes.status === "fulfilled" ? sensorRes.value.data || [] : []);
      setGeofences(fenceRes.status === "fulfilled" ? fenceRes.value.data || [] : []);
      setAlerts(alertRes.status === "fulfilled" ? alertRes.value.data || [] : []);
      setPatrols(patrolRes.status === "fulfilled" ? patrolRes.value.data || [] : []);
      const savedMissions = missionRes.status === "fulfilled" ? missionRes.value.data || [] : [];
      setMissions(savedMissions);
      setActiveMission(savedMissions.find((mission) => mission.status === "active") || savedMissions[0] || null);
      setLoading(false);
    };
    fetchMissionData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "mission_update" && lastMessage.mission) {
      const mission = lastMessage.mission;
      setMissions((current) => mergeMission(current, mission));
      setActiveMission((current) => {
        if (current?.id === mission.id) return mission;
        if (mission.status === "active") return mission;
        return current;
      });
      if (mission.zone_id) setTargetId((current) => current || mission.zone_id);
      setLaunchState({
        status: "stream",
        message: `Mission ${mission.id} ${lastMessage.action || "updated"} via live stream.`,
      });
    }
    if (lastMessage.type === "drone_positions" && Array.isArray(lastMessage.drones)) {
      setDrones(lastMessage.drones);
    }
  }, [lastMessage]);

  const rankedZones = useMemo(() => {
    return zones
      .map((zone) => ({ zone, score: riskScore(zone, sensors, geofences, alerts) }))
      .sort((a, b) => b.score - a.score);
  }, [zones, sensors, geofences, alerts]);

  useEffect(() => {
    if (!targetId && rankedZones.length > 0) {
      setTargetId(rankedZones[0].zone.id);
    }
  }, [rankedZones, targetId]);

  const selectedZone = zones.find((zone) => zone.id === targetId) || rankedZones[0]?.zone || null;
  const missionZone = zones.find((zone) => zone.id === activeMission?.zone_id) || selectedZone;
  const plan = useMemo(
    () => missionToPlan(activeMission, missionZone, robots, drones, sensors, geofences, alerts, patrols),
    [activeMission, missionZone, robots, drones, sensors, geofences, alerts, patrols]
  );
  const selectedRisk = selectedZone ? riskScore(selectedZone, sensors, geofences, alerts) : 0;
  const displayName = plan?.name || (selectedZone ? `${selectedZone.name} Mission` : "Mission Control");
  const displayRisk = plan?.targetRisk ?? selectedRisk;
  const displayGo = plan?.goScore ?? 0;
  const displayDuration = plan?.estimatedDuration ?? 0;

  const handleGenerate = async () => {
    const zoneId = targetId || rankedZones[0]?.zone?.id;
    if (!zoneId) {
      setLaunchState({ status: "failed", message: "Seed a zone before generating a mission." });
      return;
    }
    setLaunchState({ status: "generating", message: "Requesting backend mission plan..." });
    try {
      const response = await missionAPI.generate({
        zone_id: zoneId,
        mission_type: missionRequest.missionType,
        max_robots: missionRequest.maxRobots,
        max_drones: Math.min(4, missionRequest.maxRobots),
        notes: missionRequest.notes,
      });
      const mission = response.data;
      setActiveMission(mission);
      setTargetId(mission.zone_id);
      setMissions((current) => mergeMission(current, mission));
      setLaunchState({
        status: mission.status === "draft" ? "hold" : "saved",
        message: mission.status === "draft"
          ? "Backend returned a draft mission. Resolve readiness blockers before authorization."
          : `Mission ${mission.id} generated by backend and ready for authorization.`,
      });
    } catch (error) {
      setLaunchState({
        status: "failed",
        message: error.response?.data?.detail || "Mission generation failed.",
      });
    }
  };

  const handleLaunch = async () => {
    if (!activeMission) {
      setLaunchState({ status: "failed", message: "Generate a backend mission before authorization." });
      return;
    }
    setLaunchState({ status: "launching", message: "Authorizing autonomous mission package..." });
    try {
      const response = await missionAPI.authorize(activeMission.id);
      const updated = response.data;
      setActiveMission(updated);
      setMissions((current) => mergeMission(current, updated));
      setLaunchState({
        status: "launched",
        message: updated.launch_result?.message || `Mission ${updated.id} launched.`,
      });
    } catch (error) {
      setLaunchState({
        status: "failed",
        message: error.response?.data?.detail || "Launch authorization failed.",
      });
    }
  };

  const handleAbortMission = async () => {
    if (!activeMission) return;
    setLaunchState({ status: "aborting", message: "Aborting active mission..." });
    try {
      const response = await missionAPI.abort(activeMission.id, "Operator aborted mission from Mission Control.");
      const updated = response.data;
      setActiveMission(updated);
      setMissions((current) => mergeMission(current, updated));
      setLaunchState({ status: "aborted", message: `Mission ${updated.id} aborted.` });
    } catch (error) {
      setLaunchState({ status: "failed", message: error.response?.data?.detail || "Abort failed." });
    }
  };

  const handleCompleteMission = async () => {
    if (!activeMission) return;
    setLaunchState({ status: "completing", message: "Completing mission and generating report..." });
    try {
      const response = await missionAPI.complete(activeMission.id);
      const updated = response.data;
      setActiveMission(updated);
      setMissions((current) => mergeMission(current, updated));
      setLaunchState({ status: "completed", message: updated.post_mission_summary || `Mission ${updated.id} completed.` });
    } catch (error) {
      setLaunchState({ status: "failed", message: error.response?.data?.detail || "Completion failed." });
    }
  };

  const handleSelectMission = (mission) => {
    setActiveMission(mission);
    setTargetId(mission.zone_id);
    setLaunchState({ status: "idle", message: `Loaded saved mission ${mission.id}.` });
  };

  if (loading) {
    return (
      <div className="space-y-5" data-testid="mission-control-page">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!selectedZone && !plan) {
    return (
      <div className="rounded-sm border border-border bg-card p-8 text-center" data-testid="mission-control-empty">
        <Rocket className="mx-auto mb-3 h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
        <p className="font-heading text-xl font-semibold">No mission telemetry available</p>
        <p className="mt-2 text-sm text-muted-foreground">Seed zones and robots before opening Mission Control.</p>
      </div>
    );
  }

  const band = riskBand(displayRisk);
  const isBusy = ["launching", "generating", "aborting", "completing"].includes(launchState.status);
  const canLaunch = activeMission?.status === "ready" && !isBusy;
  const canAbort = activeMission?.status === "active" && !isBusy;
  const canComplete = activeMission?.status === "active" && !isBusy;

  return (
    <div className="space-y-5" data-testid="mission-control-page">
      <section className="relative overflow-hidden rounded-sm border border-border bg-card">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Gaia Mission Control</Badge>
              <Badge variant={band.variant}>{band.label}</Badge>
              <Badge variant="secondary">autonomous recovery</Badge>
              {activeMission && <Badge variant="outline">{activeMission.status}</Badge>}
            </div>
            <h1 className="max-w-4xl font-heading text-3xl font-bold leading-tight md:text-4xl">
              {displayName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              A launch-style command surface for planning, authorizing, and monitoring autonomous ecosystem recovery missions.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm border border-border bg-background/80 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">GO score</p>
              <p className="mt-2 font-heading text-4xl font-bold">{displayGo}</p>
            </div>
            <div className="rounded-sm border border-border bg-background/80 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">T-minus</p>
              <p className="mt-2 font-heading text-4xl font-bold">{displayDuration}</p>
              <p className="text-xs text-muted-foreground">mission min</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TelemetryTile icon={Target} label="Risk score" value={displayRisk} tone={displayRisk >= 78 ? "danger" : "warn"} />
        <TelemetryTile icon={Rocket} label="Robots ready" value={plan?.assets.robots.length || 0} tone={plan?.assets.robots.length ? "good" : "warn"} />
        <TelemetryTile icon={SatelliteDish} label="Sensor nodes" value={plan?.assets.sensors.length || 0} tone={plan?.assets.sensors.length ? "good" : "warn"} />
        <TelemetryTile icon={Radar} label="Patrol routes" value={plan?.patrolCount || patrols.length} />
      </div>

      <MissionTheatre3D
        mission={activeMission}
        plan={plan}
        selectedZone={selectedZone}
        robots={robots}
        drones={drones}
        sensors={sensors}
        geofences={geofences}
        isConnected={isConnected}
      />

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card data-testid="mission-target-selector">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Map className="h-4 w-4 text-primary" strokeWidth={1.5} />Target Stack
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rankedZones.slice(0, 6).map(({ zone, score }) => (
                <ZoneRow
                  key={zone.id}
                  zone={zone}
                  score={score}
                  active={zone.id === (plan?.targetZone?.id || selectedZone?.id)}
                  onSelect={() => {
                    setTargetId(zone.id);
                    setActiveMission(null);
                    setLaunchState({ status: "idle", message: "" });
                  }}
                />
              ))}
              <Button variant="outline" className="w-full" onClick={handleGenerate} data-testid="regenerate-mission-btn">
                <Activity className="h-4 w-4" />Generate Backend Mission
              </Button>
            </CardContent>
          </Card>
          <MissionArchive missions={missions} activeMission={activeMission} onSelect={handleSelectMission} />
        </div>

        <Card data-testid="mission-sequencer">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" strokeWidth={1.5} />Launch Sequencer
              </span>
              <span className="font-mono text-xs text-muted-foreground">{activeMission?.id || selectedZone?.id || "pending"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="rounded-sm border border-border p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Mission type</p>
                <div className="grid grid-cols-3 gap-2">
                  {["patrol", "inspect", "intervene"].map((type) => (
                    <Button
                      key={type}
                      type="button"
                      variant={missionRequest.missionType === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMissionRequest((current) => ({ ...current, missionType: type }))}
                      data-testid={`mission-type-${type}`}
                    >
                      {formatMissionType(type)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="rounded-sm border border-border p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Max robots</p>
                <div className="grid grid-cols-4 gap-2">
                  {[2, 4, 6, 8].map((count) => (
                    <Button
                      key={count}
                      type="button"
                      variant={missionRequest.maxRobots === count ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMissionRequest((current) => ({ ...current, maxRobots: count }))}
                      data-testid={`mission-max-robots-${count}`}
                    >
                      {count}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <Input
              value={missionRequest.notes}
              onChange={(event) => setMissionRequest((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Operator notes for mission planning"
              data-testid="mission-notes-input"
            />
            <div className="grid gap-3 md:grid-cols-2">
              {plan?.readiness.length ? plan.readiness.map((item) => <ReadinessCheck key={item.label} item={item} />) : (
                <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2">
                  Backend readiness checks appear after mission generation.
                </div>
              )}
            </div>
            <div className="rounded-sm border border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Launch authorization</p>
                <Badge variant={activeMission?.status === "ready" ? "success" : "warning"}>{activeMission?.status === "ready" ? "GO" : "HOLD"}</Badge>
              </div>
              <Progress value={displayGo} className="h-2" indicatorClassName={activeMission?.status === "ready" ? "bg-primary" : "bg-amber-500"} />
              <p className="mt-3 text-sm text-muted-foreground">
                {launchState.message || "Generate a backend mission, then authorize when the package is ready."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1"
                disabled={isBusy}
                onClick={handleGenerate}
                data-testid="generate-mission-btn"
              >
                <ClipboardCheck className="h-4 w-4" />
                {launchState.status === "generating" ? "Generating..." : "Generate Mission"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={!canLaunch}
                onClick={handleLaunch}
                data-testid="authorize-launch-btn"
              >
                <Rocket className="h-4 w-4" />
                {launchState.status === "launching" ? "Authorizing..." : "Authorize Launch"}
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" disabled={isBusy} onClick={handleGenerate} data-testid="rerun-readiness-btn">
                <Gauge className="h-4 w-4" />Regenerate
              </Button>
              <Button variant="outline" className="flex-1" disabled={!canComplete} onClick={handleCompleteMission} data-testid="complete-mission-btn">
                <CheckCircle2 className="h-4 w-4" />Complete
              </Button>
              <Button variant="destructive" className="flex-1" disabled={!canAbort} onClick={handleAbortMission} data-testid="abort-mission-btn">
                <AlertTriangle className="h-4 w-4" />Abort
              </Button>
            </div>
          </CardContent>
        </Card>

        <AssetManifest plan={plan} />
      </div>

      <ActiveMissionTelemetry mission={activeMission} robots={robots} drones={drones} isConnected={isConnected} />

      <Card data-testid="mission-flight-plan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" strokeWidth={1.5} />Mission Package
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MissionTabs plan={plan} mission={activeMission} />
        </CardContent>
      </Card>
    </div>
  );
}
