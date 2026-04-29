import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Progress } from "../components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { zoneAPI } from "../lib/api";
import { formatPercent, getPriorityColor, cn } from "../lib/utils";
import { MapPin, Plus, Edit, Trash2, Leaf, FlaskConical, PawPrint, Trees } from "lucide-react";

function MetricBar({ label, value, icon: Icon, color }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground"><Icon className="w-3 h-3" />{label}</span>
        <span className="font-medium">{formatPercent(value)}</span>
      </div>
      <Progress value={(value || 0) * 100} className="h-1.5" indicatorClassName={color} />
    </div>
  );
}

export default function ZoneManagement() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editZone, setEditZone] = useState(null);
  const [form, setForm] = useState({ name: "", zone_type: "forest", priority: "medium", description: "", center_lat: 0, center_lng: 0, radius_km: 5, biodiversity_index: 0.5, soil_health: 0.5, predator_prey_balance: 0.5, vegetation_coverage: 0.5 });

  const fetchData = async () => {
    setLoading(true);
    try { const res = await zoneAPI.getAll(); setZones(res.data || []); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    try { await zoneAPI.create(form); setCreateOpen(false); resetForm(); fetchData(); } catch {}
  };

  const handleUpdate = async () => {
    try { await zoneAPI.update(editZone.id, form); setEditZone(null); resetForm(); fetchData(); } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this zone?")) return;
    try { await zoneAPI.delete(id); fetchData(); } catch {}
  };

  const resetForm = () => setForm({ name: "", zone_type: "forest", priority: "medium", description: "", center_lat: 0, center_lng: 0, radius_km: 5, biodiversity_index: 0.5, soil_health: 0.5, predator_prey_balance: 0.5, vegetation_coverage: 0.5 });

  const openEdit = (zone) => {
    setForm({ name: zone.name, zone_type: zone.zone_type, priority: zone.priority, description: zone.description || "", center_lat: zone.center_lat, center_lng: zone.center_lng, radius_km: zone.radius_km, biodiversity_index: zone.biodiversity_index, soil_health: zone.soil_health, predator_prey_balance: zone.predator_prey_balance, vegetation_coverage: zone.vegetation_coverage });
    setEditZone(zone);
  };

  const ZoneForm = ({ onSubmit, title }) => (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
        <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.zone_type} onValueChange={(v) => setForm({ ...form, zone_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["forest","wetland","grassland","coastal","desert"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["critical","high","medium","low"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="0.01" value={form.center_lat} onChange={(e) => setForm({ ...form, center_lat: parseFloat(e.target.value) || 0 })} /></div>
          <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="0.01" value={form.center_lng} onChange={(e) => setForm({ ...form, center_lng: parseFloat(e.target.value) || 0 })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={onSubmit} disabled={!form.name}>Save</Button></DialogFooter>
    </DialogContent>
  );

  return (
    <div className="space-y-6" data-testid="zone-management-page">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{zones.length} zones monitored</p>
        <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }} data-testid="add-zone-btn">
          <Plus className="w-4 h-4 mr-1" />Add Zone
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-40 bg-muted animate-pulse rounded-sm" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {zones.map((zone) => (
            <Card key={zone.id} data-testid={`zone-card-${zone.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" strokeWidth={1.5} style={{ color: getPriorityColor(zone.priority) }} />
                    <CardTitle className="text-base">{zone.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(zone)}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(zone.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{zone.zone_type}</Badge>
                  <Badge className={cn("text-[10px]", zone.priority === "critical" ? "bg-red-500/15 text-red-700 border-red-200" : zone.priority === "high" ? "bg-orange-500/15 text-orange-700 border-orange-200" : "bg-blue-500/15 text-blue-700 border-blue-200")}>{zone.priority}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <MetricBar label="Biodiversity" value={zone.biodiversity_index} icon={Leaf} color="bg-chart-1" />
                <MetricBar label="Soil Health" value={zone.soil_health} icon={FlaskConical} color="bg-chart-2" />
                <MetricBar label="Predator-Prey" value={zone.predator_prey_balance} icon={PawPrint} color="bg-chart-3" />
                <MetricBar label="Vegetation" value={zone.vegetation_coverage} icon={Trees} color="bg-chart-5" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><ZoneForm onSubmit={handleCreate} title="Create Zone" /></Dialog>
      <Dialog open={!!editZone} onOpenChange={(o) => !o && setEditZone(null)}><ZoneForm onSubmit={handleUpdate} title="Edit Zone" /></Dialog>
    </div>
  );
}
