import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { federatedAPI } from "../lib/api";
import { formatDateTime } from "../lib/utils";
import { Brain, ChevronDown, ChevronUp, Cpu, Lock, RefreshCw, Shield, Zap } from "lucide-react";
import { LoadingState, EmptyState, ErrorState } from "../components/state";
import { toast } from "../lib/toast";

function BiomeUpdateRow({ biome, species }) {
  const entries = Object.entries(species || {});
  if (!entries.length) return null;
  return (
    <div className="border border-border rounded-sm p-2.5 space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{biome}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {entries.map(([name, weight]) => (
          <React.Fragment key={name}>
            <span className="text-xs truncate">{name}</span>
            <span className="text-xs font-mono text-right">{typeof weight === "number" ? weight.toFixed(4) : weight}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ZoneContributionRow({ zone }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(zone.species_confidence_stats || {});
  return (
    <div className="border border-border rounded-sm">
      <button
        className="w-full flex items-center justify-between p-2.5 text-sm hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="font-medium truncate">{zone.zone_name}</span>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <Badge variant="outline" className="text-[10px]">{zone.zone_type}</Badge>
          <span className="text-xs text-muted-foreground">{zone.observation_count} obs</span>
          <Badge className="text-[10px] bg-green-600/10 text-green-700 border border-green-200">
            <Lock className="w-2.5 h-2.5 mr-1" />stats only
          </Badge>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {open && entries.length > 0 && (
        <div className="border-t border-border p-2.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-muted-foreground col-span-2 mb-1">Mean confidence per species</span>
          {entries.map(([name, conf]) => (
            <React.Fragment key={name}>
              <span className="truncate">{name}</span>
              <span className="font-mono text-right">{typeof conf === "number" ? conf.toFixed(4) : conf}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function RoundCard({ round, defaultOpen = false }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const hasGlobalUpdate = Object.keys(round.global_model_update || {}).length > 0;

  return (
    <Card data-testid={`round-card-${round.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <CardTitle className="text-sm font-semibold">Round #{round.round_number}</CardTitle>
            <CardDescription className="text-[11px]">{formatDateTime(round.created_at)}</CardDescription>
          </div>
          <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
            <Badge variant="secondary" className="text-[10px]">{round.participating_zones} zones</Badge>
            <Badge variant="secondary" className="text-[10px]">{round.total_observations_used} obs</Badge>
            {round.observation_id && (
              <Badge variant="outline" className="text-[10px]" title="Round signed on-chain">
                <Shield className="w-2.5 h-2.5 mr-1" />signed
              </Badge>
            )}
            <Badge className="text-[10px] bg-blue-600/10 text-blue-700 border border-blue-200">
              <Lock className="w-2.5 h-2.5 mr-1" />no raw images
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Method: {round.aggregation_method} · Privacy: {round.privacy_guarantee}
        </div>

        {round.observation_id && (
          <div className="rounded-sm border border-primary/20 bg-primary/5 p-2 text-xs space-y-0.5">
            <p className="font-medium text-primary">On-chain observation</p>
            <p className="font-mono text-muted-foreground break-all">{round.observation_id}</p>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 -ml-1"
          onClick={() => setExpanded((p) => !p)}
          data-testid="expand-round-btn"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
          {expanded ? "Collapse" : "Expand round detail"}
        </Button>

        {expanded && (
          <div className="space-y-4">
            {/* Calibration improvements */}
            {round.calibration_improvements?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Per-zone calibration</p>
                {round.calibration_improvements.map((note, i) => (
                  <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <Zap className="mt-0.5 w-3 h-3 shrink-0 text-primary" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Zone contributions */}
            {round.zone_contributions?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Zone contributions ({round.zone_contributions.length})
                </p>
                {round.zone_contributions.map((z) => (
                  <ZoneContributionRow key={z.zone_id} zone={z} />
                ))}
              </div>
            )}

            {/* Global model update */}
            {hasGlobalUpdate && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Global model update (FedAvg result)
                </p>
                {Object.entries(round.global_model_update).map(([biome, species]) => (
                  <BiomeUpdateRow key={biome} biome={biome} species={species} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FederatedLearning() {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await federatedAPI.listRounds();
      setRounds(r.data || []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRunRound = async () => {
    setRunning(true);
    try {
      const res = await federatedAPI.runRound();
      const round = res.data;
      toast.success(`Federated round #${round.round_number} complete`, {
        description: `${round.participating_zones} zones · ${round.total_observations_used} observations aggregated · no raw images shared`,
      });
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Try again.";
      toast.error("Federated round failed", { description: msg });
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingState label="Loading federated rounds…" />;

  if (error && rounds.length === 0) {
    return (
      <ErrorState
        title="Couldn't load federated rounds"
        error={error}
        onRetry={() => { setError(null); fetchData(); }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="federated-learning-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Aggregate species ID learnings across zones without sharing raw imagery.
            Each round improves every zone's confidence model using cross-zone data.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Badge className="text-[10px] bg-green-600/10 text-green-700 border border-green-200">
              <Lock className="w-2.5 h-2.5 mr-1" />Privacy-preserving
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <Cpu className="w-2.5 h-2.5 mr-1" />FedAvg aggregation
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="w-2.5 h-2.5 mr-1" />Each round signed on-chain
            </Badge>
          </div>
        </div>
        <Button size="sm" onClick={handleRunRound} disabled={running} data-testid="run-round-btn">
          {running ? (
            <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />Aggregating…</>
          ) : (
            <><Brain className="w-4 h-4 mr-1" />Run round</>
          )}
        </Button>
      </div>

      {/* How it works banner */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {[
            { icon: Lock, title: "1. Local computation", body: "Each zone computes mean confidence per species from its own observation history. Raw images never leave the zone." },
            { icon: Cpu, title: "2. FedAvg aggregation", body: "The server merges per-zone statistics using Federated Averaging, weighted by observation count — zones with more data have proportionally more influence." },
            { icon: Zap, title: "3. Global model update", body: "Updated biome-weight priors are returned to all zones. Subsequent identifications use the improved calibration. Signed to the observation chain for auditability." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-2.5">
              <Icon className="mt-0.5 w-4 h-4 shrink-0 text-primary" />
              <div>
                <p className="font-medium mb-0.5">{title}</p>
                <p className="text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rounds list */}
      {rounds.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="No federated rounds yet"
          description="Run a round to aggregate species ID learnings across all zones using privacy-preserving FedAvg."
          action={
            <Button size="sm" onClick={handleRunRound} disabled={running}>
              <Brain className="w-4 h-4 mr-1" />Run first round
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {rounds.map((r, i) => (
            <RoundCard key={r.id} round={r} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
