import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { forecastAPI, zoneAPI } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { TrendingUp, TrendingDown, Minus, Loader2, BarChart3 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { LoadingState, EmptyState, ErrorState } from "../components/state";
import { toast } from "../lib/toast";

export default function EcosystemForecasting() {
  const [zones, setZones] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [selectedZone, setSelectedZone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [z, f] = await Promise.all([zoneAPI.getAll(), forecastAPI.getAll()]);
      setZones(z.data || []);
      setForecasts(f.data || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerate = async () => {
    if (!selectedZone) return;
    setGenerating(true);
    try {
      await forecastAPI.generate(selectedZone);
      const f = await forecastAPI.getAll();
      setForecasts(f.data || []);
      toast.success("Forecast generated", { description: "30/60/90-day predictions are ready." });
    } catch (err) {
      toast.error("Forecast generation failed", {
        description: err.response?.data?.detail || err.message || "Try again.",
      });
    } finally { setGenerating(false); }
  };

  const trendIcon = (trend) => {
    return trend === "improving" ? <TrendingUp className="w-4 h-4 text-emerald-600" />
      : trend === "declining" ? <TrendingDown className="w-4 h-4 text-red-500" />
      : <Minus className="w-4 h-4 text-gray-400" />;
  };

  const riskBadge = (risk) => {
    const v = risk === "critical" ? "destructive" : risk === "high" ? "warning" : risk === "medium" ? "info" : "success";
    return <Badge variant={v}>{risk}</Badge>;
  };

  // Group forecasts by zone
  const groupedForecasts = {};
  forecasts.forEach(f => {
    if (!groupedForecasts[f.zone_id]) groupedForecasts[f.zone_id] = { zone_name: f.zone_name, forecasts: [] };
    groupedForecasts[f.zone_id].forecasts.push(f);
  });

  if (loading) {
    return <LoadingState label="Loading forecasts..." />;
  }

  if (error && forecasts.length === 0 && zones.length === 0) {
    return (
      <ErrorState
        title="Couldn't load forecasts"
        error={error}
        onRetry={() => { setError(null); fetchData(); }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="forecasting-page">
      {/* Generate */}
      <Card>
        <CardHeader><CardTitle className="text-base">Generate Ecosystem Forecast</CardTitle><CardDescription>AI-powered 30/60/90 day predictions</CardDescription></CardHeader>
        <CardContent className="flex items-end gap-4">
          <div className="flex-1 space-y-2">
            <Label>Select Zone</Label>
            <Select value={selectedZone} onValueChange={setSelectedZone}>
              <SelectTrigger><SelectValue placeholder="Choose a zone" /></SelectTrigger>
              <SelectContent>{zones.filter(z => z.id).map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerate} disabled={!selectedZone || generating}>
            {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : <><BarChart3 className="w-4 h-4 mr-2" />Generate</>}
          </Button>
        </CardContent>
      </Card>

      {/* Forecast Results */}
      {Object.entries(groupedForecasts).map(([zoneId, group]) => {
        const bioForecast = group.forecasts.find(f => f.forecast_type === "biodiversity");
        const soilForecast = group.forecasts.find(f => f.forecast_type === "soil_health");

        const chartData = [];
        if (bioForecast) {
          chartData.push({ day: "Now", biodiversity: Math.round((bioForecast.current_value || 0) * 100), soil: soilForecast ? Math.round((soilForecast.current_value || 0) * 100) : null });
          bioForecast.predictions?.forEach((p, i) => {
            chartData.push({
              day: `${p.days}d`,
              biodiversity: Math.round(p.value * 100),
              soil: soilForecast?.predictions?.[i] ? Math.round(soilForecast.predictions[i].value * 100) : null,
            });
          });
        }

        return (
          <Card key={zoneId}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{group.zone_name}</CardTitle>
                <div className="flex items-center gap-2">
                  {bioForecast && <>{trendIcon(bioForecast.trend)} {riskBadge(bioForecast.risk_level)}</>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {chartData.length > 0 && (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(76 11% 82%)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="biodiversity" stroke="hsl(144 33% 26%)" strokeWidth={2} dot={{ r: 3 }} name="Biodiversity %" />
                      {soilForecast && <Line type="monotone" dataKey="soil" stroke="hsl(13 67% 60%)" strokeWidth={2} dot={{ r: 3 }} name="Soil Health %" />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {bioForecast?.ai_analysis && (
                <div className="p-3 rounded-sm bg-muted/50 border border-border">
                  <p className="text-xs"><span className="font-medium">AI Analysis:</span> {bioForecast.ai_analysis}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {Object.keys(groupedForecasts).length === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No forecasts generated yet"
          description="Select a zone above and click Generate to produce 30/60/90-day predictions."
        />
      )}
    </div>
  );
}
