import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { patrolAPI, droneAPI, zoneAPI } from "../lib/api";
import { formatDateTime, getStatusColor } from "../lib/utils";
import { Route, Plus, Play, Pause, CheckCircle, Trash2, Loader2, MapPin, Clock, Plane } from "lucide-react";

export default function PatrolScheduling() {
  const [patrols, setPatrols] = useState([]);
  const [drones, setDrones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ name: "", drone_ids: [], schedule_type: "daily", optimization_priority: "balanced" });

  useEffect(() => {
    const fetch = async () => {
      try {
        const [p, d] = await Promise.all([patrolAPI.getAll(), droneAPI.getAll()]);
        setPatrols(p.data || []);
        setDrones(d.data || []);
      } catch {} finally { setLoading(false); }
    };
    fetch();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await patrolAPI.generate(form);
      const p = await patrolAPI.getAll();
      setPatrols(p.data || []);
      setGenerateOpen(false);
      setForm({ name: "", drone_ids: [], schedule_type: "daily", optimization_priority: "balanced" });
    } catch {} finally { setGenerating(false); }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      if (status === "completed") await patrolAPI.complete(id);
      else await patrolAPI.update(id, { status });
      const p = await patrolAPI.getAll();
      setPatrols(p.data || []);
    } catch {}
  };

  const handleDelete = async (id) => {
    try { await patrolAPI.delete(id); setPatrols(prev => prev.filter(p => p.id !== id)); } catch {}
  };

  const toggleDrone = (id) => {
    setForm(prev => ({
      ...prev,
      drone_ids: prev.drone_ids.includes(id) ? prev.drone_ids.filter(d => d !== id) : [...prev.drone_ids, id],
    }));
  };

  return (
    <div className="space-y-6" data-testid="patrol-scheduling-page">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{patrols.length} patrol schedules</p>
        <Button size="sm" onClick={() => setGenerateOpen(true)} data-testid="generate-patrol-btn">
          <Plus className="w-4 h-4 mr-1" />Generate Patrol
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-32 bg-muted animate-pulse rounded-sm" /></CardContent></Card>)}</div>
      ) : patrols.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground"><Route className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No patrols scheduled. Generate an AI-optimized patrol.</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {patrols.map(patrol => (
            <Card key={patrol.id} data-testid={`patrol-card-${patrol.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{patrol.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={getStatusColor(patrol.status)}>{patrol.status}</Badge>
                      <Badge variant="outline" className="text-[10px]">{patrol.schedule_type}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {patrol.status === "pending" && <Button size="sm" variant="outline" onClick={() => handleStatusUpdate(patrol.id, "active")}><Play className="w-3.5 h-3.5 mr-1" />Start</Button>}
                    {patrol.status === "active" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleStatusUpdate(patrol.id, "paused")}><Pause className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" onClick={() => handleStatusUpdate(patrol.id, "completed")}><CheckCircle className="w-3.5 h-3.5 mr-1" />Complete</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(patrol.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground text-xs">Distance</span><p className="font-medium">{patrol.total_distance_km?.toFixed(1)} km</p></div>
                  <div><span className="text-muted-foreground text-xs">Duration</span><p className="font-medium">{patrol.estimated_duration_mins} min</p></div>
                  <div><span className="text-muted-foreground text-xs">Waypoints</span><p className="font-medium">{patrol.waypoints?.length || 0}</p></div>
                  <div><span className="text-muted-foreground text-xs">Efficiency</span><p className="font-medium">{Math.round((patrol.efficiency_score || 0) * 100)}%</p></div>
                </div>
                {patrol.ai_reasoning && (
                  <div className="mt-3 p-2 rounded-sm bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">AI:</span> {patrol.ai_reasoning}</p>
                  </div>
                )}
                {patrol.waypoints?.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {patrol.waypoints.map((wp, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] gap-1">
                        <MapPin className="w-2.5 h-2.5" />{wp.zone_name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate AI-Optimized Patrol</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Patrol Name</Label><Input placeholder="Evening Biodiversity Sweep" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Select Drones ({form.drone_ids.length} selected)</Label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                {drones.map(d => (
                  <button key={d.id} type="button" onClick={() => toggleDrone(d.id)}
                    className={`flex items-center gap-2 p-2 rounded-sm border text-left text-sm transition-all ${form.drone_ids.includes(d.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                    <Plane className="w-3.5 h-3.5 shrink-0" />{d.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Schedule Type</Label>
              <Select value={form.schedule_type} onValueChange={(v) => setForm({ ...form, schedule_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="one_time">One-Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleGenerate} disabled={!form.name || form.drone_ids.length === 0 || generating}>
              {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</> : "Generate Patrol"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
