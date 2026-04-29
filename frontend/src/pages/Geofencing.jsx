import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { geofenceAPI, zoneAPI } from "../lib/api";
import { Shield, Plus, Trash2, AlertTriangle, Play } from "lucide-react";

export default function GeofencingPage() {
  const [geofences, setGeofences] = useState([]);
  const [zones, setZones] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [violations, setViolations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", zone_id: "", fence_type: "protected", center_lat: 0, center_lng: 0, radius_km: 1 });

  useEffect(() => {
    const fetch = async () => {
      try {
        const [g, z] = await Promise.all([geofenceAPI.getAll(), zoneAPI.getAll()]);
        setGeofences(g.data || []);
        setZones(z.data || []);
      } catch {} finally { setLoading(false); }
    };
    fetch();
  }, []);

  const handleCreate = async () => {
    try {
      await geofenceAPI.create(form);
      const g = await geofenceAPI.getAll();
      setGeofences(g.data || []);
      setCreateOpen(false);
      setForm({ name: "", zone_id: "", fence_type: "protected", center_lat: 0, center_lng: 0, radius_km: 1 });
    } catch {}
  };

  const handleDelete = async (id) => {
    try { await geofenceAPI.delete(id); setGeofences(prev => prev.filter(g => g.id !== id)); } catch {}
  };

  const handleCheck = async () => {
    try { const res = await geofenceAPI.check(); setViolations(res.data); } catch {}
  };

  const fenceTypeColors = { protected: "success", restricted: "destructive", monitored: "info" };

  return (
    <div className="space-y-6" data-testid="geofencing-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">{geofences.length} geofences active</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCheck}><Play className="w-4 h-4 mr-1" />Check Violations</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Geofence</Button>
        </div>
      </div>

      {violations && (
        <Card className={violations.violations?.length > 0 ? "border-destructive" : "border-emerald-500"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {violations.violations?.length > 0 ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <Shield className="w-4 h-4 text-emerald-500" />}
              <span className="font-medium text-sm">
                {violations.violations?.length > 0 ? `${violations.violations.length} violations detected` : "No violations — all clear"}
              </span>
            </div>
            {violations.violations?.map((v, i) => (
              <div key={i} className="text-xs text-muted-foreground">• {v.drone_name} entered {v.geofence_name} ({v.type})</div>
            ))}
          </CardContent>
        </Card>
      )}

      {geofences.length === 0 && !loading ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No geofences configured. Create virtual boundaries for protected areas.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {geofences.map(fence => (
            <Card key={fence.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    <span className="font-medium text-sm">{fence.name}</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(fence.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={fenceTypeColors[fence.fence_type] || "outline"}>{fence.fence_type}</Badge>
                  <Badge variant="outline" className="text-[10px]">{fence.radius_km} km radius</Badge>
                  {fence.alerts_enabled && <Badge variant="warning" className="text-[10px]">Alerts ON</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {fence.center_lat?.toFixed(2)}°, {fence.center_lng?.toFixed(2)}°
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Geofence</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Amazon Protected Zone" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.fence_type} onValueChange={(v) => setForm({ ...form, fence_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="protected">Protected</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="monitored">Monitored</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Radius (km)</Label><Input type="number" step="0.5" value={form.radius_km} onChange={(e) => setForm({ ...form, radius_km: parseFloat(e.target.value) || 1 })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Latitude</Label><Input type="number" step="0.01" value={form.center_lat} onChange={(e) => setForm({ ...form, center_lat: parseFloat(e.target.value) || 0 })} /></div>
              <div className="space-y-2"><Label>Longitude</Label><Input type="number" step="0.01" value={form.center_lng} onChange={(e) => setForm({ ...form, center_lng: parseFloat(e.target.value) || 0 })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={handleCreate} disabled={!form.name}>Create Geofence</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
