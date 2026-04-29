import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Anchor,
  ArrowRight,
  AudioWaveform,
  BarChart3,
  Binary,
  Camera,
  BadgeCheck,
  CircleDot,
  Coins,
  Crosshair,
  Database,
  Dna,
  Eye,
  Fingerprint,
  Fish,
  Gauge,
  Globe2,
  Headphones,
  Leaf,
  LifeBuoy,
  LockKeyhole,
  Mic2,
  Radar,
  ReceiptText,
  RadioTower,
  Rocket,
  Satellite,
  ShieldCheck,
  Siren,
  Sparkles,
  Sprout,
  TrendingUp,
  Trees,
  TriangleAlert,
  Upload,
  Volume2,
  WalletCards,
  Waves,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { publicAPI } from "../lib/api";
import { cn } from "../lib/utils";

const fallbackDashboard = {
  overview: {
    total_monitored_zones: 12,
    average_biodiversity_index: 74,
    average_soil_health: 68,
    ecosystem_status: "Recovering",
  },
  zone_summary: [
    { name: "Great Barrier Reef Edge", type: "reef", biodiversity: 78, status: "high" },
    { name: "Amazon Canopy North", type: "rainforest", biodiversity: 71, status: "medium" },
    { name: "Borneo Orangutan Corridor", type: "forest", biodiversity: 82, status: "high" },
    { name: "Kelp Recovery Grid 04", type: "marine", biodiversity: 64, status: "medium" },
  ],
  last_updated: new Date().toISOString(),
};

const continentSignals = [
  { label: "Amazon", x: "31%", y: "56%", tone: "emerald", delay: "0s" },
  { label: "Congo", x: "52%", y: "57%", tone: "amber", delay: "0.7s" },
  { label: "Borneo", x: "71%", y: "59%", tone: "emerald", delay: "1.2s" },
  { label: "Reef", x: "78%", y: "70%", tone: "cyan", delay: "1.9s" },
  { label: "Kelp", x: "18%", y: "70%", tone: "cyan", delay: "2.5s" },
];

const milestones = [
  { label: "Seed pods fired", value: "40K", icon: Sprout },
  { label: "DNA vault entries", value: "18.4K", icon: Database },
  { label: "Acoustic events", value: "9.8M", icon: RadioTower },
  { label: "Credits verified", value: "12.7M", icon: Binary },
];

const verdantFleet = [
  { id: "V-01", orbit: "polar", nextPass: "04:12", band: "NIR", health: 98 },
  { id: "V-04", orbit: "sun-sync", nextPass: "11:38", band: "SWIR", health: 94 },
  { id: "V-09", orbit: "reef track", nextPass: "18:05", band: "thermal", health: 91 },
];

const spectralBands = [
  { label: "chlorophyll", color: "bg-emerald-300", value: 82 },
  { label: "canopy water", color: "bg-cyan-300", value: 64 },
  { label: "soil carbon", color: "bg-amber-300", value: 58 },
  { label: "heat stress", color: "bg-red-300", value: 31 },
];

const trillionTreeRegions = [
  { region: "Amazon Arc", trees: 184200, drones: 18, pace: "+8.4K/hr", tone: "emerald" },
  { region: "Congo Canopy", trees: 127800, drones: 12, pace: "+5.9K/hr", tone: "amber" },
  { region: "Borneo Spine", trees: 96300, drones: 9, pace: "+4.1K/hr", tone: "cyan" },
  { region: "Sahel Edge", trees: 71800, drones: 7, pace: "+3.5K/hr", tone: "rose" },
];

const seedMilestones = [
  { label: "Pilot forest", target: 1000000 },
  { label: "First billion", target: 1000000000 },
  { label: "Continental scale", target: 100000000000 },
  { label: "Trillion-tree goal", target: 1000000000000 },
];

const genesisVaultEntries = [
  { species: "Reef microbiome cluster", zone: "Great Barrier Reef Edge", confidence: 94, chain: "GV-7F3A", risk: "heat tolerant" },
  { species: "Orangutan corridor flora", zone: "Borneo Orangutan Corridor", confidence: 89, chain: "GV-B19C", risk: "habitat bridge" },
  { species: "Canopy pollinator set", zone: "Amazon Canopy North", confidence: 92, chain: "GV-A02E", risk: "recovery signal" },
  { species: "Kelp holdfast sample", zone: "Kelp Recovery Grid 04", confidence: 86, chain: "GV-K44D", risk: "carbon sink" },
];

const conservationBuyers = [
  { name: "Orbital Foods", sector: "supply chain", credits: 28400, status: "released" },
  { name: "Northstar Cloud", sector: "compute offset", credits: 21800, status: "verifying" },
  { name: "Astra Materials", sector: "habitat bond", credits: 17350, status: "released" },
  { name: "Civic Rewild Fund", sector: "public grant", credits: 12900, status: "escrow" },
];

const creditAuditTrail = [
  { id: "EC-91A", label: "Verdant canopy delta matched", source: "V-04 SWIR", value: "+3,420 credits", state: "verified" },
  { id: "EC-77D", label: "Drone seed-pod count reconciled", source: "Hive Amazon-03", value: "+2,880 credits", state: "verified" },
  { id: "EC-63B", label: "Genesis species evidence attached", source: "GV-A02E", value: "+940 credits", state: "locked" },
  { id: "EC-55K", label: "Soil carbon sample pending", source: "Field lab C-12", value: "+1,260 credits", state: "pending" },
];

const acousticStreams = [
  { id: "amazon", label: "Amazon dawn", zone: "Amazon Canopy North", health: 87, risk: "pollinator surge", minutes: "03:42" },
  { id: "borneo", label: "Borneo dusk", zone: "Borneo Orangutan Corridor", health: 92, risk: "primate movement", minutes: "05:18" },
  { id: "reef", label: "Reef edge", zone: "Great Barrier Reef Edge", health: 78, risk: "boat noise", minutes: "04:04" },
];

const acousticDetections = [
  { species: "Scarlet macaw flock", band: "2.1-4.8 kHz", confidence: 94, meaning: "nesting corridor active", urgency: "observe" },
  { species: "Stingless bee cluster", band: "180-260 Hz", confidence: 88, meaning: "pollination density rising", urgency: "vault" },
  { species: "Distant chainsaw signature", band: "80-140 Hz", confidence: 71, meaning: "possible illegal clearing", urgency: "intervene" },
  { species: "Howler monkey troop", band: "0.3-1.1 kHz", confidence: 91, meaning: "canopy route occupied", urgency: "reroute" },
];

const acousticRecommendations = [
  { action: "Dispatch quiet drone pass", target: "Amazon Canopy North", eta: "06 min", tone: "cyan" },
  { action: "Anchor acoustic DNA proxy", target: "Genesis Vault", eta: "instant", tone: "emerald" },
  { action: "Flag ranger verification", target: "Mission Control", eta: "11 min", tone: "amber" },
];

const poseidonFleet = [
  { id: "P-01", name: "Coral Medic", zone: "Great Barrier Reef Edge", depth: 38, battery: 91, mission: "coral micro-frag placement", status: "restoring" },
  { id: "P-04", name: "Kelp Sower", zone: "Kelp Recovery Grid 04", depth: 22, battery: 86, mission: "kelp holdfast seeding", status: "seeding" },
  { id: "P-07", name: "Net Cutter", zone: "Reef Debris Corridor", depth: 61, battery: 74, mission: "ghost-net removal", status: "intercept" },
];

const poseidonMissions = [
  { title: "Coral nursery graft", metric: "2,840 fragments", progress: 78, icon: Fish, tone: "cyan" },
  { title: "Kelp forest seeding", metric: "14.2 ha mapped", progress: 64, icon: Sprout, tone: "emerald" },
  { title: "Ghost-net removal", metric: "8 nets tagged", progress: 52, icon: LifeBuoy, tone: "amber" },
  { title: "Heat-stress shield", metric: "31 C anomaly", progress: 69, icon: Gauge, tone: "rose" },
];

const meshNodes = [
  { node: "surface buoy A", latency: "42 ms", link: 96 },
  { node: "reef relay 03", latency: "88 ms", link: 84 },
  { node: "sub P-01", latency: "104 ms", link: 79 },
  { node: "drone overwatch", latency: "37 ms", link: 93 },
];

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(Number(value) || 0)));
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function statusVariant(status) {
  if (status === "Healthy" || status === "Recovering" || status === "high") return "success";
  if (status === "Critical" || status === "critical") return "destructive";
  return "warning";
}

function buildImpact(data) {
  const overview = data?.overview || {};
  const zones = data?.zone_summary || [];
  const zoneCount = Number(overview.total_monitored_zones || zones.length || 0);
  const biodiversity = Number(overview.average_biodiversity_index || 0);
  const soil = Number(overview.average_soil_health || 0);
  const protectedSpecies = zones.reduce((sum, zone) => sum + Math.max(3, Math.round((Number(zone.biodiversity || 0) / 100) * 42)), 0);
  return {
    trees: zoneCount * 41750 + Math.round(biodiversity * 930),
    hectares: zoneCount * 1380 + Math.round(soil * 42),
    species: protectedSpecies || 1247,
    drones: Math.max(8, zoneCount * 3 + 11),
    biodiversity: clamp(biodiversity || 72),
    soil: clamp(soil || 66),
  };
}

function ImpactCounter({ icon: Icon, label, value, suffix = "", tone = "text-primary" }) {
  return (
    <div className="border border-white/12 bg-white/[0.035] p-4 backdrop-blur" data-testid={`gaia-counter-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="mb-4 flex items-center justify-between">
        <Icon className={cn("h-4 w-4", tone)} strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">live</span>
      </div>
      <p className="font-heading text-3xl font-bold tracking-normal text-white md:text-4xl">
        {formatNumber(value)}{suffix}
      </p>
      <p className="mt-2 text-xs uppercase tracking-[0.24em] text-white/50">{label}</p>
    </div>
  );
}

function EarthHud({ zones, biodiversity }) {
  return (
    <div className="relative min-h-[520px] overflow-hidden border border-white/12 bg-[#07110b]" data-testid="gaia-earth-hud">
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: "linear-gradient(rgba(117, 255, 184, 0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(117, 255, 184, 0.1) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }} />
      <div className="absolute left-5 top-5 z-10 flex flex-wrap gap-2">
        <Badge className="border-emerald-300/30 bg-emerald-300/15 text-emerald-100">Live Earth Mission Control</Badge>
        <Badge className="border-white/15 bg-white/10 text-white">Gaia Prime</Badge>
        <Badge className="border-amber-300/30 bg-amber-300/15 text-amber-100">Index {biodiversity}%</Badge>
      </div>

      <div className="absolute inset-x-6 bottom-5 z-10 grid gap-3 md:grid-cols-3">
        {(zones || []).slice(0, 3).map((zone, index) => (
          <div key={`${zone.name}-${index}`} className="border border-white/12 bg-black/35 p-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-white">{zone.name}</p>
              <Badge variant={statusVariant(zone.status)}>{zone.status}</Badge>
            </div>
            <Progress value={Number(zone.biodiversity || 0)} className="mt-3 h-1.5 bg-white/10" indicatorClassName="bg-emerald-300" />
          </div>
        ))}
      </div>

      <div className="absolute left-1/2 top-1/2 h-[min(70vw,430px)] w-[min(70vw,430px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/25 bg-[radial-gradient(circle_at_35%_32%,rgba(159,255,202,0.95),rgba(44,125,72,0.82)_28%,rgba(8,45,34,0.9)_55%,rgba(2,11,9,1)_77%)] shadow-[0_0_80px_rgba(67,214,124,0.22)]">
        <div className="absolute inset-[8%] rounded-full border border-white/10" />
        <div className="absolute inset-[18%] rounded-full border border-white/10" />
        <div className="absolute left-[17%] top-[30%] h-[20%] w-[31%] rounded-[50%] bg-[#1e5f38]/80 blur-[1px]" />
        <div className="absolute right-[18%] top-[42%] h-[28%] w-[24%] rounded-[50%] bg-[#2d6d3e]/85 blur-[1px]" />
        <div className="absolute bottom-[19%] left-[41%] h-[17%] w-[20%] rounded-[50%] bg-[#23623b]/75 blur-[1px]" />
        <div className="absolute inset-0 rounded-full bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,0.16)_50%,transparent_51%)] opacity-60" />
        <div className="absolute inset-[-12%] animate-spin rounded-full border border-dashed border-emerald-200/30" style={{ animationDuration: "28s" }} />
        <div className="absolute inset-[-24%] animate-spin rounded-full border border-dashed border-amber-200/30" style={{ animationDuration: "44s", animationDirection: "reverse" }} />
        {continentSignals.map((signal) => (
          <div key={signal.label} className="absolute" style={{ left: signal.x, top: signal.y }}>
            <span className="absolute -left-12 -top-8 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">{signal.label}</span>
            <span className={cn(
              "block h-3 w-3 animate-ping rounded-full",
              signal.tone === "amber" ? "bg-amber-300" : signal.tone === "cyan" ? "bg-cyan-300" : "bg-emerald-300"
            )} style={{ animationDelay: signal.delay }} />
            <span className={cn(
              "absolute left-0 top-0 block h-3 w-3 rounded-full",
              signal.tone === "amber" ? "bg-amber-300" : signal.tone === "cyan" ? "bg-cyan-300" : "bg-emerald-300"
            )} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MissionTicker({ zones }) {
  const events = [
    "Verdant pass acquired hyperspectral canopy delta over Amazon North",
    "Sentinel drone swarm completed reef-edge transect with no collision alerts",
    "Bio-acoustic classifier detected pollinator recovery signal in Borneo corridor",
    "Restoration credit escrow marked provisional verification complete",
    "Genesis Vault sample chain anchored for reef microbiome observation",
  ];
  const zoneEvents = (zones || []).slice(0, 4).map((zone) => `${zone.name} biodiversity index now ${zone.biodiversity}% / ${zone.status}`);
  return (
    <div className="overflow-hidden border-y border-white/12 bg-black py-3" data-testid="gaia-mission-ticker">
      <div className="flex w-max animate-[ticker_42s_linear_infinite] gap-8 px-4">
        {[...events, ...zoneEvents, ...events].map((event, index) => (
          <span key={`${event}-${index}`} className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-emerald-100/80">
            <CircleDot className="h-3 w-3 text-amber-300" />
            {event}
          </span>
        ))}
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

function MilestoneGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="gaia-milestones">
      {milestones.map(({ label, value, icon: Icon }) => (
        <div key={label} className="border border-white/12 bg-white/[0.035] p-4">
          <Icon className="mb-5 h-4 w-4 text-amber-200" strokeWidth={1.5} />
          <p className="font-heading text-3xl font-bold text-white">{value}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.24em] text-white/45">{label}</p>
        </div>
      ))}
    </div>
  );
}

function buildVerdantDetections(zones) {
  const source = zones?.length ? zones : fallbackDashboard.zone_summary;
  return source.slice(0, 4).map((zone, index) => {
    const biodiversity = Number(zone.biodiversity || 0);
    const anomaly = biodiversity >= 78
      ? "species corridor strengthening"
      : biodiversity >= 68
        ? "canopy moisture variance"
        : "restoration stress signature";
    const severity = biodiversity >= 78 ? "observe" : biodiversity >= 68 ? "task" : "intervene";
    return {
      zone: zone.name,
      anomaly,
      severity,
      confidence: clamp(52 + biodiversity / 2 + index * 3),
      band: spectralBands[index % spectralBands.length].label,
    };
  });
}

function ConstellationVerdant({ zones }) {
  const detections = buildVerdantDetections(zones);
  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]" data-testid="constellation-verdant">
      <div className="relative min-h-[560px] overflow-hidden border border-white/12 bg-[#030806] p-5">
        <div className="absolute inset-0 opacity-25" style={{
          backgroundImage: "linear-gradient(rgba(125, 255, 198, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(125, 255, 198, 0.1) 1px, transparent 1px)",
          backgroundSize: "38px 38px",
        }} />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">Constellation Verdant</Badge>
            <h2 className="mt-4 max-w-2xl font-heading text-4xl font-black leading-tight text-white md:text-5xl">
              Orbital conservation grid online.
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {verdantFleet.map((sat) => (
              <div key={sat.id} className="border border-white/12 bg-black/35 p-3 text-right backdrop-blur">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">{sat.id}</p>
                <p className="mt-1 font-heading text-2xl font-bold text-white">{sat.nextPass}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute left-1/2 top-[58%] h-[min(74vw,430px)] w-[min(74vw,430px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/20 bg-[radial-gradient(circle_at_38%_30%,rgba(105,235,194,0.85),rgba(22,94,72,0.78)_32%,rgba(5,31,31,0.96)_68%,rgba(1,5,6,1)_82%)] shadow-[0_0_80px_rgba(34,211,238,0.16)]">
          <div className="absolute inset-[-15%] animate-spin rounded-full border border-dashed border-cyan-200/35" style={{ animationDuration: "22s" }} />
          <div className="absolute inset-[-31%] animate-spin rounded-full border border-dashed border-emerald-200/25" style={{ animationDuration: "36s", animationDirection: "reverse" }} />
          <div className="absolute left-1/2 top-1/2 h-[132%] w-2 -translate-x-1/2 -translate-y-1/2 rotate-[63deg] bg-gradient-to-b from-transparent via-cyan-200/40 to-transparent blur-[1px]" />
          <div className="absolute left-1/2 top-1/2 h-[132%] w-2 -translate-x-1/2 -translate-y-1/2 -rotate-[33deg] bg-gradient-to-b from-transparent via-emerald-200/35 to-transparent blur-[1px]" />
          <div className="absolute left-[18%] top-[35%] h-[22%] w-[34%] rounded-[50%] bg-[#2c7b50]/70" />
          <div className="absolute right-[20%] top-[54%] h-[19%] w-[25%] rounded-[50%] bg-[#195f61]/75" />

          {verdantFleet.map((sat, index) => (
            <div
              key={sat.id}
              className="absolute left-1/2 top-1/2 h-[132%] w-[132%] -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full"
              style={{ animationDuration: `${18 + index * 8}s`, animationDelay: `${index * -3}s` }}
            >
              <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center">
                <Satellite className="h-5 w-5 text-cyan-200 drop-shadow-[0_0_12px_rgba(103,232,249,0.9)]" strokeWidth={1.5} />
                <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-100">{sat.id}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="absolute bottom-5 left-5 right-5 z-10 grid gap-3 md:grid-cols-4">
          {spectralBands.map((band) => (
            <div key={band.label} className="border border-white/12 bg-black/35 p-3 backdrop-blur">
              <div className="mb-2 flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5", band.color)} />
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">{band.label}</p>
              </div>
              <Progress value={band.value} className="h-1.5 bg-white/10" indicatorClassName={band.color} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="border border-white/12 bg-white/[0.035] p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Eye className="h-4 w-4 text-cyan-200" strokeWidth={1.5} />
              Hyperspectral Detections
            </span>
            <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">90 min sweep</Badge>
          </div>
          <div className="space-y-3">
            {detections.map((detection) => (
              <Link
                key={`${detection.zone}-${detection.anomaly}`}
                to="/mission-control"
                className="block border border-white/12 bg-black/25 p-3 transition-colors hover:border-cyan-200/50 hover:bg-cyan-200/10"
                data-testid={`verdant-detection-${detection.zone.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{detection.zone}</p>
                    <p className="mt-1 text-xs text-white/55">{detection.anomaly}</p>
                  </div>
                  <Badge variant={detection.severity === "intervene" ? "destructive" : detection.severity === "task" ? "warning" : "success"}>
                    {detection.severity}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
                  <Progress value={detection.confidence} className="h-1.5 bg-white/10" indicatorClassName="bg-cyan-300" />
                  <span className="font-mono text-xs text-cyan-100">{Math.round(detection.confidence)}%</span>
                </div>
                <p className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                  <Camera className="h-3.5 w-3.5" /> {detection.band} band
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          {verdantFleet.map((sat) => (
            <div key={sat.id} className="border border-white/12 bg-white/[0.035] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-heading text-lg font-bold text-white">{sat.id}</p>
                <TriangleAlert className="h-4 w-4 text-amber-200" strokeWidth={1.5} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-white/45">Orbit</span>
                <span className="col-span-2 text-right text-white">{sat.orbit}</span>
                <span className="text-white/45">Band</span>
                <span className="col-span-2 text-right text-white">{sat.band}</span>
                <span className="text-white/45">Health</span>
                <span className="col-span-2 text-right text-white">{sat.health}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrillionTreeCounter({ impact }) {
  const target = 1000000000000;
  const projectedYearTen = Math.max(impact.trees * 525, impact.hectares * 12000);
  const todayProgress = clamp((impact.trees / target) * 100, 0.01, 1.8);
  const decadeProgress = clamp((projectedYearTen / target) * 100, 0.2, 18);
  const nextMilestone = seedMilestones.find((milestone) => impact.trees < milestone.target) || seedMilestones[seedMilestones.length - 1];
  const launchReadiness = clamp(impact.biodiversity * 0.46 + impact.soil * 0.34 + impact.drones * 0.5, 42, 99);

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]" data-testid="trillion-tree-counter">
      <div className="relative overflow-hidden border border-white/12 bg-[#06100a] p-5 md:p-6">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "linear-gradient(120deg, rgba(132, 255, 193, 0.14) 1px, transparent 1px), linear-gradient(rgba(255, 214, 102, 0.1) 1px, transparent 1px)",
          backgroundSize: "54px 54px, 24px 24px",
        }} />
        <div className="relative z-10">
          <Badge className="border-emerald-300/30 bg-emerald-300/15 text-emerald-100">Trillion-Tree Cannon</Badge>
          <h2 className="mt-4 max-w-3xl font-heading text-4xl font-black leading-tight text-white md:text-5xl">
            Restoration counter with launch-tempo accountability.
          </h2>
          <div className="mt-7 border-y border-white/12 py-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/45">trees planted verified</p>
            <p className="mt-2 font-heading text-5xl font-black leading-none text-white md:text-7xl">{formatNumber(impact.trees)}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">seed pods/day</p>
                <p className="mt-1 font-heading text-2xl font-bold text-emerald-100">{formatNumber(impact.drones * 40000)}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">launch readiness</p>
                <p className="mt-1 font-heading text-2xl font-bold text-amber-100">{Math.round(launchReadiness)}%</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">next gate</p>
                <p className="mt-1 truncate font-heading text-2xl font-bold text-cyan-100">{nextMilestone.label}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div>
              <div className="mb-2 flex justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                <span>today against 1T</span>
                <span>{todayProgress.toFixed(2)}%</span>
              </div>
              <Progress value={todayProgress} className="h-2 bg-white/10" indicatorClassName="bg-emerald-300" />
            </div>
            <div>
              <div className="mb-2 flex justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                <span>10-year run-rate</span>
                <span>{decadeProgress.toFixed(1)}%</span>
              </div>
              <Progress value={decadeProgress} className="h-2 bg-white/10" indicatorClassName="bg-amber-300" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="relative min-h-[280px] overflow-hidden border border-white/12 bg-black p-5" data-testid="seed-cannon-trajectory">
          <div className="absolute inset-0 opacity-25" style={{
            backgroundImage: "radial-gradient(circle at 20% 80%, rgba(74, 222, 128, 0.2), transparent 28%), radial-gradient(circle at 78% 18%, rgba(34, 211, 238, 0.2), transparent 26%)",
          }} />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-100/55">ballistic seed dispersal</p>
              <p className="mt-2 font-heading text-2xl font-bold text-white">Drone-to-canopy planting arcs</p>
            </div>
            <Sparkles className="h-5 w-5 text-amber-200" strokeWidth={1.5} />
          </div>
          <div className="absolute bottom-10 left-6 right-6 h-px bg-emerald-200/25" />
          {[0, 1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="absolute bottom-10 h-2.5 w-2.5 rounded-full bg-amber-200 shadow-[0_0_18px_rgba(253,230,138,0.85)]"
              style={{
                left: `${12 + item * 16}%`,
                animation: `seedArc 3.8s ${item * 0.38}s ease-in-out infinite`,
              }}
            />
          ))}
          <div className="absolute bottom-10 left-[8%] h-16 w-16 border border-emerald-200/25 bg-emerald-300/10">
            <Rocket className="m-5 h-6 w-6 rotate-45 text-emerald-100" strokeWidth={1.5} />
          </div>
          <div className="absolute bottom-10 right-[8%] grid grid-cols-5 gap-1.5">
            {Array.from({ length: 20 }).map((_, index) => (
              <span key={index} className="h-3 w-3 bg-emerald-300/40" />
            ))}
          </div>
          <style>{`@keyframes seedArc { 0% { transform: translate3d(0, 0, 0); opacity: 0; } 15% { opacity: 1; } 50% { transform: translate3d(120px, -150px, 0); } 100% { transform: translate3d(260px, 0, 0); opacity: 0; } }`}</style>
        </div>

        <div className="grid gap-3 sm:grid-cols-2" data-testid="tree-region-leaderboard">
          {trillionTreeRegions.map((region) => (
            <div key={region.region} className="border border-white/12 bg-white/[0.035] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-heading text-lg font-bold text-white">{region.region}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">{region.drones} drone hives</p>
                </div>
                <Badge className={cn(
                  "border-white/15 bg-white/10",
                  region.tone === "amber" ? "text-amber-100" : region.tone === "cyan" ? "text-cyan-100" : region.tone === "rose" ? "text-rose-100" : "text-emerald-100"
                )}>{region.pace}</Badge>
              </div>
              <p className="mt-5 font-heading text-3xl font-black text-white">{formatNumber(region.trees)}</p>
              <Progress value={clamp((region.trees / 200000) * 100)} className="mt-3 h-1.5 bg-white/10" indicatorClassName={region.tone === "amber" ? "bg-amber-300" : region.tone === "cyan" ? "bg-cyan-300" : region.tone === "rose" ? "bg-rose-300" : "bg-emerald-300"} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GenesisVault({ zones }) {
  const totalConfidence = genesisVaultEntries.reduce((sum, entry) => sum + entry.confidence, 0);
  const averageConfidence = Math.round(totalConfidence / genesisVaultEntries.length);
  const anchoredEntries = Math.max(18400, (zones?.length || 4) * 4600);

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]" data-testid="genesis-vault">
      <div className="border border-white/12 bg-white/[0.035] p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">Genesis Vault</Badge>
          <LockKeyhole className="h-5 w-5 text-cyan-100" strokeWidth={1.5} />
        </div>
        <h2 className="mt-4 font-heading text-4xl font-black leading-tight text-white md:text-5xl">
          Every species event becomes continuity infrastructure.
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="border border-white/12 bg-black/25 p-4">
            <Dna className="mb-4 h-4 w-4 text-cyan-200" strokeWidth={1.5} />
            <p className="font-heading text-3xl font-bold text-white">{formatNumber(anchoredEntries)}</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">vault entries</p>
          </div>
          <div className="border border-white/12 bg-black/25 p-4">
            <Fingerprint className="mb-4 h-4 w-4 text-emerald-200" strokeWidth={1.5} />
            <p className="font-heading text-3xl font-bold text-white">{averageConfidence}%</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">identity confidence</p>
          </div>
          <div className="border border-white/12 bg-black/25 p-4">
            <TrendingUp className="mb-4 h-4 w-4 text-amber-200" strokeWidth={1.5} />
            <p className="font-heading text-3xl font-bold text-white">+{formatNumber(zones.length * 72)}</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">daily anchors</p>
          </div>
        </div>
      </div>

      <div className="border border-white/12 bg-[#030806] p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-heading text-2xl font-bold text-white">DNA continuity ledger</p>
            <p className="mt-1 text-sm text-white/50">Species records derived from mission observations and zone telemetry.</p>
          </div>
          <Badge className="border-emerald-300/30 bg-emerald-300/15 text-emerald-100">auditable chain</Badge>
        </div>
        <div className="grid gap-3" data-testid="genesis-vault-ledger">
          {genesisVaultEntries.map((entry) => (
            <div key={entry.chain} className="grid gap-4 border border-white/12 bg-white/[0.035] p-4 md:grid-cols-[minmax(0,1fr)_150px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-heading text-lg font-bold text-white">{entry.species}</p>
                  <Badge className="border-white/15 bg-white/10 text-white">{entry.chain}</Badge>
                </div>
                <p className="mt-1 text-sm text-white/50">{entry.zone}</p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100/70">{entry.risk}</p>
              </div>
              <div>
                <div className="mb-2 flex justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                  <span>match</span>
                  <span>{entry.confidence}%</span>
                </div>
                <Progress value={entry.confidence} className="h-2 bg-white/10" indicatorClassName="bg-cyan-300" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EcoCoinDashboard({ impact, zones }) {
  const issuedCredits = Math.max(12700000, impact.hectares * 740 + impact.species * 480);
  const escrowCredits = Math.round(issuedCredits * 0.18);
  const releasedCredits = issuedCredits - escrowCredits;
  const treasuryValue = issuedCredits * 0.84;
  const verificationScore = clamp((impact.biodiversity * 0.42) + (impact.soil * 0.35) + (zones.length * 3.8), 54, 98);
  const demandRatio = clamp(68 + zones.length * 4 + impact.biodiversity * 0.12, 72, 99);

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]" data-testid="ecocoin-dashboard">
      <div className="relative overflow-hidden border border-white/12 bg-[#080704] p-5 md:p-6">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "linear-gradient(90deg, rgba(251, 191, 36, 0.12) 1px, transparent 1px), linear-gradient(rgba(45, 212, 191, 0.1) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }} />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <Badge className="border-amber-300/30 bg-amber-300/15 text-amber-100">EcoCoin Credit Engine</Badge>
            <h2 className="mt-4 font-heading text-4xl font-black leading-tight text-white md:text-5xl">
              Restoration turns into auditable conservation markets.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
              Credits stay locked until drone, satellite, biodiversity, and soil evidence agree. Payouts release only when the mission graph proves restoration.
            </p>
          </div>
          <Link to="/mission-control" data-testid="ecocoin-open-mission-control">
            <Button className="bg-amber-300 text-amber-950 hover:bg-amber-200">
              Audit Flow <ReceiptText className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="relative z-10 mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ecocoin-credit-metrics">
          {[
            { label: "credits issued", value: formatNumber(issuedCredits), icon: Coins, tone: "text-amber-200" },
            { label: "escrow locked", value: formatNumber(escrowCredits), icon: LockKeyhole, tone: "text-cyan-200" },
            { label: "payout released", value: formatNumber(releasedCredits), icon: WalletCards, tone: "text-emerald-200" },
            { label: "treasury value", value: `$${formatNumber(treasuryValue)}`, icon: TrendingUp, tone: "text-rose-200" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="border border-white/12 bg-black/25 p-4 backdrop-blur">
              <Icon className={cn("mb-5 h-4 w-4", tone)} strokeWidth={1.5} />
              <p className="font-heading text-2xl font-black text-white md:text-3xl">{value}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</p>
            </div>
          ))}
        </div>

        <div className="relative z-10 mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="border border-white/12 bg-black/25 p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="font-heading text-xl font-bold text-white">Verification pipeline</p>
              <Badge className="border-emerald-300/30 bg-emerald-300/15 text-emerald-100">{Math.round(verificationScore)}%</Badge>
            </div>
            <div className="space-y-4">
              {[
                { label: "satellite evidence", value: 91, color: "bg-cyan-300" },
                { label: "drone proof", value: 86, color: "bg-emerald-300" },
                { label: "biodiversity gain", value: impact.biodiversity, color: "bg-amber-300" },
                { label: "soil permanence", value: impact.soil, color: "bg-rose-300" },
              ].map((stage) => (
                <div key={stage.label}>
                  <div className="mb-2 flex justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                    <span>{stage.label}</span>
                    <span>{Math.round(stage.value)}%</span>
                  </div>
                  <Progress value={stage.value} className="h-1.5 bg-white/10" indicatorClassName={stage.color} />
                </div>
              ))}
            </div>
          </div>

          <div className="border border-white/12 bg-black/25 p-5" data-testid="ecocoin-audit-trail">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="font-heading text-xl font-bold text-white">Evidence-to-credit audit trail</p>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">live ledger</span>
            </div>
            <div className="space-y-3">
              {creditAuditTrail.map((event) => (
                <div key={event.id} className="grid gap-3 border border-white/12 bg-white/[0.035] p-3 sm:grid-cols-[74px_minmax(0,1fr)_110px]">
                  <span className="font-mono text-xs text-amber-100">{event.id}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{event.label}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{event.source}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-mono text-xs text-white">{event.value}</p>
                    <Badge className={cn(
                      "mt-2 border-white/15 bg-white/10",
                      event.state === "verified" ? "text-emerald-100" : event.state === "locked" ? "text-cyan-100" : "text-amber-100"
                    )}>{event.state}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="relative min-h-[330px] overflow-hidden border border-white/12 bg-[#030806] p-5" data-testid="ecocoin-market-depth">
          <div className="absolute inset-0 opacity-25" style={{
            backgroundImage: "radial-gradient(circle at 50% 52%, rgba(251, 191, 36, 0.28), transparent 33%), radial-gradient(circle at 18% 22%, rgba(52, 211, 153, 0.18), transparent 24%)",
          }} />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">market depth</p>
              <p className="mt-2 font-heading text-2xl font-bold text-white">Demand coverage {Math.round(demandRatio)}%</p>
            </div>
            <BadgeCheck className="h-5 w-5 text-amber-200" strokeWidth={1.5} />
          </div>
          <div className="absolute left-1/2 top-[58%] h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/25 bg-amber-300/10 shadow-[0_0_60px_rgba(251,191,36,0.14)]">
            <div className="absolute inset-8 rounded-full border border-cyan-200/25" />
            <div className="absolute inset-16 rounded-full border border-emerald-200/25" />
            <div className="absolute left-1/2 top-1/2 h-[145%] w-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-gradient-to-b from-transparent via-amber-200/70 to-transparent" />
            <div className="absolute left-1/2 top-1/2 h-[145%] w-px -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-gradient-to-b from-transparent via-cyan-200/60 to-transparent" />
            <Coins className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-amber-100" strokeWidth={1.5} />
          </div>
          <div className="absolute bottom-5 left-5 right-5 z-10 grid grid-cols-3 gap-2">
            {["buyers", "escrow", "oracle"].map((label, index) => (
              <div key={label} className="border border-white/12 bg-black/35 p-3 text-center backdrop-blur">
                <p className="font-heading text-xl font-bold text-white">{[42, 18, 7][index]}</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/12 bg-white/[0.035] p-5" data-testid="ecocoin-buyer-leaderboard">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-heading text-xl font-bold text-white">Credit buyers</p>
            <Badge className="border-amber-300/30 bg-amber-300/15 text-amber-100">DAO queue</Badge>
          </div>
          <div className="space-y-3">
            {conservationBuyers.map((buyer) => (
              <div key={buyer.name} className="border border-white/12 bg-black/25 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{buyer.name}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{buyer.sector}</p>
                  </div>
                  <Badge className={cn(
                    "border-white/15 bg-white/10",
                    buyer.status === "released" ? "text-emerald-100" : buyer.status === "verifying" ? "text-cyan-100" : "text-amber-100"
                  )}>{buyer.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
                  <Progress value={clamp((buyer.credits / 30000) * 100)} className="h-1.5 bg-white/10" indicatorClassName="bg-amber-300" />
                  <span className="font-mono text-xs text-white">{formatNumber(buyer.credits)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BioAcousticAI({ zones }) {
  const [activeStream, setActiveStream] = useState(acousticStreams[0].id);
  const [uploadedFile, setUploadedFile] = useState("");
  const stream = acousticStreams.find((item) => item.id === activeStream) || acousticStreams[0];
  const signalScore = clamp(stream.health + zones.length * 1.5, 62, 98);

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 xl:grid-cols-[minmax(360px,0.92fr)_minmax(0,1.08fr)]" data-testid="bio-acoustic-ai">
      <div className="relative overflow-hidden border border-white/12 bg-[#03070a] p-5 md:p-6">
        <div className="absolute inset-0 opacity-25" style={{
          backgroundImage: "linear-gradient(90deg, rgba(34, 211, 238, 0.12) 1px, transparent 1px), linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }} />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">Bio-Acoustic AI</Badge>
            <h2 className="mt-4 font-heading text-4xl font-black leading-tight text-white md:text-5xl">
              Translate the forest into mission signals.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
              Audio streams become species evidence, distress alerts, and action recommendations for the autonomous restoration stack.
            </p>
          </div>
          <Headphones className="h-6 w-6 text-cyan-100" strokeWidth={1.5} />
        </div>

        <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-3" data-testid="acoustic-stream-selector">
          {acousticStreams.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveStream(item.id)}
              className={cn(
                "border p-3 text-left transition-colors",
                activeStream === item.id ? "border-cyan-200/50 bg-cyan-200/12" : "border-white/12 bg-black/25 hover:border-cyan-200/35 hover:bg-cyan-200/8"
              )}
              data-testid={`acoustic-stream-${item.id}`}
            >
              <p className="font-heading text-lg font-bold text-white">{item.label}</p>
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{item.zone}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-cyan-100">{item.minutes}</span>
                <Badge className="border-white/15 bg-white/10 text-white">{item.health}%</Badge>
              </div>
            </button>
          ))}
        </div>

        <div className="relative z-10 mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative min-h-[300px] overflow-hidden border border-white/12 bg-black/35 p-5" data-testid="acoustic-waveform">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading text-2xl font-bold text-white">{stream.label}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">{stream.risk}</p>
              </div>
              <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">EcoNet decode</Badge>
            </div>
            <div className="absolute inset-x-5 top-[48%] h-px bg-cyan-200/20" />
            <div className="grid h-44 grid-cols-[repeat(48,minmax(0,1fr))] items-end gap-1">
              {Array.from({ length: 48 }).map((_, index) => {
                const height = 20 + ((index * 17 + stream.health) % 74);
                const color = index % 7 === 0 ? "bg-amber-300" : index % 5 === 0 ? "bg-emerald-300" : "bg-cyan-300";
                return (
                  <span
                    key={index}
                    className={cn("w-full opacity-80 shadow-[0_0_14px_rgba(103,232,249,0.2)]", color)}
                    style={{
                      height: `${height}%`,
                      animation: `audioPulse 1.8s ${index * 0.035}s ease-in-out infinite`,
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: "signal health", value: `${Math.round(signalScore)}%` },
                { label: "sample rate", value: "96 kHz" },
                { label: "noise floor", value: "-48 dB" },
              ].map((metric) => (
                <div key={metric.label} className="border border-white/12 bg-white/[0.035] p-3">
                  <p className="font-heading text-xl font-bold text-white">{metric.value}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">{metric.label}</p>
                </div>
              ))}
            </div>
            <style>{`@keyframes audioPulse { 0%, 100% { transform: scaleY(0.78); opacity: 0.58; } 50% { transform: scaleY(1); opacity: 1; } }`}</style>
          </div>

          <div className="grid content-start gap-3">
            <label
              className="flex cursor-pointer flex-col items-center justify-center border border-dashed border-cyan-200/35 bg-cyan-200/10 p-5 text-center transition-colors hover:bg-cyan-200/15"
              data-testid="acoustic-upload-label"
            >
              <Upload className="mb-3 h-5 w-5 text-cyan-100" strokeWidth={1.5} />
              <span className="font-heading text-lg font-bold text-white">Upload audio</span>
              <span className="mt-1 text-xs text-white/45">{uploadedFile || "WAV / MP3 sample"}</span>
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={(event) => setUploadedFile(event.target.files?.[0]?.name || "")}
                data-testid="acoustic-upload-input"
              />
            </label>
            <Link to="/mission-control" data-testid="acoustic-open-mission-control">
              <Button className="w-full bg-cyan-300 text-cyan-950 hover:bg-cyan-200">
                Generate Task <Mic2 className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/public" data-testid="acoustic-open-public-feed">
              <Button variant="outline" className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10">
                Live Feed <Volume2 className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="border border-white/12 bg-white/[0.035] p-5" data-testid="acoustic-detections">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-heading text-xl font-bold text-white">Detected signals</p>
            <AudioWaveform className="h-5 w-5 text-cyan-100" strokeWidth={1.5} />
          </div>
          <div className="space-y-3">
            {acousticDetections.map((detection) => (
              <div key={detection.species} className="border border-white/12 bg-black/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-heading text-lg font-bold text-white">{detection.species}</p>
                    <p className="mt-1 text-sm text-white/52">{detection.meaning}</p>
                  </div>
                  <Badge variant={detection.urgency === "intervene" ? "destructive" : detection.urgency === "reroute" ? "warning" : "success"}>
                    {detection.urgency}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                  <div>
                    <div className="mb-2 flex justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                      <span>{detection.band}</span>
                      <span>{detection.confidence}%</span>
                    </div>
                    <Progress value={detection.confidence} className="h-1.5 bg-white/10" indicatorClassName={detection.urgency === "intervene" ? "bg-red-300" : "bg-cyan-300"} />
                  </div>
                  <span className="font-mono text-xs text-cyan-100 sm:text-right">AI match</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/12 bg-[#080704] p-5" data-testid="acoustic-recommendations">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-heading text-xl font-bold text-white">Recommended actions</p>
            <Siren className="h-5 w-5 text-amber-200" strokeWidth={1.5} />
          </div>
          <div className="grid gap-3">
            {acousticRecommendations.map((item) => (
              <div key={item.action} className="grid grid-cols-[1fr_auto] gap-3 border border-white/12 bg-black/25 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{item.action}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{item.target}</p>
                </div>
                <Badge className={cn(
                  "border-white/15 bg-white/10",
                  item.tone === "amber" ? "text-amber-100" : item.tone === "emerald" ? "text-emerald-100" : "text-cyan-100"
                )}>{item.eta}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProjectPoseidon({ impact }) {
  const [activeSub, setActiveSub] = useState(poseidonFleet[0].id);
  const vessel = poseidonFleet.find((item) => item.id === activeSub) || poseidonFleet[0];
  const reefStability = clamp(impact.biodiversity * 0.5 + impact.soil * 0.2 + vessel.battery * 0.25, 48, 98);

  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]" data-testid="project-poseidon">
      <div className="relative min-h-[680px] overflow-hidden border border-white/12 bg-[#02080b] p-5 md:p-6">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "linear-gradient(rgba(34, 211, 238, 0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 184, 166, 0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[linear-gradient(to_bottom,transparent,rgba(8,145,178,0.18)_22%,rgba(6,78,59,0.16)_60%,rgba(2,6,23,0.88))]" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <Badge className="border-cyan-300/30 bg-cyan-300/15 text-cyan-100">Project Poseidon</Badge>
            <h2 className="mt-4 font-heading text-4xl font-black leading-tight text-white md:text-5xl">
              Autonomous ocean restoration fleet online.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
              Underwater vehicles seed kelp, repair reefs, remove ghost nets, and relay aquatic telemetry through acoustic mesh nodes.
            </p>
          </div>
          <Link to="/mission-control" data-testid="poseidon-open-mission-control">
            <Button className="bg-cyan-300 text-cyan-950 hover:bg-cyan-200">
              Launch Dive <Anchor className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-3" data-testid="poseidon-fleet-selector">
          {poseidonFleet.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setActiveSub(sub.id)}
              className={cn(
                "border p-3 text-left transition-colors",
                activeSub === sub.id ? "border-cyan-200/50 bg-cyan-200/12" : "border-white/12 bg-black/25 hover:border-cyan-200/35 hover:bg-cyan-200/8"
              )}
              data-testid={`poseidon-sub-${sub.id.toLowerCase()}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-heading text-lg font-bold text-white">{sub.name}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{sub.id} / {sub.zone}</p>
                </div>
                <Badge className="border-white/15 bg-white/10 text-cyan-100">{sub.status}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="text-white/45">Depth</span>
                <span className="text-right text-white">{sub.depth}m</span>
                <span className="text-white/45">Battery</span>
                <span className="text-right text-white">{sub.battery}%</span>
              </div>
            </button>
          ))}
        </div>

        <div className="relative z-10 mt-5 min-h-[360px] overflow-hidden border border-white/12 bg-black/30 p-5" data-testid="poseidon-ocean-transect">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-heading text-2xl font-bold text-white">{vessel.name}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-100/60">{vessel.mission}</p>
            </div>
            <Badge className="border-emerald-300/30 bg-emerald-300/15 text-emerald-100">reef stability {Math.round(reefStability)}%</Badge>
          </div>

          <div className="absolute left-6 right-6 top-[44%] h-px bg-cyan-200/25" />
          <div className="absolute left-8 right-8 top-[58%] h-px bg-emerald-200/20" />
          <div className="absolute bottom-8 left-5 right-5 h-16 bg-[linear-gradient(135deg,rgba(52,211,153,0.2)_25%,transparent_25%,transparent_50%,rgba(52,211,153,0.2)_50%,rgba(52,211,153,0.2)_75%,transparent_75%)] bg-[length:22px_22px] opacity-80" />

          <div className="absolute left-[12%] top-[42%] h-10 w-24 rounded-full border border-cyan-200/40 bg-cyan-300/15 shadow-[0_0_35px_rgba(34,211,238,0.18)]">
            <div className="absolute -right-5 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[11px] border-l-[22px] border-y-transparent border-l-cyan-200/50" />
            <Radar className="absolute left-4 top-2.5 h-5 w-5 text-cyan-100" strokeWidth={1.5} />
          </div>
          <div className="absolute left-[32%] top-[54%] h-7 w-7 rounded-full border border-amber-200/40 bg-amber-300/20 shadow-[0_0_20px_rgba(251,191,36,0.22)]" />
          <div className="absolute left-[58%] top-[36%] h-3 w-3 animate-ping rounded-full bg-cyan-300" />
          <div className="absolute left-[58%] top-[36%] h-3 w-3 rounded-full bg-cyan-200" />
          <div className="absolute right-[14%] top-[52%] h-12 w-12 border border-rose-200/40 bg-rose-300/10">
            <LifeBuoy className="m-3 h-6 w-6 text-rose-100" strokeWidth={1.5} />
          </div>

          <div className="absolute bottom-5 left-5 right-5 grid gap-3 md:grid-cols-4">
            {[
              { label: "water temp", value: "27.8 C" },
              { label: "coral cover", value: "68%" },
              { label: "kelp density", value: "+14%" },
              { label: "debris risk", value: "low" },
            ].map((metric) => (
              <div key={metric.label} className="border border-white/12 bg-black/40 p-3 backdrop-blur">
                <p className="font-heading text-xl font-bold text-white">{metric.value}</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1" data-testid="poseidon-missions">
          {poseidonMissions.map(({ title, metric, progress, icon: Icon, tone }) => (
            <div key={title} className="border border-white/12 bg-white/[0.035] p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-heading text-lg font-bold text-white">{title}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{metric}</p>
                </div>
                <Icon className={cn(
                  "h-5 w-5",
                  tone === "amber" ? "text-amber-200" : tone === "emerald" ? "text-emerald-200" : tone === "rose" ? "text-rose-200" : "text-cyan-200"
                )} strokeWidth={1.5} />
              </div>
              <Progress
                value={progress}
                className="h-1.5 bg-white/10"
                indicatorClassName={tone === "amber" ? "bg-amber-300" : tone === "emerald" ? "bg-emerald-300" : tone === "rose" ? "bg-rose-300" : "bg-cyan-300"}
              />
            </div>
          ))}
        </div>

        <div className="border border-white/12 bg-[#030806] p-5" data-testid="poseidon-mesh">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-heading text-xl font-bold text-white">Acoustic mesh comms</p>
            <RadioTower className="h-5 w-5 text-cyan-100" strokeWidth={1.5} />
          </div>
          <div className="space-y-3">
            {meshNodes.map((node) => (
              <div key={node.node} className="border border-white/12 bg-black/25 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-white">{node.node}</p>
                  <span className="font-mono text-xs text-cyan-100">{node.latency}</span>
                </div>
                <Progress value={node.link} className="h-1.5 bg-white/10" indicatorClassName="bg-cyan-300" />
              </div>
            ))}
          </div>
        </div>

        <div className="border border-white/12 bg-white/[0.035] p-5" data-testid="poseidon-summary">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-heading text-xl font-bold text-white">Ocean impact</p>
            <Waves className="h-5 w-5 text-cyan-100" strokeWidth={1.5} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "subs", value: poseidonFleet.length },
              { label: "reef ha", value: Math.round(impact.hectares * 0.18) },
              { label: "alerts", value: 7 },
            ].map((item) => (
              <div key={item.label} className="border border-white/12 bg-black/25 p-3">
                <p className="font-heading text-2xl font-bold text-white">{formatNumber(item.value)}</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/45">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PublicDashboard() {
  const [data, setData] = useState(fallbackDashboard);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    publicAPI.getDashboard()
      .then((res) => {
        if (!cancelled && res.data) {
          setData({ ...fallbackDashboard, ...res.data });
          setUsingFallback(false);
        }
      })
      .catch(() => {
        if (!cancelled) setUsingFallback(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const impact = useMemo(() => buildImpact(data), [data]);
  const zones = data.zone_summary?.length ? data.zone_summary : fallbackDashboard.zone_summary;
  const status = data.overview?.ecosystem_status || "Recovering";

  return (
    <div className="min-h-screen bg-[#020403] text-white" data-testid="public-dashboard">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link to="/public" className="flex items-center gap-3" data-testid="gaia-home-link">
            <div className="flex h-10 w-10 items-center justify-center border border-emerald-200/35 bg-emerald-300/10">
              <Leaf className="h-5 w-5 text-emerald-200" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-heading text-lg font-bold tracking-normal">Gaia Prime</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-100/50">Live Earth Mission Control</p>
            </div>
          </Link>
          <div className="hidden items-center gap-6 font-mono text-[10px] uppercase tracking-[0.28em] text-white/45 md:flex">
            <span>Planetary Twin</span>
            <span>Verdant Grid</span>
            <span>EcoNet</span>
          </div>
          <Link to="/login" data-testid="gaia-sign-in-link">
            <Button variant="outline" size="sm" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
              Sign In <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border border-white/12 bg-white/[0.035] p-5 md:p-8">
            <div className="mb-6 flex flex-wrap gap-2">
              <Badge className="border-emerald-300/30 bg-emerald-300/15 text-emerald-100">Project Gaia Prime</Badge>
              <Badge className="border-white/15 bg-white/10 text-white">{status}</Badge>
              {usingFallback && <Badge className="border-amber-300/30 bg-amber-300/15 text-amber-100">demo telemetry</Badge>}
            </div>
            <h1 className="max-w-5xl font-heading text-5xl font-black leading-[0.95] tracking-normal text-white md:text-7xl">
              Make planetary restoration feel as live as a launch.
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-white/65">
              A public command surface for global rewilding: active drones, monitored zones, biodiversity recovery, and verifiable restoration milestones in one real-time mission feed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/mission-control" data-testid="gaia-enter-command-link">
                <Button className="w-full bg-emerald-300 text-emerald-950 hover:bg-emerald-200 sm:w-auto">
                  Enter Command <Rocket className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/public" data-testid="gaia-watch-live-link">
                <Button variant="outline" className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 sm:w-auto">
                  Watch Live <Activity className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-3">
            <ImpactCounter icon={Trees} label="Trees planted" value={impact.trees} tone="text-emerald-200" />
            <ImpactCounter icon={ShieldCheck} label="Species protected" value={impact.species} tone="text-cyan-200" />
          </div>
        </section>

        <MissionTicker zones={zones} />

        <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <EarthHud zones={zones} biodiversity={impact.biodiversity} />
          <div className="grid content-start gap-5">
            <ImpactCounter icon={Globe2} label="Hectares rewilded" value={impact.hectares} tone="text-amber-200" />
            <ImpactCounter icon={Satellite} label="Active drones" value={impact.drones} tone="text-emerald-200" />
            <div className="border border-white/12 bg-white/[0.035] p-5" data-testid="gaia-biodiversity-index">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BarChart3 className="h-4 w-4 text-emerald-200" strokeWidth={1.5} />
                  Planetary Index
                </span>
                <span className="font-mono text-xs text-white/45">{loading ? "SYNC" : "LIVE"}</span>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex justify-between text-xs uppercase tracking-[0.18em] text-white/50">
                    <span>Biodiversity</span><span>{impact.biodiversity}%</span>
                  </div>
                  <Progress value={impact.biodiversity} className="h-2 bg-white/10" indicatorClassName="bg-emerald-300" />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-xs uppercase tracking-[0.18em] text-white/50">
                    <span>Soil health</span><span>{impact.soil}%</span>
                  </div>
                  <Progress value={impact.soil} className="h-2 bg-white/10" indicatorClassName="bg-amber-300" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-8">
          <MilestoneGrid />
        </section>

        <ConstellationVerdant zones={zones} />

        <TrillionTreeCounter impact={impact} />

        <GenesisVault zones={zones} />

        <EcoCoinDashboard impact={impact} zones={zones} />

        <BioAcousticAI zones={zones} />

        <ProjectPoseidon impact={impact} />

        <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 lg:grid-cols-3">
          {[
            { title: "Constellation Verdant", icon: Satellite, copy: "Orbital sweep simulation surfaces hyperspectral change every mission cycle." },
            { title: "Genesis Vault", icon: Database, copy: "Species observations become auditable genetic continuity records." },
            { title: "Project Poseidon", icon: Waves, copy: "Aquatic missions coordinate reefs, kelp corridors, and ghost-net removal." },
          ].map(({ title, icon: Icon, copy }) => (
            <div key={title} className="border border-white/12 bg-white/[0.035] p-5" data-testid={`gaia-module-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              <Icon className="mb-6 h-5 w-5 text-emerald-200" strokeWidth={1.5} />
              <p className="font-heading text-xl font-bold text-white">{title}</p>
              <p className="mt-3 text-sm leading-6 text-white/58">{copy}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-white/10 px-5 py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-white/40 md:flex-row md:items-center md:justify-between">
          <span>Last telemetry sync: {data.last_updated ? new Date(data.last_updated).toLocaleString() : "live"}</span>
          <span className="flex items-center gap-2"><Crosshair className="h-3.5 w-3.5" /> Public restoration webcast layer</span>
        </div>
      </footer>
    </div>
  );
}
