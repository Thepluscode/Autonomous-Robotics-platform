import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { aiAPI, zoneAPI } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { Brain, Sparkles, History, Loader2 } from "lucide-react";

export default function AIRecommendations() {
  const [zones, setZones] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ zone_id: "__all__", analysis_type: "general" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [z, h] = await Promise.all([zoneAPI.getAll(), aiAPI.getHistory()]);
        setZones(z.data || []);
        setHistory(h.data || []);
      } catch {} finally { setHistoryLoading(false); }
    };
    fetch();
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    try {
      const payload = { ...form, zone_id: form.zone_id === "__all__" ? "" : form.zone_id };
      const res = await aiAPI.analyze(payload);
      setResult(res.data);
      const h = await aiAPI.getHistory();
      setHistory(h.data || []);
    } catch {} finally { setLoading(false); }
  };

  const analysisTypes = [
    { value: "general", label: "General Assessment" },
    { value: "rewilding", label: "Rewilding Strategy" },
    { value: "soil", label: "Soil Restoration" },
    { value: "predator_prey", label: "Predator-Prey Dynamics" },
    { value: "species", label: "Species Reintroduction" },
  ];

  return (
    <div className="space-y-6" data-testid="ai-recommendations-page">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" strokeWidth={1.5} />Configure Analysis
            </CardTitle>
            <CardDescription>GPT-5.2 powered ecosystem intelligence</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Zone (optional)</Label>
              <Select value={form.zone_id} onValueChange={(v) => setForm({ ...form, zone_id: v })}>
                <SelectTrigger><SelectValue placeholder="All zones" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All zones</SelectItem>
                  {zones.filter(z => z.id).map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Analysis Type</Label>
              <Select value={form.analysis_type} onValueChange={(v) => setForm({ ...form, analysis_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {analysisTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleAnalyze} disabled={loading} data-testid="analyze-btn">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</> : <><Sparkles className="w-4 h-4 mr-2" />Run Analysis</>}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Analysis Results</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="info">{result.analysis_type}</Badge>
                  {result.zone_id && <Badge variant="outline">{zones.find(z => z.id === result.zone_id)?.name || "Zone"}</Badge>}
                </div>
                <div className="p-4 rounded-sm bg-muted/50 border border-border">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{result.recommendations}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
                <p className="text-sm">Configure and run an analysis to see AI recommendations</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4" strokeWidth={1.5} />Analysis History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="space-y-3">
              {history.map((item, i) => (
                <div key={item.id || i} className="p-3 rounded-sm border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[10px]">{item.analysis_type}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.recommendations}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-4">No analysis history yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}
