import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { reportAPI } from "../lib/api";
import { Download, FileText, BarChart3, Database } from "lucide-react";

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [exportData, setExportData] = useState(null);
  const [exportType, setExportType] = useState("zones");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportAPI.getSummary().then(res => setSummary(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleExport = async (type, format) => {
    try {
      const res = await reportAPI.export(type, format);
      if (format === "csv" && res.data?.csv) {
        const blob = new Blob([res.data.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.data.filename || `${type}_export.csv`;
        a.click();
      } else {
        setExportData(res.data);
      }
    } catch {}
  };

  const reportTypes = ["zones", "drones", "patrols", "species", "alerts"];

  return (
    <div className="space-y-6" data-testid="reports-page">
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary"><BarChart3 className="w-3.5 h-3.5 mr-1" />Summary</TabsTrigger>
          <TabsTrigger value="export"><Download className="w-3.5 h-3.5 mr-1" />Export Data</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          {loading ? <div className="h-40 bg-muted animate-pulse rounded-sm" /> : summary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Zones", value: summary.summary?.total_zones },
                  { label: "Critical Zones", value: summary.summary?.critical_zones },
                  { label: "Total Drones", value: summary.summary?.total_drones },
                  { label: "Active Drones", value: summary.summary?.active_drones },
                  { label: "Total Patrols", value: summary.summary?.total_patrols },
                  { label: "Active Patrols", value: summary.summary?.active_patrols },
                  { label: "Species Found", value: summary.summary?.species_identified },
                  { label: "Pending Alerts", value: summary.summary?.pending_alerts },
                ].map(s => (
                  <Card key={s.label}><CardContent className="p-4 text-center">
                    <p className="text-2xl font-heading font-bold">{s.value ?? 0}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </CardContent></Card>
                ))}
              </div>

              {summary.ecosystem_health && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Ecosystem Health</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div><p className="text-xl font-bold">{(summary.ecosystem_health.average_biodiversity * 100).toFixed(1)}%</p><p className="text-xs text-muted-foreground">Avg Biodiversity</p></div>
                      <div><p className="text-xl font-bold">{(summary.ecosystem_health.average_soil_health * 100).toFixed(1)}%</p><p className="text-xs text-muted-foreground">Avg Soil Health</p></div>
                      <div><p className="text-xl font-bold">{summary.ecosystem_health.zones_below_threshold}</p><p className="text-xs text-muted-foreground">Below Threshold</p></div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <p className="text-xs text-muted-foreground text-right">Generated: {summary.generated_at}</p>
            </>
          )}
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Export Data</CardTitle><CardDescription>Download ecosystem data in JSON or CSV format</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {reportTypes.map(type => (
                  <Card key={type} className="border-dashed">
                    <CardContent className="p-4 text-center space-y-3">
                      <Database className="w-8 h-8 mx-auto text-primary" strokeWidth={1} />
                      <p className="text-sm font-medium capitalize">{type}</p>
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" variant="outline" onClick={() => handleExport(type, "json")} className="text-xs">JSON</Button>
                        <Button size="sm" variant="outline" onClick={() => handleExport(type, "csv")} className="text-xs">CSV</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {exportData?.data && (
            <Card>
              <CardHeader><CardTitle className="text-base">Export Preview ({exportData.count} records)</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-4 rounded-sm overflow-x-auto max-h-64 font-mono">
                  {JSON.stringify(exportData.data.slice(0, 5), null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
