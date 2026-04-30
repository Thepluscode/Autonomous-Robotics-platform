import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { droneAPI, zoneAPI } from "../lib/api";
import { cn } from "../lib/utils";
import {
  Activity,
  AlertTriangle,
  Battery,
  Bot,
  Cpu,
  Gauge,
  MapPin,
  Plane,
  RadioTower,
  Rocket,
  Route,
  Satellite,
  ShieldCheck,
  Waves,
  Wrench,
} from "lucide-react";

const roboticsDomains = [
  {
    id: "aerial",
    label: "Aerial Robots",
    asset: "Seed drones / overwatch VTOL",
    mission: "Canopy mapping, swarm patrol, seed-pod placement, and high-speed visual confirmation.",
    icon: Plane,
    tone: "emerald",
    autonomy: 86,
    active: "live",
  },
  {
    id: "ground",
    label: "Ground Robots",
    asset: "Soil rovers / ranger mules",
    mission: "Soil sampling, trail inspection, payload delivery, and low-canopy ranger support.",
    icon: Bot,
    tone: "amber",
    autonomy: 74,
    active: "sim",
  },
  {
    id: "aquatic",
    label: "Aquatic Robots",
    asset: "Reef subs / kelp seeders",
    mission: "Coral repair, kelp seeding, ghost-net removal, and underwater acoustic relay.",
    icon: Waves,
    tone: "cyan",
    autonomy: 81,
    active: "sim",
  },
  {
    id: "fixed",
    label: "Fixed Sensor Robots",
    asset: "Camera traps / acoustic buoys",
    mission: "Camera traps, bioacoustics, soil probes, weather telemetry, and edge inference.",
    icon: RadioTower,
    tone: "rose",
    autonomy: 68,
    active: "sim",
  },
  {
    id: "orbital",
    label: "Orbital Inputs",
    asset: "Verdant satellites / hyperspectral",
    mission: "Tasking cues, before-after evidence, thermal anomaly scans, and wide-area detection.",
    icon: Satellite,
    tone: "sky",
    autonomy: 92,
    active: "sim",
  },
];

const simulatedAssets = {
  ground: [
    { id: "R-11", name: "Soil Rover 11", status: "sampling", battery: 82, zone: "Amazon Canopy North", health: 91 },
    { id: "R-18", name: "Ranger Mule 18", status: "standby", battery: 76, zone: "Borneo Corridor", health: 88 },
    { id: "R-23", name: "Trail Scout 23", status: "mapping", battery: 69, zone: "Congo Canopy", health: 84 },
  ],
  aquatic: [
    { id: "P-01", name: "Coral Medic", status: "restoring", battery: 91, zone: "Great Barrier Reef Edge", health: 90 },
    { id: "P-04", name: "Kelp Sower", status: "seeding", battery: 86, zone: "Kelp Recovery Grid 04", health: 87 },
    { id: "P-07", name: "Net Cutter", status: "intercept", battery: 74, zone: "Reef Debris Corridor", health: 79 },
  ],
  fixed: [
    { id: "S-44", name: "Acoustic Buoy 44", status: "listening", battery: 96, zone: "Amazon Canopy North", health: 93 },
    { id: "C-12", name: "Soil Probe C-12", status: "calibrating", battery: 88, zone: "Sahel Edge", health: 81 },
    { id: "T-09", name: "Camera Trap 09", status: "detecting", battery: 72, zone: "Borneo Corridor", health: 86 },
  ],
  orbital: [
    { id: "V-01", name: "Verdant Polar", status: "sweeping", battery: 98, zone: "Global", health: 98 },
    { id: "V-04", name: "Verdant SWIR", status: "tasking", battery: 94, zone: "Amazon Canopy North", health: 94 },
    { id: "V-09", name: "Verdant Thermal", status: "queued", battery: 91, zone: "Reef Track", health: 91 },
  ],
};

const autonomyPipeline = [
  { label: "Sense", detail: "robot telemetry, fixed sensors, and orbital inputs", icon: Activity },
  { label: "Plan", detail: "mission planner selects domain and safety envelope", icon: Cpu },
  { label: "Task", detail: "operator approves or schedules autonomous execution", icon: Route },
  { label: "Verify", detail: "evidence graph links outcomes to proof records", icon: ShieldCheck },
];

function toneClasses(tone) {
  if (tone === "amber") return "text-amber-600 bg-amber-500/10 border-amber-500/25";
  if (tone === "cyan") return "text-cyan-600 bg-cyan-500/10 border-cyan-500/25";
  if (tone === "rose") return "text-rose-600 bg-rose-500/10 border-rose-500/25";
  if (tone === "sky") return "text-sky-600 bg-sky-500/10 border-sky-500/25";
  return "text-emerald-700 bg-emerald-500/10 border-emerald-500/25";
}

function buildAerialAssets(drones, zones) {
  if (!drones.length) {
    return [
      { id: "D-01", name: "Sentinel Aerial 01", status: "standby", battery: 84, zone: "Unassigned", health: 86 },
      { id: "D-07", name: "Seed Drone 07", status: "patrolling", battery: 71, zone: "Amazon Canopy North", health: 78 },
      { id: "D-12", name: "Overwatch VTOL 12", status: "charging", battery: 46, zone: "Base", health: 72 },
    ];
  }

  return drones.slice(0, 8).map((drone) => ({
    id: drone.id,
    name: drone.name || "Aerial Robot",
    status: drone.status || "unknown",
    battery: drone.battery ?? 0,
    zone: zones.find((zone) => zone.id === drone.zone_id)?.name || drone.zone_id || "Unassigned",
    health: Math.round(((drone.battery ?? 0) * 0.7) + (["deployed", "patrolling"].includes(drone.status) ? 24 : 12)),
  }));
}

export default function RoboticsCommandCenter() {
  const [drones, setDrones] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDomain, setActiveDomain] = useState("aerial");

  useEffect(() => {
    let cancelled = false;
    Promise.all([droneAPI.getAll(), zoneAPI.getAll()])
      .then(([droneRes, zoneRes]) => {
        if (cancelled) return;
        setDrones(droneRes.data || []);
        setZones(zoneRes.data || []);
      })
      .catch(() => {
        if (!cancelled) {
          setDrones([]);
          setZones([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const aerialAssets = useMemo(() => buildAerialAssets(drones, zones), [drones, zones]);
  const assetsByDomain = useMemo(() => ({
    aerial: aerialAssets,
    ...simulatedAssets,
  }), [aerialAssets]);

  const domain = roboticsDomains.find((item) => item.id === activeDomain) || roboticsDomains[0];
  const assets = assetsByDomain[domain.id] || [];
  const totalAssets = Object.values(assetsByDomain).reduce((sum, list) => sum + list.length, 0);
  const activeAssets = Object.values(assetsByDomain).flat().filter((asset) => !["charging", "standby", "queued"].includes(asset.status)).length;
  const avgBattery = assets.length ? Math.round(assets.reduce((sum, asset) => sum + asset.battery, 0) / assets.length) : 0;
  const avgHealth = assets.length ? Math.round(assets.reduce((sum, asset) => sum + asset.health, 0) / assets.length) : 0;
  const DomainIcon = domain.icon;

  return (
    <div className="space-y-5" data-testid="robotics-command-center-page">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <CardContent className="relative p-5 md:p-6">
            <div className="absolute inset-0 opacity-[0.05]" style={{
              backgroundImage: "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
              backgroundSize: "34px 34px",
            }} />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-3xl">
                <Badge className="mb-4" variant="outline">Autonomous Robotics Platform</Badge>
                <h2 className="font-heading text-3xl font-bold leading-tight text-foreground md:text-4xl">
                  Multi-domain fleet command for air, land, water, sensors, and orbit.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Drones are one fleet subset. The operating model is robotics orchestration: sense, plan, task, verify, and maintain every autonomous asset from one command surface.
                </p>
              </div>
              <div className="flex gap-2">
                <Link to="/mission-control" data-testid="robotics-go-mission-control">
                  <Button>
                    <Rocket className="h-4 w-4" /> Task Mission
                  </Button>
                </Link>
                <Link to="/drones" data-testid="robotics-go-aerial-fleet">
                  <Button variant="outline">
                    <Plane className="h-4 w-4" /> Aerial Fleet
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "total assets", value: totalAssets, icon: Bot },
            { label: "active assets", value: activeAssets, icon: Activity },
            { label: "domains", value: roboticsDomains.length, icon: Gauge },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <Icon className="mb-4 h-4 w-4 text-primary" strokeWidth={1.5} />
                <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5" data-testid="robotics-domain-tabs">
        {roboticsDomains.map((item) => {
          const Icon = item.icon;
          const count = (assetsByDomain[item.id] || []).length;
          const active = activeDomain === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveDomain(item.id)}
              className={cn(
                "rounded-sm border bg-card p-4 text-left transition-all duration-200 hover:border-primary/50",
                active ? "border-primary ring-2 ring-primary/10" : "border-border"
              )}
              data-testid={`robotics-tab-${item.id}`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-sm border", toneClasses(item.tone))}>
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </span>
                <Badge variant={item.active === "live" ? "success" : "outline"}>{item.active}</Badge>
              </div>
              <p className="font-heading text-base font-semibold text-foreground">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{count} assets</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card data-testid="robotics-active-domain">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DomainIcon className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  {domain.label}
                </CardTitle>
                <CardDescription>{domain.asset}</CardDescription>
              </div>
              <Badge className={toneClasses(domain.tone)}>{domain.autonomy}% autonomy</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">{domain.mission}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: "readiness", value: avgHealth, icon: ShieldCheck },
                { label: "battery", value: avgBattery, icon: Battery },
                { label: "maintenance", value: Math.max(0, 100 - Math.round((avgHealth + avgBattery) / 2)), icon: Wrench },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-sm border border-border bg-muted/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    <span className="font-mono text-xs text-muted-foreground">{Math.round(value)}%</span>
                  </div>
                  <Progress value={value} className="h-1.5" />
                  <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="robotics-asset-grid">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-32 rounded-sm border border-border bg-muted/40 animate-pulse" />
                ))
              ) : (
                assets.map((asset) => (
                  <div key={asset.id} className="rounded-sm border border-border bg-background p-4" data-testid={`robotics-asset-${asset.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{asset.name}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{asset.id}</p>
                      </div>
                      <Badge variant={["sampling", "mapping", "restoring", "seeding", "detecting", "sweeping", "tasking", "patrolling", "deployed"].includes(asset.status) ? "success" : asset.status === "charging" ? "warning" : "outline"}>
                        {asset.status}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span className="truncate">{asset.zone}</span>
                      </div>
                      <Progress value={asset.battery} className="h-1.5" indicatorClassName={asset.battery < 30 ? "bg-destructive" : asset.battery < 60 ? "bg-amber-500" : "bg-emerald-500"} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Autonomy Pipeline</CardTitle>
              <CardDescription>Every robot domain runs through the same tasking model.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3" data-testid="robotics-autonomy-pipeline">
              {autonomyPipeline.map(({ label, detail, icon: Icon }, index) => (
                <div key={label} className="grid grid-cols-[36px_1fr] gap-3 rounded-sm border border-border bg-muted/20 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{index + 1}. {label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Safety Envelope</CardTitle>
              <CardDescription>Guardrails for autonomous operation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Geofence compliance", value: 96 },
                { label: "Human authorization", value: 88 },
                { label: "Return-to-base coverage", value: 91 },
                { label: "Evidence logging", value: 94 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-mono">{item.value}%</span>
                  </div>
                  <Progress value={item.value} className="h-1.5" />
                </div>
              ))}
              <div className="flex items-start gap-2 rounded-sm border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span>High-risk interventions remain operator authorized. Autonomy executes bounded tasks, not unchecked outcomes.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
