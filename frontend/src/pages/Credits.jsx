import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { creditsAPI, zoneAPI } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { Leaf, Plus, ChevronDown, ChevronUp, Download, Shield, TrendingUp, TrendingDown } from "lucide-react";
import { LoadingState, EmptyState, ErrorState } from "../components/state";
import { toast } from "../lib/toast";
import { useAuth } from "../contexts/AuthContext";

const METHODOLOGIES = [
  { value: "verra_vm0033", label: "Verra VM0033 — Avoided Unplanned Deforestation" },
  { value: "gold_standard_icroa", label: "Gold Standard / ICROA — Biodiversity Restoration" },
  { value: "vcs_afolu", label: "Verra VCS AFOLU — Improved Forest Management" },
];

function TrendIcon({ trend }) {
  if (trend == null) return null;
  if (trend > 0.0001) return <TrendingUp className="w-3.5 h-3.5 text-green-600 inline ml-1" />;
  if (trend < -0.0001) return <TrendingDown className="w-3.5 h-3.5 text-red-500 inline ml-1" />;
  return null;
}

function ZoneRow({ zone }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-sm">
      <button
        className="w-full flex items-center justify-between p-3 text-sm hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((p) => !p)}
        data-testid={`zone-row-${zone.zone_id}`}
      >
        <span className="font-medium truncate">{zone.zone_name}</span>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <Badge variant="outline" className="text-[10px]">{zone.zone_type}</Badge>
          <span className="text-xs text-muted-foreground">{zone.observation_count} obs</span>
          <span className="text-xs font-semibold text-green-700">{zone.estimated_tco2e} tCO₂e</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-border p-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          <span className="text-muted-foreground">Biodiversity index</span>
          <span>
            {zone.avg_biodiversity_index != null ? zone.avg_biodiversity_index.toFixed(3) : "—"}
            <TrendIcon trend={zone.biodiversity_trend} />
          </span>
          <span className="text-muted-foreground">Soil health</span>
          <span>{zone.avg_soil_health != null ? zone.avg_soil_health.toFixed(3) : "—"}</span>
          <span className="text-muted-foreground">Vegetation coverage</span>
          <span>{zone.avg_vegetation_coverage != null ? zone.avg_vegetation_coverage.toFixed(3) : "—"}</span>
          <span className="text-muted-foreground">Attestation root</span>
          <span className="font-mono truncate">{zone.attestation_root ? zone.attestation_root.slice(0, 16) + "…" : "—"}</span>
          {Object.entries(zone.source_type_breakdown || {}).length > 0 && (
            <>
              <span className="text-muted-foreground col-span-2 mt-1">Source breakdown</span>
              {Object.entries(zone.source_type_breakdown).map(([k, v]) => (
                <React.Fragment key={k}>
                  <span className="text-muted-foreground pl-2">{k}</span>
                  <span>{v}</span>
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }) {
  const [expanded, setExpanded] = useState(false);

  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mrv-report-${report.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card data-testid={`report-card-${report.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <CardTitle className="text-sm font-semibold truncate">
              {report.project_name || `Report ${report.id.slice(0, 8)}`}
            </CardTitle>
            <CardDescription className="text-[11px]">{report.methodology_label}</CardDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={downloadReport} title="Download JSON">
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <Badge variant="secondary" className="text-[10px]">{report.total_zones} zones</Badge>
          <Badge variant="secondary" className="text-[10px]">{report.total_observations} obs</Badge>
          <Badge className="text-[10px] bg-green-600/10 text-green-700 border border-green-200">
            {report.total_estimated_tco2e} tCO₂e est.
          </Badge>
          {report.report_observation_id && (
            <Badge variant="outline" className="text-[10px]" title="Report itself is signed on-chain">
              <Shield className="w-2.5 h-2.5 mr-1" />signed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {report.period_start?.slice(0, 10)} → {report.period_end?.slice(0, 10)}
          {" · "}generated {formatDateTime(report.created_at)} by {report.generated_by}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 -ml-1"
          onClick={() => setExpanded((p) => !p)}
          data-testid="expand-zones-btn"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
          {expanded ? "Hide zones" : `Show ${report.zones?.length ?? 0} zones`}
        </Button>

        {expanded && (
          <div className="space-y-1.5">
            {(report.zones || []).map((z) => (
              <ZoneRow key={z.zone_id} zone={z} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Credits() {
  const { hasRole } = useAuth();
  const canGenerate = hasRole(["admin", "field_operator"]);

  const [reports, setReports] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    zone_ids: [],
    period_start: thirtyDaysAgo,
    period_end: today,
    methodology: "verra_vm0033",
    project_name: "",
    project_notes: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r, z] = await Promise.all([creditsAPI.list(), zoneAPI.getAll()]);
      setReports(r.data || []);
      setZones(z.data || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // period_end is exclusive on the backend; send the start of the day after
      // the selected end date so the selected day is fully included.
      const payload = {
        ...form,
        period_start: new Date(form.period_start).toISOString(),
        period_end: new Date(new Date(form.period_end).getTime() + 86400000).toISOString(),
        project_name: form.project_name || undefined,
        project_notes: form.project_notes || undefined,
      };
      const res = await creditsAPI.generate(payload);
      toast.success("MRV report generated", {
        description: `${res.data.total_estimated_tco2e} tCO₂e across ${res.data.total_zones} zones`,
      });
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Try again.";
      toast.error("Report generation failed", { description: msg });
    } finally {
      setGenerating(false);
    }
  };

  const toggleZone = (id) => {
    setForm((f) => ({
      ...f,
      zone_ids: f.zone_ids.includes(id) ? f.zone_ids.filter((z) => z !== id) : [...f.zone_ids, id],
    }));
  };

  if (loading) return <LoadingState label="Loading credit reports…" />;

  if (error && reports.length === 0) {
    return (
      <ErrorState
        title="Couldn't load credit reports"
        error={error}
        onRetry={() => { setError(null); fetchData(); }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="credits-page">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{reports.length} report{reports.length !== 1 ? "s" : ""}</p>
        {canGenerate && (
          <Button size="sm" onClick={() => setDialogOpen(true)} data-testid="generate-report-btn">
            <Plus className="w-4 h-4 mr-1" />Generate report
          </Button>
        )}
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={Leaf}
          title="No credit reports yet"
          description="Generate an MRV-compliant report to calculate carbon credit estimates from signed observations."
          action={canGenerate ? (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />Generate report
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reports.map((r) => <ReportCard key={r.id} report={r} />)}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate MRV credit report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Methodology</Label>
              <Select value={form.methodology} onValueChange={(v) => setForm({ ...form, methodology: v })}>
                <SelectTrigger data-testid="methodology-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODOLOGIES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period start</Label>
                <Input
                  type="date"
                  value={form.period_start}
                  onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                  data-testid="period-start-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Period end</Label>
                <Input
                  type="date"
                  value={form.period_end}
                  onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                  data-testid="period-end-input"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Project name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. Borneo Peatland Restoration Phase 1"
                value={form.project_name}
                onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                data-testid="project-name-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Zones{" "}
                <span className="text-muted-foreground font-normal">
                  ({form.zone_ids.length === 0 ? "all zones" : `${form.zone_ids.length} selected`})
                </span>
              </Label>
              <div className="border border-border rounded-sm p-2 max-h-36 overflow-y-auto space-y-1">
                {zones.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">No zones available</p>
                ) : (
                  zones.map((z) => (
                    <label key={z.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={form.zone_ids.includes(z.id)}
                        onChange={() => toggleZone(z.id)}
                        data-testid={`zone-checkbox-${z.id}`}
                      />
                      {z.name}
                      <Badge variant="outline" className="text-[10px] ml-auto">{z.zone_type}</Badge>
                    </label>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Leave all unchecked to include every zone.</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleGenerate}
              disabled={generating || !form.period_start || !form.period_end}
              data-testid="confirm-generate-btn"
            >
              {generating ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
