import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { dashboardAPI, alertAPI, seedAPI, zoneAPI, droneAPI } from "../lib/api";
import useWebSocket from "../hooks/useWebSocket";
import { formatDateTime } from "../lib/utils";
import {
  Leaf, MapPin, Radio, AlertTriangle, Database, TrendingUp,
  Activity, Zap, Wifi, WifiOff, Bot, Bug, Wind, BarChart3, ShieldCheck, Crosshair, Battery
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const REFRESH_INTERVAL = 5000; // 5s live refresh

function HealthDial({ label, value, icon: Icon, tone = "primary" }) {
  const color = tone === "accent" ? "hsl(var(--accent))" : tone === "warning" ? "hsl(38 72% 48%)" : "hsl(var(--primary))";
  return (
    <div className="flex items-center gap-4 rounded-sm border border-border bg-card p-4">
      <div
        className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${Math.max(0, Math.min(100, value)) * 3.6}deg, hsl(var(--muted)) 0deg)` }}
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-card">
          <Icon className="h-5 w-5" style={{ color }} strokeWidth={1.5} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-heading font-bold tabular-nums">{Math.round(value)}%</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [zones, setZones] = useState([]);
  const [drones, setDrones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [tick, setTick] = useState(0);
  const { isConnected, lastMessage } = useWebSocket();
  const intervalRef = useRef(null);

  // Core data fetch
  const fetchAll = async () => {
    try {
      const [s, a, z, d] = await Promise.all([
        dashboardAPI.getStats(),
        alertAPI.getAll(true),
        zoneAPI.getAll(),
        droneAPI.getAll(),
      ]);
      setStats(s.data);
      setAlerts(a.data || []);
      setZones(z.data || []);
      setDrones(d.data || []);
    } catch {} finally { setLoading(false); }
  };

  // Initial + auto-refresh every 5s
  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(() => {
      fetchAll();
      setTick(t => t + 1);
    }, REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  // React to WebSocket messages
  useEffect(() => {
    if (lastMessage) fetchAll();
  }, [lastMessage]);

  const handleSeed = async () => {
    setSeeding(true);
    try { await seedAPI.seed(); await fetchAll(); } catch {} finally { setSeeding(false); }
  };

  // Derived live data
  const activeDrones = drones.filter(d => ["patrolling", "deployed", "monitoring"].includes(d.status));
  const criticalZones = zones.filter(z => (z.biodiversity_index || 0) < 0.3 || (z.soil_health || 0) < 0.3);
  const avgBattery = drones.length > 0 ? Math.round(drones.reduce((s, d) => s + (d.battery || 0), 0) / drones.length) : 0;
  const avgBio = stats?.avg_biodiversity ? Math.round(stats.avg_biodiversity * 100) : 0;
  const avgSoil = stats?.avg_soil_health ? Math.round(stats.avg_soil_health * 100) : 0;
  const ecosystemScore = Math.round((avgBio + avgSoil) / 2);
  const fleetReadiness = drones.length > 0 ? Math.round((activeDrones.length / drones.length) * 65 + avgBattery * 0.35) : 0;
  const interventionPressure = zones.length > 0 ? Math.round((criticalZones.length / zones.length) * 100) : 0;
  const missionCoverage = zones.length > 0 ? Math.round((new Set(drones.map(d => d.zone_id).filter(Boolean)).size / zones.length) * 100) : 0;

  // Generate health trend from zones for area chart
  const trendData = zones.slice(0, 6).map((z, i) => ({
    name: z.name?.split(" ")[0] || `Z${i + 1}`,
    biodiversity: Math.round((z.biodiversity_index || 0) * 100),
    soil: Math.round((z.soil_health || 0) * 100),
    vegetation: Math.round((z.vegetation_coverage || Math.random() * 0.6 + 0.3) * 100),
  }));

  // Drone status pie chart
  const statusCounts = {};
  drones.forEach(d => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const PIE_COLORS = ["hsl(144,33%,26%)", "hsl(13,67%,60%)", "hsl(76,30%,50%)", "hsl(30,50%,50%)", "#888"];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-16 bg-muted animate-pulse rounded-sm" /></CardContent></Card>)}
        </div>
      </div>
    );
  }

  const isEmpty = !stats || (stats.total_drones === 0 && stats.total_zones === 0);

  return (
    <div className="space-y-5" data-testid="dashboard-page">
      {/* Live Status Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            {isConnected ? <><Wifi className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600 font-medium">LIVE</span></> : <><WifiOff className="w-3 h-3 text-red-400" /><span>Offline</span></>}
          </span>
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" />Refresh: {REFRESH_INTERVAL / 1000}s</span>
          <span className="tabular-nums">Tick #{tick}</span>
        </div>
        <span>{new Date().toLocaleTimeString()}</span>
      </div>

      {isEmpty ? (
        <Card className="border-dashed"><CardContent className="p-10 text-center">
          <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" strokeWidth={1} />
          <h3 className="text-lg font-heading font-semibold mb-1">No ecosystem data found</h3>
          <p className="text-sm text-muted-foreground mb-4">Seed demo zones and drones to get started</p>
          <Button onClick={handleSeed} disabled={seeding} data-testid="seed-btn">
            <Zap className="w-4 h-4 mr-2" />{seeding ? "Seeding..." : "Seed Demo Data"}
          </Button>
        </CardContent></Card>
      ) : (
        <>
          {/* Operational Snapshot */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1.25fr] gap-4">
            <HealthDial label="Ecosystem Stability" value={ecosystemScore} icon={ShieldCheck} tone={ecosystemScore < 45 ? "accent" : ecosystemScore < 70 ? "warning" : "primary"} />
            <HealthDial label="Fleet Readiness" value={fleetReadiness} icon={Battery} tone={fleetReadiness < 45 ? "accent" : fleetReadiness < 70 ? "warning" : "primary"} />
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Operational Pressure</p>
                    <p className="text-sm text-muted-foreground">Intervention load and zone coverage</p>
                  </div>
                  <Badge variant={interventionPressure > 35 ? "destructive" : interventionPressure > 0 ? "warning" : "success"}>
                    {interventionPressure > 35 ? "High" : interventionPressure > 0 ? "Watch" : "Stable"}
                  </Badge>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-accent" />Intervention Pressure</span>
                      <span className="font-mono">{interventionPressure}%</span>
                    </div>
                    <Progress value={interventionPressure} className="h-2" indicatorClassName="bg-accent" />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2"><Crosshair className="h-3.5 w-3.5 text-primary" />Mission Coverage</span>
                      <span className="font-mono">{missionCoverage}%</span>
                    </div>
                    <Progress value={missionCoverage} className="h-2" indicatorClassName="bg-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stat Cards — Top Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Bot, label: "Active Drones", value: `${activeDrones.length}/${drones.length}`, sub: `Avg Battery: ${avgBattery}%`, color: "text-emerald-600" },
              { icon: MapPin, label: "Monitored Zones", value: stats?.total_zones, sub: `${criticalZones.length} critical`, color: "text-primary" },
              { icon: Radio, label: "Active Sensors", value: `${stats?.active_sensors || 0}/${stats?.total_sensors || 0}`, sub: "Collecting data", color: "text-blue-500" },
              { icon: AlertTriangle, label: "Unread Alerts", value: stats?.unread_alerts || 0, sub: alerts.length > 0 ? `Latest: ${alerts[0]?.type || "alert"}` : "All clear", color: alerts.length > 0 ? "text-amber-500" : "text-emerald-600" },
            ].map((s, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
                      <p className="text-2xl font-heading font-bold mt-1 tabular-nums">{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
                    </div>
                    <div className={`p-2 rounded-sm bg-muted/50 ${s.color}`}>
                      <s.icon className="w-5 h-5" strokeWidth={1.5} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Health Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Leaf className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    <span className="text-sm font-medium">Avg. Biodiversity Index</span>
                  </div>
                  <span className="text-xl font-heading font-bold tabular-nums">{avgBio}%</span>
                </div>
                <Progress value={avgBio} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {avgBio >= 70 ? "Healthy ecosystem" : avgBio >= 40 ? "Moderate — intervention may help" : "Critical — immediate action needed"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bug className="w-4 h-4 text-accent" strokeWidth={1.5} />
                    <span className="text-sm font-medium">Avg. Soil Health</span>
                  </div>
                  <span className="text-xl font-heading font-bold tabular-nums">{avgSoil}%</span>
                </div>
                <Progress value={avgSoil} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {avgSoil >= 70 ? "Rich organic matter" : avgSoil >= 40 ? "Adequate — mycorrhizal support recommended" : "Degraded — restoration protocol required"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Zone Health Comparison */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" strokeWidth={1.5} />Zone Health Comparison
                  <Badge variant="outline" className="text-[10px] ml-auto">Live</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="bioGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(144,33%,26%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(144,33%,26%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(13,67%,60%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(13,67%,60%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(76 11% 82%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="biodiversity" stroke="hsl(144,33%,26%)" fill="url(#bioGrad)" strokeWidth={2} name="Biodiversity %" />
                      <Area type="monotone" dataKey="soil" stroke="hsl(13,67%,60%)" fill="url(#soilGrad)" strokeWidth={2} name="Soil Health %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Drone Fleet Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" strokeWidth={1.5} />Fleet Status
                  <Badge variant="outline" className="text-[10px] ml-auto">Live</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-sm text-muted-foreground text-center py-8">No drone data</p>}
              </CardContent>
            </Card>
          </div>

          {/* Live Drone Telemetry + Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Live Drone Feed */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />Live Drone Telemetry
                  </CardTitle>
                  <Badge variant="success" className="text-[10px] animate-pulse">Streaming</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {drones.slice(0, 8).map((drone, i) => (
                    <div key={drone.id || i} className="flex items-center justify-between p-2 rounded-sm border border-border text-sm hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full ${drone.status === "patrolling" || drone.status === "deployed" ? "bg-emerald-500 animate-pulse" : drone.status === "idle" ? "bg-gray-400" : "bg-amber-500"}`} />
                        <span className="font-medium truncate">{drone.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="tabular-nums">{drone.battery?.toFixed(0)}%</span>
                        <span className="tabular-nums">{drone.latitude?.toFixed(3)}°, {drone.longitude?.toFixed(3)}°</span>
                        <Badge variant={drone.status === "patrolling" ? "success" : drone.status === "idle" ? "secondary" : "warning"} className="text-[9px]">{drone.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Live Zone Health */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wind className="w-4 h-4 text-primary" />Zone Health Monitor
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">{zones.length} zones</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {zones.map((zone, i) => {
                    const bio = Math.round((zone.biodiversity_index || 0) * 100);
                    const soil = Math.round((zone.soil_health || 0) * 100);
                    const isCritical = bio < 30 || soil < 30;
                    return (
                      <div key={zone.id || i} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {isCritical && <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />}
                            <span className="font-medium">{zone.name}</span>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant={bio >= 60 ? "success" : bio >= 30 ? "warning" : "destructive"} className="text-[9px]">Bio {bio}%</Badge>
                            <Badge variant={soil >= 60 ? "success" : soil >= 30 ? "warning" : "destructive"} className="text-[9px]">Soil {soil}%</Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Progress value={bio} className="h-1.5 flex-1" />
                          <Progress value={soil} className="h-1.5 flex-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alerts Section */}
          {alerts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />Active Alerts ({alerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {alerts.slice(0, 5).map((a, i) => (
                    <div key={a.id || i} className="flex items-center justify-between p-2 rounded-sm border border-border text-sm">
                      <div><span className="font-medium">{a.title || a.type}</span><p className="text-xs text-muted-foreground">{a.message}</p></div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
