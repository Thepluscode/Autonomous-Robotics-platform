import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Progress } from "../components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { droneAPI, zoneAPI } from "../lib/api";
import { getStatusColor, cn } from "../lib/utils";
import { Plane, Battery, MapPin, Plus, Rocket, RefreshCw } from "lucide-react";

export default function DroneFleet() {
  const [drones, setDrones] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [newDrone, setNewDrone] = useState({ name: "", status: "idle" });
  const [deployForm, setDeployForm] = useState({ drone_ids: [], zone_id: "", mission_type: "monitoring" });
  const [selected, setSelected] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [d, z] = await Promise.all([droneAPI.getAll(), zoneAPI.getAll()]);
      setDrones(d.data || []);
      setZones(z.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const filtered = filter === "all" ? drones : drones.filter((d) => d.status === filter);

  const handleCreate = async () => {
    try {
      await droneAPI.create(newDrone);
      setCreateOpen(false);
      setNewDrone({ name: "", status: "idle" });
      fetchData();
    } catch {}
  };

  const handleDeploy = async () => {
    try {
      await droneAPI.deploy({ ...deployForm, drone_ids: selected });
      setDeployOpen(false);
      setSelected([]);
      fetchData();
    } catch {}
  };

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const statusCounts = {
    all: drones.length,
    deployed: drones.filter((d) => d.status === "deployed").length,
    patrolling: drones.filter((d) => d.status === "patrolling").length,
    idle: drones.filter((d) => d.status === "idle").length,
    charging: drones.filter((d) => d.status === "charging").length,
  };

  return (
    <div className="space-y-6" data-testid="drone-fleet-page">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-heading text-lg font-semibold">Aerial Fleet</p>
            <p className="text-sm text-muted-foreground">Drones and VTOL assets are one robotics domain inside the broader autonomous fleet.</p>
          </div>
          <Link to="/robotics" data-testid="view-robotics-platform-link">
            <Button variant="outline" size="sm">
              <Plane className="h-4 w-4" /> Robotics Platform
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(statusCounts).map(([key, count]) => (
            <Button key={key} variant={filter === key ? "default" : "outline"} size="sm" onClick={() => setFilter(key)} data-testid={`filter-${key}`}>
              {key.charAt(0).toUpperCase() + key.slice(1)} ({count})
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <Button size="sm" variant="accent" onClick={() => setDeployOpen(true)} data-testid="deploy-selected-btn">
              <Rocket className="w-4 h-4 mr-1" />Deploy {selected.length}
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="add-drone-btn">
            <Plus className="w-4 h-4 mr-1" />Add Drone
          </Button>
          <Button size="sm" variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Drone Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-32 bg-muted animate-pulse rounded-sm" /></CardContent></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((drone) => (
            <Card key={drone.id} className={cn("cursor-pointer transition-all duration-200 hover:shadow-sm", selected.includes(drone.id) && "ring-2 ring-primary")} onClick={() => toggleSelect(drone.id)}
              data-testid={`drone-card-${drone.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Plane className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    <span className="font-medium text-sm">{drone.name}</span>
                  </div>
                  <Badge className={getStatusColor(drone.status)}>{drone.status}</Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Battery className="w-3 h-3" />
                    <span>{drone.battery}%</span>
                  </div>
                  <Progress value={drone.battery} className="h-1.5" indicatorClassName={drone.battery < 20 ? "bg-destructive" : drone.battery < 50 ? "bg-amber-500" : "bg-emerald-500"} />
                  {drone.zone_id && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{zones.find((z) => z.id === drone.zone_id)?.name || drone.zone_id}</span>
                    </div>
                  )}
                </div>
                {drone.mission_type && <Badge variant="outline" className="text-[10px]">{drone.mission_type}</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Drone Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Drone</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input placeholder="Sentinel-013" value={newDrone.name} onChange={(e) => setNewDrone({ ...newDrone, name: e.target.value })} data-testid="new-drone-name" /></div>
          </div>
          <DialogFooter><Button onClick={handleCreate} disabled={!newDrone.name} data-testid="create-drone-submit">Create Drone</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deploy Dialog */}
      <Dialog open={deployOpen} onOpenChange={setDeployOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deploy {selected.length} Drones</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target Zone</Label>
              <Select value={deployForm.zone_id} onValueChange={(v) => setDeployForm({ ...deployForm, zone_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                <SelectContent>{zones.filter((z) => z.id).map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mission Type</Label>
              <Select value={deployForm.mission_type} onValueChange={(v) => setDeployForm({ ...deployForm, mission_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                  <SelectItem value="soil_sampling">Soil Sampling</SelectItem>
                  <SelectItem value="reforestation">Reforestation</SelectItem>
                  <SelectItem value="wildlife_survey">Wildlife Survey</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleDeploy} disabled={!deployForm.zone_id} data-testid="deploy-submit">Deploy Drones</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
