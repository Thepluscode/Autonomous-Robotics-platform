import React, { useState, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { droneAPI, zoneAPI, patrolAPI, sensorAPI, geofenceAPI } from "../lib/api";
import { formatPercent, getStatusColor } from "../lib/utils";
import useWebSocket from "../hooks/useWebSocket";
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Popup, useMap } from "react-leaflet";
import { AlertTriangle, Battery, Bot, Box, Crosshair, Layers, MapPin, Map as MapIcon, Plane, RadioTower, Route, SatelliteDish, Shield, ShieldCheck } from "lucide-react";
import "leaflet/dist/leaflet.css";

const HEALTH_COLORS = {
  stable: "hsl(144 33% 26%)",
  watch: "hsl(38 72% 48%)",
  intervene: "hsl(13 67% 50%)",
};

const SENSOR_COLORS = {
  active: "hsl(144 33% 26%)",
  maintenance: "hsl(38 72% 48%)",
  offline: "hsl(13 67% 50%)",
};

const GEOFENCE_COLORS = {
  protected: "hsl(144 33% 26%)",
  restricted: "hsl(13 67% 50%)",
  monitored: "hsl(38 72% 48%)",
};

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 8));
  }, [center, map]);
  return null;
}

function zoneHealth(zone) {
  const metrics = [
    zone.biodiversity_index,
    zone.soil_health,
    zone.predator_prey_balance,
    zone.vegetation_coverage,
  ].filter((value) => typeof value === "number");
  if (metrics.length === 0) return 0;
  return metrics.reduce((sum, value) => sum + value, 0) / metrics.length;
}

function healthBand(score) {
  if (score >= 0.7) return "stable";
  if (score >= 0.45) return "watch";
  return "intervene";
}

function droneIsActive(drone) {
  return ["deployed", "patrolling", "monitoring"].includes(drone.status);
}

function appendDroneTrails(current, drones) {
  const next = { ...current };
  drones.forEach((drone) => {
    if (typeof drone.latitude !== "number" || typeof drone.longitude !== "number") return;
    const point = [drone.latitude, drone.longitude];
    const existing = next[drone.id] || [];
    const last = existing[existing.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
      next[drone.id] = [...existing, point].slice(-16);
    }
  });
  return next;
}

function buildGeoProjector(zones, drones, patrols, sensors = [], geofences = []) {
  const points = [];
  zones.forEach((zone) => {
    if (typeof zone.center_lat === "number" && typeof zone.center_lng === "number") {
      points.push([zone.center_lat, zone.center_lng]);
    }
  });
  drones.forEach((drone) => {
    if (typeof drone.latitude === "number" && typeof drone.longitude === "number") {
      points.push([drone.latitude, drone.longitude]);
    }
  });
  patrols.forEach((patrol) => {
    patrol.waypoints?.forEach((point) => {
      if (typeof point.latitude === "number" && typeof point.longitude === "number") {
        points.push([point.latitude, point.longitude]);
      }
    });
  });
  sensors.forEach((sensor) => {
    if (typeof sensor.latitude === "number" && typeof sensor.longitude === "number") {
      points.push([sensor.latitude, sensor.longitude]);
    }
  });
  geofences.forEach((fence) => {
    if (typeof fence.center_lat === "number" && typeof fence.center_lng === "number") {
      points.push([fence.center_lat, fence.center_lng]);
    }
  });

  const fallback = { minLat: -1, maxLat: 1, minLng: 19, maxLng: 21 };
  const bounds = points.length > 0
    ? points.reduce((acc, [lat, lng]) => ({
      minLat: Math.min(acc.minLat, lat),
      maxLat: Math.max(acc.maxLat, lat),
      minLng: Math.min(acc.minLng, lng),
      maxLng: Math.max(acc.maxLng, lng),
    }), { minLat: points[0][0], maxLat: points[0][0], minLng: points[0][1], maxLng: points[0][1] })
    : fallback;

  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.01);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.01);
  const scale = 34 / Math.max(latSpan, lngSpan);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const midLng = (bounds.minLng + bounds.maxLng) / 2;

  return {
    project(lat = midLat, lng = midLng, altitude = 0) {
      return new THREE.Vector3((lng - midLng) * scale, 0.8 + altitude / 80, -(lat - midLat) * scale);
    },
    radius(km = 1) {
      return Math.max(0.8, km * scale * 0.009);
    },
  };
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material.dispose();
    }
  });
}

function makeLabel(text, color = "#153020") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = 320;
  canvas.height = 96;
  context.fillStyle = "rgba(255, 255, 255, 0.88)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(117, 122, 88, 0.75)";
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  context.fillStyle = color;
  context.font = "600 28px 'DM Sans', sans-serif";
  context.fillText(text.slice(0, 18), 18, 42);
  context.fillStyle = "rgba(79, 91, 72, 0.88)";
  context.font = "500 16px 'JetBrains Mono', monospace";
  context.fillText("live telemetry", 18, 68);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.8, 1.15, 1);
  return sprite;
}

function ThreeOperationsView({ drones, zones, patrols, sensors, geofences, trails, showDrones, showZones, showPatrols, showSensors, showGeofences, selected, onSelect }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const groupRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef2e7");
    scene.fog = new THREE.Fog("#eef2e7", 34, 76);

    const camera = new THREE.PerspectiveCamera(46, mount.clientWidth / mount.clientHeight, 0.1, 180);
    camera.position.set(22, 24, 28);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.dataset.testid = "operations-3d-canvas";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 14;
    controls.maxDistance = 62;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.HemisphereLight("#f8fff1", "#8b7a54", 2.2);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight("#fff7dc", 2.4);
    sun.position.set(18, 32, 16);
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
      controls.update();
      group.rotation.y += 0.0007;
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
      disposeObject(group);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    while (group.children.length) {
      const child = group.children.pop();
      disposeObject(child);
    }

    const projector = buildGeoProjector(zones, drones, patrols, sensors, geofences);
    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42, 28, 28),
      new THREE.MeshStandardMaterial({ color: "#d9dfc8", roughness: 0.95, metalness: 0.02 })
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    group.add(terrain);

    const grid = new THREE.GridHelper(42, 28, "#748465", "#bdc5ab");
    grid.position.y = 0.03;
    group.add(grid);

    if (showZones) {
      zones.forEach((zone) => {
        const score = zoneHealth(zone);
        const band = healthBand(score);
        const color = HEALTH_COLORS[band];
        const position = projector.project(zone.center_lat, zone.center_lng, 0);
        const radius = projector.radius(zone.radius_km);
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 0.26, 64, 1, true),
          new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: selected?.item?.id === zone.id ? 0.42 : 0.24,
            roughness: 0.65,
            metalness: 0.04,
            side: THREE.DoubleSide,
          })
        );
        ring.position.copy(position);
        ring.position.y = 0.18;
        ring.userData = { type: "zone", item: zone };
        group.add(ring);

        const canopy = new THREE.Mesh(
          new THREE.ConeGeometry(radius * 0.86, 1.4 + score * 1.6, 6),
          new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02 })
        );
        canopy.position.copy(position);
        canopy.position.y = 0.95 + score;
        canopy.castShadow = true;
        canopy.userData = { type: "zone", item: zone };
        group.add(canopy);

        const label = makeLabel(`${Math.round(score * 100)}% ${zone.name}`, color);
        label.position.copy(position);
        label.position.y = 3.2 + score;
        label.userData = { type: "zone", item: zone };
        group.add(label);
      });
    }

    if (showGeofences) {
      geofences.forEach((fence) => {
        const color = GEOFENCE_COLORS[fence.fence_type] || GEOFENCE_COLORS.monitored;
        const position = projector.project(fence.center_lat, fence.center_lng, 0);
        const radius = projector.radius(fence.radius_km);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.045, 10, 96),
          new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: selected?.item?.id === fence.id ? 0.95 : 0.68,
            roughness: 0.42,
            metalness: 0.12,
          })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(position);
        ring.position.y = 0.44;
        ring.userData = { type: "geofence", item: fence };
        group.add(ring);

        const vertical = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 1.8, 64, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fence.fence_type === "restricted" ? 0.08 : 0.045, side: THREE.DoubleSide })
        );
        vertical.position.copy(position);
        vertical.position.y = 1.2;
        vertical.userData = { type: "geofence", item: fence };
        group.add(vertical);
      });
    }

    if (showPatrols) {
      patrols.filter((patrol) => patrol.waypoints?.length > 1).forEach((patrol) => {
        const points = patrol.waypoints.map((point) => projector.project(point.latitude, point.longitude, 35));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineDashedMaterial({
          color: patrol.status === "active" ? "#cf6c4d" : "#2d5a3e",
          dashSize: 0.55,
          gapSize: 0.32,
          linewidth: 2,
        });
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        line.userData = { type: "patrol", item: patrol };
        group.add(line);
      });
    }

    if (showDrones) {
      drones.forEach((drone) => {
        const active = droneIsActive(drone);
        const lowBattery = (drone.battery || 0) < 25;
        const color = lowBattery ? "#cf6c4d" : active ? "#2d5a3e" : "#687464";
        const position = projector.project(drone.latitude, drone.longitude, drone.altitude || 80);
        const droneGroup = new THREE.Group();
        droneGroup.position.copy(position);
        droneGroup.userData = { type: "drone", item: drone };

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.22, 0.36),
          new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.34 })
        );
        body.castShadow = true;
        body.userData = { type: "drone", item: drone };
        droneGroup.add(body);

        const armMaterial = new THREE.MeshStandardMaterial({ color: "#19251b", roughness: 0.5, metalness: 0.25 });
        [[0.62, 0.42], [0.62, -0.42], [-0.62, 0.42], [-0.62, -0.42]].forEach(([x, z]) => {
          const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 24), armMaterial);
          rotor.position.set(x, 0.02, z);
          rotor.userData = { type: "drone", item: drone };
          droneGroup.add(rotor);
        });

        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 16, 16),
          new THREE.MeshBasicMaterial({ color })
        );
        beacon.position.set(0, 0.32, 0);
        beacon.userData = { type: "drone", item: drone };
        droneGroup.add(beacon);
        group.add(droneGroup);

        const positions = trails[drone.id] || [];
        if (positions.length > 1) {
          const trailPoints = positions.map(([lat, lng], index) => projector.project(lat, lng, 35 + index * 2));
          const trail = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(trailPoints),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })
          );
          group.add(trail);
        }
      });
    }

    if (showSensors) {
      sensors.forEach((sensor) => {
        const color = SENSOR_COLORS[sensor.status] || SENSOR_COLORS.active;
        const position = projector.project(sensor.latitude, sensor.longitude, 18);
        const sensorGroup = new THREE.Group();
        sensorGroup.position.copy(position);
        sensorGroup.userData = { type: "sensor", item: sensor };

        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.055, 1.6, 10),
          new THREE.MeshStandardMaterial({ color: "#243023", roughness: 0.62, metalness: 0.2 })
        );
        mast.position.y = -0.55;
        mast.userData = { type: "sensor", item: sensor };
        sensorGroup.add(mast);

        const node = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32, 0),
          new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.26 })
        );
        node.castShadow = true;
        node.userData = { type: "sensor", item: sensor };
        sensorGroup.add(node);

        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 24, 16),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: sensor.status === "active" ? 0.14 : 0.24, wireframe: true })
        );
        pulse.userData = { type: "sensor", item: sensor };
        sensorGroup.add(pulse);
        group.add(sensorGroup);
      });
    }
  }, [drones, zones, patrols, sensors, geofences, trails, showDrones, showZones, showPatrols, showSensors, showGeofences, selected]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const group = groupRef.current;
    if (!renderer || !camera || !group) return undefined;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const handleClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(group.children, true).find((entry) => entry.object.userData?.item);
      if (hit) onSelect({ type: hit.object.userData.type, item: hit.object.userData.item });
    };

    renderer.domElement.addEventListener("click", handleClick);
    return () => renderer.domElement.removeEventListener("click", handleClick);
  }, [onSelect]);

  return (
    <div className="relative h-full overflow-hidden bg-secondary" data-testid="operations-3d-view">
      <div ref={mountRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-sm border border-border bg-card/90 p-3 text-xs shadow-sm backdrop-blur">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Box className="h-3.5 w-3.5 text-primary" />3D Operations Layer
        </div>
        <p className="max-w-[16rem] text-muted-foreground">Drag to orbit, scroll to zoom, select drones, zones, or patrol paths.</p>
      </div>
    </div>
  );
}

function Inspector({ selected, zones, drones, patrols, sensors, geofences }) {
  if (!selected) {
    const interventionZones = zones.filter((zone) => healthBand(zoneHealth(zone)) === "intervene");
    const activeDrones = drones.filter(droneIsActive);
    const activeSensors = sensors.filter((sensor) => sensor.status === "active");
    const restrictedFences = geofences.filter((fence) => fence.fence_type === "restricted");
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" />Operations Inspector
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-sm border border-border p-3">
              <p className="text-2xl font-heading font-bold">{zones.length}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Zones</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="text-2xl font-heading font-bold">{activeDrones.length}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Drones</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="text-2xl font-heading font-bold">{patrols.length}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Patrols</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="text-2xl font-heading font-bold text-accent">{interventionZones.length}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Interventions</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="text-2xl font-heading font-bold">{activeSensors.length}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Live Sensors</p>
            </div>
            <div className="rounded-sm border border-border p-3">
              <p className="text-2xl font-heading font-bold text-accent">{restrictedFences.length}</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Restricted</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Priority Watchlist</p>
              <Badge variant="outline" className="text-[10px]">health score</Badge>
            </div>
            {zones
              .slice()
              .sort((a, b) => zoneHealth(a) - zoneHealth(b))
              .slice(0, 5)
              .map((zone) => {
                const score = zoneHealth(zone);
                const band = healthBand(score);
                return (
                  <div key={zone.id} className="space-y-1.5 rounded-sm border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{zone.name}</span>
                      <Badge variant={band === "stable" ? "success" : band === "watch" ? "warning" : "destructive"} className="text-[10px]">
                        {Math.round(score * 100)}%
                      </Badge>
                    </div>
                    <Progress value={score * 100} className="h-1.5" indicatorClassName={band === "stable" ? "bg-primary" : band === "watch" ? "bg-amber-500" : "bg-accent"} />
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selected.type === "zone") {
    const zone = selected.item;
    const score = zoneHealth(zone);
    const band = healthBand(score);
    const assignedDrones = drones.filter((drone) => drone.zone_id === zone.id);
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" style={{ color: HEALTH_COLORS[band] }} />{zone.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={band === "stable" ? "success" : band === "watch" ? "warning" : "destructive"}>{band}</Badge>
            <span className="text-3xl font-heading font-bold tabular-nums">{Math.round(score * 100)}%</span>
          </div>
          <Progress value={score * 100} className="h-2" indicatorClassName={band === "stable" ? "bg-primary" : band === "watch" ? "bg-amber-500" : "bg-accent"} />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Biodiversity" value={formatPercent(zone.biodiversity_index)} />
            <Metric label="Soil" value={formatPercent(zone.soil_health)} />
            <Metric label="Predator/Prey" value={formatPercent(zone.predator_prey_balance)} />
            <Metric label="Vegetation" value={formatPercent(zone.vegetation_coverage)} />
          </div>
          <div className="rounded-sm border border-border p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Assigned Drones</p>
            {assignedDrones.length > 0 ? assignedDrones.map((drone) => (
              <div key={drone.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                <span className="text-sm font-medium">{drone.name}</span>
                <Badge className={getStatusColor(drone.status)} variant="outline">{drone.status}</Badge>
              </div>
            )) : <p className="text-sm text-muted-foreground">No drones assigned</p>}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selected.type === "drone") {
    const drone = selected.item;
    const assignedZone = zones.find((zone) => zone.id === drone.zone_id);
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plane className="w-4 h-4 text-primary" />{drone.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge className={getStatusColor(drone.status)} variant="outline">{drone.status}</Badge>
            <span className="text-sm text-muted-foreground">{assignedZone?.name || "Unassigned"}</span>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><Battery className="w-4 h-4" />Battery</span>
              <span className="font-mono">{Math.round(drone.battery || 0)}%</span>
            </div>
            <Progress value={drone.battery || 0} className="h-2" indicatorClassName={(drone.battery || 0) < 25 ? "bg-accent" : "bg-primary"} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Latitude" value={drone.latitude?.toFixed(4) || "—"} />
            <Metric label="Longitude" value={drone.longitude?.toFixed(4) || "—"} />
            <Metric label="Altitude" value={`${Math.round(drone.altitude || 0)}m`} />
            <Metric label="Mission" value={drone.mission_type || "—"} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selected.type === "sensor") {
    const sensor = selected.item;
    const assignedZone = zones.find((zone) => zone.id === sensor.zone_id);
    const statusTone = sensor.status === "active" ? "success" : sensor.status === "maintenance" ? "warning" : "destructive";
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <SatelliteDish className="w-4 h-4 text-primary" />{sensor.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={statusTone}>{sensor.status}</Badge>
            <span className="text-sm text-muted-foreground">{assignedZone?.name || "Unassigned"}</span>
          </div>
          <div className="rounded-sm border border-border p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Reading</p>
            <p className="mt-1 font-heading text-3xl font-bold tabular-nums">
              {Number(sensor.current_value || 0).toFixed(1)}
              <span className="ml-1 text-sm font-medium text-muted-foreground">{sensor.unit}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Type" value={sensor.sensor_type || "—"} />
            <Metric label="Latitude" value={sensor.latitude?.toFixed(4) || "—"} />
            <Metric label="Longitude" value={sensor.longitude?.toFixed(4) || "—"} />
            <Metric label="Last Reading" value={sensor.last_reading ? new Date(sensor.last_reading).toLocaleTimeString() : "—"} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selected.type === "geofence") {
    const fence = selected.item;
    const assignedZone = zones.find((zone) => zone.id === fence.zone_id);
    const variant = fence.fence_type === "restricted" ? "destructive" : fence.fence_type === "protected" ? "success" : "warning";
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />{fence.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Badge variant={variant}>{fence.fence_type}</Badge>
            <span className="text-sm text-muted-foreground">{assignedZone?.name || "Unassigned"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Radius" value={`${fence.radius_km || 0} km`} />
            <Metric label="Alerts" value={fence.alerts_enabled ? "enabled" : "off"} />
            <Metric label="Latitude" value={fence.center_lat?.toFixed(4) || "—"} />
            <Metric label="Longitude" value={fence.center_lng?.toFixed(4) || "—"} />
          </div>
          <div className="rounded-sm border border-border p-3 text-sm text-muted-foreground">
            This boundary is visible in both 2D and 3D views for quick drone proximity checks.
          </div>
        </CardContent>
      </Card>
    );
  }

  const patrol = selected.item;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Route className="w-4 h-4 text-primary" />{patrol.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Badge className={getStatusColor(patrol.status)} variant="outline">{patrol.status}</Badge>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Waypoints" value={patrol.waypoints?.length || 0} />
          <Metric label="Priority" value={patrol.optimization_priority || "—"} />
          <Metric label="Schedule" value={patrol.schedule_type || "—"} />
          <Metric label="Drones" value={patrol.drone_ids?.length || 0} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-sm border border-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm">{value}</p>
    </div>
  );
}

export default function EcosystemMap() {
  const [drones, setDrones] = useState([]);
  const [zones, setZones] = useState([]);
  const [patrols, setPatrols] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState("3d");
  const [selected, setSelected] = useState(null);
  const [trails, setTrails] = useState({});
  const { lastMessage, isConnected } = useWebSocket();

  useEffect(() => {
    const fetch = async () => {
      try {
        const [d, z, p, s, g] = await Promise.all([
          droneAPI.getAll(),
          zoneAPI.getAll(),
          patrolAPI.getAll(),
          sensorAPI.getAll(),
          geofenceAPI.getAll(),
        ]);
        setDrones(d.data || []);
        setZones(z.data || []);
        setPatrols(p.data || []);
        setSensors(s.data || []);
        setGeofences(g.data || []);
      } catch {}
    };
    fetch();
    const interval = setInterval(() => {
      droneAPI.getAll().then(res => setDrones(res.data || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (lastMessage?.type === "drone_positions" && Array.isArray(lastMessage.drones)) {
      setDrones(lastMessage.drones);
    } else if (lastMessage?.type === "drone_update") {
      setDrones(prev => prev.map(d => d.id === lastMessage.data?.id ? { ...d, ...lastMessage.data } : d));
    }
  }, [lastMessage]);

  useEffect(() => {
    setTrails((current) => appendDroneTrails(current, drones));
  }, [drones]);

  const showDrones = filter === "all" || filter === "drones";
  const showZones = filter === "all" || filter === "zones";
  const showPatrols = filter === "all" || filter === "patrols";
  const showSensors = filter === "all" || filter === "sensors";
  const showGeofences = filter === "all" || filter === "geofences";

  const activeDrones = drones.filter(droneIsActive);
  const interventionZones = zones.filter((zone) => healthBand(zoneHealth(zone)) === "intervene");
  const offlineSensors = sensors.filter((sensor) => sensor.status !== "active");
  const restrictedGeofences = geofences.filter((fence) => fence.fence_type === "restricted");
  const defaultCenter = zones.length > 0 ? [zones[0].center_lat, zones[0].center_lng] : [0, 20];
  const selectedCenter = useMemo(() => {
    if (selected?.type === "zone") return [selected.item.center_lat, selected.item.center_lng];
    if (selected?.type === "drone") return [selected.item.latitude || 0, selected.item.longitude || 0];
    if (selected?.type === "sensor") return [selected.item.latitude || 0, selected.item.longitude || 0];
    if (selected?.type === "geofence") return [selected.item.center_lat || 0, selected.item.center_lng || 0];
    const firstWaypoint = selected?.item?.waypoints?.[0];
    return firstWaypoint ? [firstWaypoint.latitude, firstWaypoint.longitude] : null;
  }, [selected]);

  return (
    <div className="space-y-4" data-testid="ecosystem-map-page">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="3d" data-testid="map-view-3d"><Box className="w-3.5 h-3.5 mr-1" />3D</TabsTrigger>
              <TabsTrigger value="2d" data-testid="map-view-2d"><MapIcon className="w-3.5 h-3.5 mr-1" />2D</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="grid grid-cols-3 md:grid-cols-6">
              <TabsTrigger value="all" data-testid="map-filter-all"><Layers className="w-3.5 h-3.5 mr-1" />All</TabsTrigger>
              <TabsTrigger value="drones" data-testid="map-filter-drones"><Plane className="w-3.5 h-3.5 mr-1" />Drones</TabsTrigger>
              <TabsTrigger value="zones" data-testid="map-filter-zones"><MapPin className="w-3.5 h-3.5 mr-1" />Zones</TabsTrigger>
              <TabsTrigger value="patrols" data-testid="map-filter-patrols"><Route className="w-3.5 h-3.5 mr-1" />Patrols</TabsTrigger>
              <TabsTrigger value="sensors" data-testid="map-filter-sensors"><SatelliteDish className="w-3.5 h-3.5 mr-1" />Sensors</TabsTrigger>
              <TabsTrigger value="geofences" data-testid="map-filter-geofences"><Shield className="w-3.5 h-3.5 mr-1" />Fences</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs md:flex md:items-center md:gap-3">
          <StatusChip icon={RadioTower} label={isConnected ? "WebSocket live" : "Polling fallback"} tone={isConnected ? "stable" : "watch"} />
          <StatusChip icon={Bot} label={`${activeDrones.length}/${drones.length} active`} tone="stable" />
          <StatusChip icon={AlertTriangle} label={`${interventionZones.length} intervention zones`} tone={interventionZones.length ? "intervene" : "stable"} />
          <StatusChip icon={SatelliteDish} label={`${offlineSensors.length} sensor alerts`} tone={offlineSensors.length ? "watch" : "stable"} />
          <StatusChip icon={Shield} label={`${restrictedGeofences.length} restricted fences`} tone={restrictedGeofences.length ? "intervene" : "neutral"} />
        </div>
      </div>

      <div className="grid h-[calc(100vh-12rem)] min-h-[640px] grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="h-full overflow-hidden">
          <CardContent className="relative h-full p-0">
            {viewMode === "3d" ? (
              <ThreeOperationsView
                drones={drones}
                zones={zones}
                patrols={patrols}
                sensors={sensors}
                geofences={geofences}
                trails={trails}
                showDrones={showDrones}
                showZones={showZones}
                showPatrols={showPatrols}
                showSensors={showSensors}
                showGeofences={showGeofences}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <MapContainer center={defaultCenter} zoom={3} style={{ height: "100%", width: "100%" }} className="rounded-sm">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                <MapUpdater center={selectedCenter} />

                {showZones && zones.map(zone => {
                  const score = zoneHealth(zone);
                  const band = healthBand(score);
                  const color = HEALTH_COLORS[band];
                  return (
                    <Circle
                      key={zone.id}
                      center={[zone.center_lat, zone.center_lng]}
                      radius={(zone.radius_km || 1) * 1000}
                      pathOptions={{ color, fillColor: color, fillOpacity: band === "intervene" ? 0.22 : 0.14, weight: selected?.item?.id === zone.id ? 4 : 2 }}
                      eventHandlers={{ click: () => setSelected({ type: "zone", item: zone }) }}
                    >
                      <Popup>
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">{zone.name}</p>
                          <p>Health: {Math.round(score * 100)}% · {band}</p>
                          <p>Biodiversity: {formatPercent(zone.biodiversity_index)}</p>
                        </div>
                      </Popup>
                    </Circle>
                  );
                })}

                {showGeofences && geofences.map(fence => {
                  const color = GEOFENCE_COLORS[fence.fence_type] || GEOFENCE_COLORS.monitored;
                  return (
                    <Circle
                      key={fence.id}
                      center={[fence.center_lat, fence.center_lng]}
                      radius={(fence.radius_km || 1) * 1000}
                      pathOptions={{
                        color,
                        fillColor: color,
                        fillOpacity: fence.fence_type === "restricted" ? 0.12 : 0.06,
                        weight: selected?.item?.id === fence.id ? 4 : 2,
                        dashArray: fence.fence_type === "protected" ? "0" : "7 5",
                      }}
                      eventHandlers={{ click: () => setSelected({ type: "geofence", item: fence }) }}
                    >
                      <Popup>
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">{fence.name}</p>
                          <p>Type: {fence.fence_type}</p>
                          <p>Radius: {fence.radius_km} km</p>
                        </div>
                      </Popup>
                    </Circle>
                  );
                })}

                {showDrones && drones.map(drone => {
                  const active = droneIsActive(drone);
                  const lowBattery = (drone.battery || 0) < 25;
                  const color = lowBattery ? "hsl(13 67% 50%)" : active ? "hsl(144 33% 26%)" : "hsl(133 10% 43%)";
                  const positions = trails[drone.id] || [];
                  return (
                    <React.Fragment key={drone.id}>
                      {positions.length > 1 && (
                        <Polyline positions={positions} pathOptions={{ color, weight: 2, opacity: 0.42 }} />
                      )}
                      <CircleMarker
                        center={[drone.latitude || 0, drone.longitude || 0]}
                        radius={active ? 7 : 5}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: selected?.item?.id === drone.id ? 4 : 2 }}
                        eventHandlers={{ click: () => setSelected({ type: "drone", item: drone }) }}
                      >
                        <Popup>
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold">{drone.name}</p>
                            <p>Status: {drone.status}</p>
                            <p>Battery: {Math.round(drone.battery || 0)}%</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    </React.Fragment>
                  );
                })}

                {showPatrols && patrols.filter(p => p.waypoints?.length > 1).map(patrol => (
                  <Polyline
                    key={patrol.id}
                    positions={patrol.waypoints.map(wp => [wp.latitude, wp.longitude])}
                    pathOptions={{ color: patrol.status === "active" ? "hsl(13 67% 50%)" : "hsl(144 33% 26%)", weight: 3, dashArray: "8 5", opacity: 0.74 }}
                    eventHandlers={{ click: () => setSelected({ type: "patrol", item: patrol }) }}
                  >
                    <Popup><p className="text-xs font-semibold">{patrol.name}</p></Popup>
                  </Polyline>
                ))}

                {showSensors && sensors.map(sensor => {
                  const color = SENSOR_COLORS[sensor.status] || SENSOR_COLORS.active;
                  return (
                    <CircleMarker
                      key={sensor.id}
                      center={[sensor.latitude || 0, sensor.longitude || 0]}
                      radius={sensor.status === "active" ? 5 : 7}
                      pathOptions={{
                        color,
                        fillColor: color,
                        fillOpacity: 0.92,
                        weight: selected?.item?.id === sensor.id ? 4 : 2,
                      }}
                      eventHandlers={{ click: () => setSelected({ type: "sensor", item: sensor }) }}
                    >
                      <Popup>
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold">{sensor.name}</p>
                          <p>{sensor.sensor_type}: {sensor.current_value} {sensor.unit}</p>
                          <p>Status: {sensor.status}</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            )}

            <div className="pointer-events-none absolute bottom-4 left-4 rounded-sm border border-border bg-card/95 p-3 text-xs shadow-sm backdrop-blur">
              <div className="mb-2 flex items-center gap-2 font-medium"><ShieldCheck className="w-3.5 h-3.5 text-primary" />Health Overlay</div>
              <div className="grid gap-1.5">
                <LegendDot color={HEALTH_COLORS.stable} label="Stable" />
                <LegendDot color={HEALTH_COLORS.watch} label="Watch" />
                <LegendDot color={HEALTH_COLORS.intervene} label="Intervention" />
                <LegendDot color={SENSOR_COLORS.active} label="Sensor node" />
                <LegendDot color={GEOFENCE_COLORS.restricted} label="Restricted fence" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Inspector selected={selected} zones={zones} drones={drones} patrols={patrols} sensors={sensors} geofences={geofences} />
      </div>
    </div>
  );
}

function StatusChip({ icon: Icon, label, tone }) {
  const toneClass = {
    stable: "border-emerald-200 bg-emerald-500/15 text-emerald-700",
    watch: "border-amber-200 bg-amber-500/15 text-amber-700",
    intervene: "border-red-200 bg-red-500/15 text-red-700",
    neutral: "border-border bg-card text-muted-foreground",
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 ${toneClass}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
