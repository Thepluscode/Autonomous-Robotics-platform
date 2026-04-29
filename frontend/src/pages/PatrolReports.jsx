import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { patrolAPI } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { FileText, Leaf, MapPin, Bug, AlertTriangle } from "lucide-react";

export default function PatrolReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patrolAPI.getReports().then(res => setReports(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4">{[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-24 bg-muted animate-pulse rounded-sm" /></CardContent></Card>)}</div>;

  return (
    <div className="space-y-6" data-testid="patrol-reports-page">
      {reports.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No patrol reports yet. Complete a patrol to generate a report.</p>
        </CardContent></Card>
      ) : reports.map((report, i) => (
        <Card key={report.id || i} data-testid={`report-card-${i}`}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">{report.patrol_name}</CardTitle>
                <span className="text-xs text-muted-foreground">{formatDateTime(report.created_at)}</span>
              </div>
              <Badge variant="success">{report.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
              <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Waypoints</p><p className="font-medium">{report.total_waypoints_visited}</p></div></div>
              <div className="flex items-center gap-2"><Leaf className="w-3.5 h-3.5 text-primary" /><div><p className="text-xs text-muted-foreground">Soil Samples</p><p className="font-medium">{report.soil_samples_collected}</p></div></div>
              <div className="flex items-center gap-2"><Bug className="w-3.5 h-3.5 text-accent" /><div><p className="text-xs text-muted-foreground">Wildlife</p><p className="font-medium">{report.wildlife_sightings}</p></div></div>
              <div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /><div><p className="text-xs text-muted-foreground">Anomalies</p><p className="font-medium">{report.anomalies_detected?.length || 0}</p></div></div>
            </div>
            {report.ai_summary && (
              <div className="p-3 rounded-sm bg-muted/50 border border-border">
                <p className="text-xs"><span className="font-medium">AI Summary:</span> {report.ai_summary}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
