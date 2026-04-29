import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { interventionAPI } from "../lib/api";
import { Zap, Plus, Trash2, Play, AlertTriangle } from "lucide-react";

export default function InterventionRules() {
  const [rules, setRules] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "", description: "", condition_type: "biodiversity_index", condition_operator: "lt",
    condition_value: 0.4, condition_duration_days: 7, action_type: "deploy_drones", action_config: {},
  });

  useEffect(() => {
    interventionAPI.getRules().then(res => setRules(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    try {
      await interventionAPI.createRule(form);
      const r = await interventionAPI.getRules();
      setRules(r.data || []);
      setCreateOpen(false);
    } catch {}
  };

  const handleDelete = async (id) => {
    try { await interventionAPI.deleteRule(id); setRules(prev => prev.filter(r => r.id !== id)); } catch {}
  };

  const handleCheck = async () => {
    try { const res = await interventionAPI.check(); setCheckResult(res.data); } catch {}
  };

  const operatorLabels = { lt: "less than", gt: "greater than", eq: "equals" };

  return (
    <div className="space-y-6" data-testid="intervention-rules-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">{rules.length} rules configured</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCheck}><Play className="w-4 h-4 mr-1" />Check Now</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Rule</Button>
        </div>
      </div>

      {checkResult && (
        <Card className="border-accent">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-accent" />
              <span className="font-medium text-sm">{checkResult.triggered_count} interventions triggered</span>
            </div>
            {checkResult.interventions?.map((iv, i) => (
              <div key={i} className="text-xs text-muted-foreground">• {iv.rule}: {iv.zone} (value: {iv.value?.toFixed(2)}) → {iv.action}</div>
            ))}
          </CardContent>
        </Card>
      )}

      {rules.length === 0 && !loading ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No intervention rules. Create automated triggers for ecosystem protection.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-accent" strokeWidth={1.5} />
                      <span className="font-medium text-sm">{rule.name}</span>
                      <Badge variant={rule.is_active ? "success" : "secondary"}>{rule.is_active ? "Active" : "Disabled"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <Badge variant="outline" className="text-[10px]">If {rule.condition_type} {operatorLabels[rule.condition_operator]} {rule.condition_value}</Badge>
                      <Badge variant="outline" className="text-[10px]">for {rule.condition_duration_days} days</Badge>
                      <Badge variant="info" className="text-[10px]">→ {rule.action_type}</Badge>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => handleDelete(rule.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Intervention Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Low biodiversity alert" /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deploy drones when biodiversity drops" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label>Metric</Label>
                <Select value={form.condition_type} onValueChange={(v) => setForm({ ...form, condition_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="biodiversity_index">Biodiversity</SelectItem>
                    <SelectItem value="soil_health">Soil Health</SelectItem>
                    <SelectItem value="predator_prey_balance">Predator-Prey</SelectItem>
                    <SelectItem value="vegetation_coverage">Vegetation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select value={form.condition_operator} onValueChange={(v) => setForm({ ...form, condition_operator: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lt">Less than</SelectItem>
                    <SelectItem value="gt">Greater than</SelectItem>
                    <SelectItem value="eq">Equals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Threshold</Label><Input type="number" step="0.1" min="0" max="1" value={form.condition_value} onChange={(e) => setForm({ ...form, condition_value: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deploy_drones">Deploy Drones</SelectItem>
                  <SelectItem value="alert">Create Alert</SelectItem>
                  <SelectItem value="schedule_patrol">Schedule Patrol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleCreate} disabled={!form.name}>Create Rule</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
