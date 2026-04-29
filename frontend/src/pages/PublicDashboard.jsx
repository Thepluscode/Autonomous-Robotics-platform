import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { publicAPI } from "../lib/api";
import { Leaf, Globe, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export default function PublicDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicAPI.getDashboard().then(res => setData(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background" data-testid="public-dashboard">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-sm bg-primary text-primary-foreground">
              <Leaf className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-lg font-heading font-bold">Ecosystem Architect</h1>
              <p className="text-xs text-muted-foreground">Public Transparency Portal</p>
            </div>
          </div>
          <Link to="/login"><Button variant="outline" size="sm">Sign In</Button></Link>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-sm" />)}</div>
        ) : data ? (
          <>
            {/* Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2"><Globe className="w-5 h-5 text-primary" />Global Ecosystem Overview</CardTitle>
                <CardDescription>Real-time monitoring of planetary rewilding efforts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-heading font-bold text-primary">{data.overview?.total_monitored_zones || 0}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Monitored Zones</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-heading font-bold">{data.overview?.average_biodiversity_index || 0}%</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Biodiversity</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-heading font-bold">{data.overview?.average_soil_health || 0}%</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Soil Health</p>
                  </div>
                  <div className="text-center">
                    <Badge variant={data.overview?.ecosystem_status === "Healthy" ? "success" : data.overview?.ecosystem_status === "Critical" ? "destructive" : "warning"} className="text-sm px-4 py-1">
                      {data.overview?.ecosystem_status || "Unknown"}
                    </Badge>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Status</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Zone Summary */}
            {data.zone_summary?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Zone Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border">
                        <th className="p-2 text-left font-medium text-muted-foreground">Zone</th>
                        <th className="p-2 text-left font-medium text-muted-foreground">Type</th>
                        <th className="p-2 text-left font-medium text-muted-foreground">Biodiversity</th>
                        <th className="p-2 text-left font-medium text-muted-foreground">Status</th>
                      </tr></thead>
                      <tbody>
                        {data.zone_summary.map((z, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="p-2 font-medium flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-primary" />{z.name}</td>
                            <td className="p-2 text-muted-foreground capitalize">{z.type}</td>
                            <td className="p-2 font-mono">{z.biodiversity}%</td>
                            <td className="p-2"><Badge variant={z.status === "critical" ? "destructive" : z.status === "high" ? "warning" : "info"} className="text-[10px]">{z.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground text-center">Last updated: {data.last_updated}</p>
          </>
        ) : <p className="text-center text-muted-foreground">Unable to load public dashboard data.</p>}
      </div>
    </div>
  );
}
