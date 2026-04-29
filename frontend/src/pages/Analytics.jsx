import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { dashboardAPI, sensorAPI, zoneAPI } from "../lib/api";
import { formatPercent } from "../lib/utils";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from "recharts";
import { BarChart3, Radio, MapPin } from "lucide-react";

export default function Analytics() {
  const [trends, setTrends] = useState(null);
  const [zones, setZones] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [t, z, s] = await Promise.all([dashboardAPI.getTrends(), zoneAPI.getAll(), sensorAPI.getAll()]);
        setTrends(t.data);
        setZones(z.data || []);
        setSensors(s.data || []);
      } catch {} finally { setLoading(false); }
    };
    fetch();
  }, []);

  const missionData = trends?.drone_missions || [];
  const radarData = zones.slice(0, 6).map(z => ({
    zone: z.name?.split(" ")[0] || "Zone",
    biodiversity: Math.round((z.biodiversity_index || 0) * 100),
    soil: Math.round((z.soil_health || 0) * 100),
    vegetation: Math.round((z.vegetation_coverage || 0) * 100),
  }));

  const trendData = trends?.biodiversity?.map((b, i) => ({
    month: b.month,
    biodiversity: Math.round(b.value * 100),
    soil: Math.round((trends.soil_health?.[i]?.value || 0) * 100),
  })) || [];

  if (loading) return <div className="h-64 bg-muted animate-pulse rounded-sm" />;

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends"><BarChart3 className="w-3.5 h-3.5 mr-1.5" />Trends</TabsTrigger>
          <TabsTrigger value="zones"><MapPin className="w-3.5 h-3.5 mr-1.5" />Zone Comparison</TabsTrigger>
          <TabsTrigger value="sensors"><Radio className="w-3.5 h-3.5 mr-1.5" />Sensor Data</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Ecosystem Health Trends</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(76 11% 82%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="biodiversity" stroke="hsl(144 33% 26%)" fill="hsl(144 33% 26% / 0.15)" strokeWidth={2} name="Biodiversity %" />
                      <Area type="monotone" dataKey="soil" stroke="hsl(13 67% 60%)" fill="hsl(13 67% 60% / 0.15)" strokeWidth={2} name="Soil Health %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Drone Missions by Type</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={missionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(76 11% 82%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="monitoring" fill="hsl(144 33% 26%)" name="Monitoring" radius={[2,2,0,0]} />
                      <Bar dataKey="sampling" fill="hsl(13 67% 60%)" name="Sampling" radius={[2,2,0,0]} />
                      <Bar dataKey="reforestation" fill="hsl(38 72% 62%)" name="Reforestation" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="zones" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Zone Health Comparison</CardTitle></CardHeader>
            <CardContent>
              {radarData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(76 11% 82%)" />
                      <PolarAngleAxis dataKey="zone" tick={{ fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Radar name="Biodiversity" dataKey="biodiversity" stroke="hsl(144 33% 26%)" fill="hsl(144 33% 26% / 0.2)" />
                      <Radar name="Soil" dataKey="soil" stroke="hsl(13 67% 60%)" fill="hsl(13 67% 60% / 0.2)" />
                      <Radar name="Vegetation" dataKey="vegetation" stroke="hsl(80 15% 55%)" fill="hsl(80 15% 55% / 0.2)" />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No zone data available</p>}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map(z => (
              <Card key={z.id}>
                <CardContent className="p-4">
                  <p className="font-medium text-sm mb-2">{z.name}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Biodiversity:</span> <span className="font-medium">{formatPercent(z.biodiversity_index)}</span></div>
                    <div><span className="text-muted-foreground">Soil:</span> <span className="font-medium">{formatPercent(z.soil_health)}</span></div>
                    <div><span className="text-muted-foreground">Predator-Prey:</span> <span className="font-medium">{formatPercent(z.predator_prey_balance)}</span></div>
                    <div><span className="text-muted-foreground">Vegetation:</span> <span className="font-medium">{formatPercent(z.vegetation_coverage)}</span></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sensors">
          <Card>
            <CardHeader><CardTitle className="text-base">Sensor Network ({sensors.length} sensors)</CardTitle></CardHeader>
            <CardContent>
              {sensors.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left">
                      <th className="p-2 font-medium text-muted-foreground">Name</th>
                      <th className="p-2 font-medium text-muted-foreground">Type</th>
                      <th className="p-2 font-medium text-muted-foreground">Status</th>
                      <th className="p-2 font-medium text-muted-foreground">Value</th>
                    </tr></thead>
                    <tbody>
                      {sensors.map(s => (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="p-2">{s.name}</td>
                          <td className="p-2 text-muted-foreground">{s.sensor_type}</td>
                          <td className="p-2"><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${s.status === "active" ? "bg-emerald-500" : "bg-gray-400"}`} />{s.status}</td>
                          <td className="p-2 font-mono">{s.current_value} {s.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-8">No sensors deployed yet</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
