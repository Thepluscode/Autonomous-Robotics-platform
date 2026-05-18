import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { provenanceAPI, publicAPI } from "../lib/api";
import { LoadingState, ErrorState, EmptyState } from "../components/state";
import { useZoneAttestations } from "../hooks/useZoneAttestations";
import { CopyButton } from "../components/gaia-prime/CopyButton";
import {
  ZoneAttestationCard,
  ZoneAttestationTable,
} from "../components/gaia-prime/Attestation";
import {
  ShieldCheck,
  Key,
  FileSignature,
  Radio,
  ExternalLink,
  Terminal,
  ArrowLeft,
  Activity,
} from "lucide-react";

// Public, verifiable rewilding surface. /gaia-prime is the page an
// auditor lands on when they're asking the only question that matters
// for credit issuance: "can we verify this without trusting your
// servers?". Layout is intentionally calm and terminal-flavored — the
// HUD/marketing telemetry lives at /public; this is the
// machine-checkable-evidence side.

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8001").replace(/\/+$/, "");

// Source-type → display category. Inline oklch palette is deliberate
// here: the design system doesn't yet expose distinct chart tokens for
// the five witness categories. When chart tokens land in
// design_guidelines this object moves to CSS variables.
const SOURCE_CATEGORIES = [
  {
    id: "drone",
    label: "Drone",
    sources: ["drone_telemetry", "drone_position"],
    color: "oklch(58% 0.12 145)",
  },
  {
    id: "sensor",
    label: "Sensor",
    sources: ["sensor_reading"],
    color: "oklch(62% 0.15 35)",
  },
  {
    id: "satellite",
    label: "Satellite",
    sources: ["satellite_image_hash"],
    color: "oklch(58% 0.12 235)",
  },
  {
    id: "ai",
    label: "AI",
    sources: ["species_identification"],
    color: "oklch(70% 0.14 75)",
  },
  {
    id: "operational",
    label: "Operational",
    sources: [],
    isCatchAll: true,
    color: "oklch(60% 0.03 250)",
  },
];

function aggregateByCategory(bySourceType) {
  const totals = SOURCE_CATEGORIES.map((c) => ({ ...c, count: 0, members: [] }));
  const operational = totals.find((c) => c.isCatchAll);
  for (const [source, count] of Object.entries(bySourceType || {})) {
    const cat = totals.find((c) => !c.isCatchAll && c.sources.includes(source));
    if (cat) {
      cat.count += count;
      cat.members.push(source);
    } else {
      operational.count += count;
      operational.members.push(source);
    }
  }
  return totals;
}

function relativeTime(iso) {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function CodeBlock({ children, label }) {
  return (
    <div className="relative">
      <pre
        className="bg-muted/50 border border-border rounded-md p-3 pr-14 text-xs font-mono text-foreground overflow-x-auto"
        data-testid={label ? `code-${label}` : "code-block"}
      >
        <code>{children}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={children} />
      </div>
    </div>
  );
}

// S1 — pin a curl that proves the chain stats showing right now. The
// page becomes its own evidence: the numbers in the curl's `# returns:`
// comment are interpolated from the same `stats` object the Live Chain
// section renders.
function VerifyThisPage({ stats, apiBase }) {
  if (!stats) return null;
  const latest = stats.latest_observation_at || "null";
  const keyId = stats.key_id || "null";
  const content = `$ curl -s ${apiBase}/api/public/provenance/stats | jq
# returns:
#   total_observations:      ${stats.total_observations.toLocaleString()}
#   zones_with_observations: ${stats.zones_with_observations.toLocaleString()}
#   latest_observation_at:   ${latest}
#   key_id:                  ${keyId}
# the numbers in the "Live chain" section below are this response,
# rendered. nothing on this page is computed by the frontend alone.`;
  return (
    <div className="mt-6 max-w-2xl" data-testid="verify-this-page">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Terminal className="w-3 h-3" aria-hidden="true" />
        Verify this page
      </p>
      <CodeBlock label="verify-this-page">{content}</CodeBlock>
    </div>
  );
}

function StatStrip({ stats }) {
  const items = [
    {
      label: "Signed observations",
      value: stats.total_observations.toLocaleString(),
      sub: "Ed25519-signed, hash-chained",
      testId: "stat-observations",
    },
    {
      label: "Active zones",
      value: stats.zones_with_observations.toLocaleString(),
      sub: "contributing to the chain",
      testId: "stat-zones",
    },
    {
      label: "Latest entry",
      value: relativeTime(stats.latest_observation_at),
      sub: stats.latest_observation_at
        ? new Date(stats.latest_observation_at).toLocaleString()
        : "—",
      testId: "stat-latest",
    },
    {
      label: "Active key",
      value: (stats.key_id || "—").slice(0, 8) + "…",
      sub: "see verification key",
      testId: "stat-key",
    },
  ];
  return (
    <div
      className="rounded-md border border-border bg-card grid grid-cols-2 md:grid-cols-4 md:divide-x divide-border"
      data-testid="stat-strip"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="p-4 flex flex-col gap-1.5 min-w-0"
          data-testid={item.testId}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.label}
          </div>
          <div className="text-3xl font-heading font-bold tabular-nums leading-none truncate">
            {item.value}
          </div>
          <div className="text-xs text-muted-foreground truncate">{item.sub}</div>
        </div>
      ))}
    </div>
  );
}

function TriangulationBar({ bySourceType }) {
  const categories = aggregateByCategory(bySourceType);
  const total = categories.reduce((s, c) => s + c.count, 0);

  if (total === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Source-type breakdown will appear once the first observations land.
      </div>
    );
  }

  const present = categories.filter((c) => c.count > 0);

  return (
    <div data-testid="triangulation-bar" className="space-y-3">
      <div
        className="flex h-8 rounded-md overflow-hidden border border-border"
        role="img"
        aria-label={`Source-type mix: ${present
          .map((c) => `${c.label} ${((c.count / total) * 100).toFixed(0)}%`)
          .join(", ")}`}
      >
        {present.map((cat) => {
          const pct = (cat.count / total) * 100;
          return (
            <div
              key={cat.id}
              style={{ width: `${pct}%`, backgroundColor: cat.color }}
              title={`${cat.label}: ${cat.count.toLocaleString()} (${pct.toFixed(1)}%) — ${cat.members.join(", ") || "—"}`}
              data-testid={`bar-${cat.id}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {present.map((cat) => {
          const pct = (cat.count / total) * 100;
          return (
            <div
              key={cat.id}
              className="flex items-center gap-2 text-xs min-w-0"
              data-testid={`legend-${cat.id}`}
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: cat.color }}
                aria-hidden="true"
              />
              <span className="font-mono truncate">
                {cat.label}
                <span className="text-muted-foreground">
                  {" "}
                  {cat.count.toLocaleString()} ({pct.toFixed(0)}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KeyMaterialDisclosure({ keyInfo }) {
  if (!keyInfo) return null;
  if (!keyInfo.x) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Key material not exposed on this backend.
      </p>
    );
  }
  return (
    <details className="group" data-testid="key-material-disclosure">
      <summary className="text-xs text-primary hover:underline cursor-pointer inline-flex items-center gap-1.5 select-none list-none">
        <span className="inline-block transition-transform duration-200 group-open:rotate-90">
          ▸
        </span>
        Show key material
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Ed25519 public key (raw, base64url)
        </p>
        <CodeBlock label="key-material">{keyInfo.x}</CodeBlock>
        <p className="text-xs text-muted-foreground">
          This is the same{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">x</code>{" "}
          value served at{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
            /.well-known/keys.json
          </code>
          . Verifiers paste it into{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
            Ed25519PublicKey.from_public_bytes(base64.urlsafe_b64decode(x + b"=="))
          </code>
          .
        </p>
      </div>
    </details>
  );
}

export default function GaiaPrime() {
  const [zones, setZones] = useState([]);
  const [keyInfo, setKeyInfo] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = async () => {
    try {
      // Three parallel reads. Stats may legitimately fail (e.g., older
      // backend without the endpoint) without sinking the whole page —
      // allSettled lets the page degrade gracefully on that one section.
      const [dashboardRes, keysRes, statsRes] = await Promise.allSettled([
        publicAPI.getDashboard(),
        provenanceAPI.getPublicKey(),
        provenanceAPI.getStats(168),
      ]);
      if (dashboardRes.status === "fulfilled") {
        setZones(dashboardRes.value.data?.zone_summary || []);
      } else {
        throw dashboardRes.reason;
      }
      if (keysRes.status === "fulfilled") {
        setKeyInfo(keysRes.value.data?.keys?.[0] || null);
      } else {
        throw keysRes.reason;
      }
      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value.data || null);
      } else {
        setStats(null);
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const { rows: attestationRows, retry: retryAttestation } =
    useZoneAttestations(zones);

  const keyId = keyInfo?.kid || "—";
  const verifyCurl = `$ curl -s ${API_BASE}/.well-known/keys.json | jq .keys[0]
# returns:
#   {
#     "kty": "OKP", "crv": "Ed25519", "use": "sig", "alg": "EdDSA",
#     "kid": "${keyId}",
#     "x":   "<32-byte raw public key, base64url>"
#   }
# the kid above must match the kid in every observation you verify.`;
  const sampleZoneId = zones.find((z) => z.id)?.id || "<zone-uuid>";
  const attestationCurl = `$ curl -s ${API_BASE}/api/zones/${sampleZoneId}/attestation?hours=168 | jq
# returns:
#   {
#     "zone_id": "...", "hours": 168, "count": <int>,
#     "aggregate_root": "<hex>", "key_id": "...",
#     "observations": [ { "id", "hash", "signature", "ts", ... } ]
#   }
# verify: SHA-256 of sorted observation digests must equal aggregate_root.`;
  const verifyEndpointCurl = `$ curl -s -X POST ${API_BASE}/api/observations/verify \\
    -H "Content-Type: application/json" \\
    -d @observation.json | jq
# returns:
#   { "signature_valid": true | false, "key_id": "...", ... }
# stateless — we never need to have stored the observation.`;

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="gaia-prime-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <header className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Gaia Prime · Verifiable Rewilding Chain</span>
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold leading-tight">
              Don't trust us. Verify us.
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl mt-3">
              Evidence layer for Verra Nature Credits. Verra's Nature Framework defines a
              credit as one Quality Hectare of biodiversity uplift. This page is what makes
              that uplift defensible. Every measurement that feeds a project's claim is
              signed with the Ed25519 key below and chained by content hash. That includes
              drone telemetry, soil sensors, satellite witnesses, and intervention
              before/after observations. The retail critique of credit markets — "no way to
              prove this credit wasn't redeemed twice" — doesn't survive a verifiable chain.
            </p>
            <p className="text-sm text-muted-foreground max-w-2xl mt-2">
              Auditors fetch any observation, recompute its hash, and verify its signature
              against the published key. Per-zone aggregate roots are re-derivable the same
              way. None of it requires a token from us. The curl recipes are below.
            </p>
            <VerifyThisPage stats={stats} apiBase={API_BASE} />
          </div>
          <Link to="/public" data-testid="back-to-public-dashboard">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Public dashboard
            </Button>
          </Link>
        </header>

        <Separator />

        {loading ? (
          <LoadingState label="Loading provenance surface…" />
        ) : error ? (
          <ErrorState
            title="Couldn't load Gaia Prime"
            error={error}
            onRetry={() => {
              setError(null);
              setLoading(true);
              fetchAll();
            }}
          />
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Live chain</h2>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  last 7 days
                </Badge>
              </div>
              {stats ? (
                <>
                  <StatStrip stats={stats} />
                  {Object.keys(stats.by_source_type || {}).length > 0 ? (
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Triple-witness mix
                        </p>
                        <TriangulationBar bySourceType={stats.by_source_type} />
                        <p className="text-xs text-muted-foreground">
                          Drone, sensor, and satellite observations cross-witness
                          each other; verify any of them with{" "}
                          <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
                            POST /api/observations/verify
                          </code>
                          .
                        </p>
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              ) : (
                <Card>
                  <CardContent className="p-4 text-xs text-muted-foreground">
                    Chain stats unavailable on this backend. Per-zone attestation roots
                    below are still computed live.
                  </CardContent>
                </Card>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Verification key</h2>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  Ed25519 / OKP
                </Badge>
              </div>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Key ID</p>
                      <p
                        className="font-mono text-sm break-all"
                        data-testid="key-id"
                      >
                        {keyId}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Algorithm</p>
                      <p className="font-mono text-sm">{keyInfo?.alg || "EdDSA"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Curve</p>
                      <p className="font-mono text-sm">{keyInfo?.crv || "Ed25519"}</p>
                    </div>
                  </div>
                  <Separator />
                  <CodeBlock label="public-key">{verifyCurl}</CodeBlock>
                  <KeyMaterialDisclosure keyInfo={keyInfo} />
                  <a
                    href={`${API_BASE}/.well-known/keys.json`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="open-jwk-link"
                  >
                    Open .well-known/keys.json
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">
                  Zone attestation roots
                </h2>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  last 7 days
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Each row is a SHA-256 aggregate of every signed observation digest for
                the zone over the last 7 days. Pull the per-observation list, verify each
                signature, sort the digests, recompute the SHA-256 — match means the
                chain is intact.
              </p>
              {zones.length === 0 ? (
                <EmptyState
                  icon={Radio}
                  title="No zones published"
                  description="Once zones are seeded, their public attestation roots appear here."
                />
              ) : (
                <>
                  <div className="hidden md:block">
                    <ZoneAttestationTable
                      rows={attestationRows}
                      onRetry={retryAttestation}
                    />
                  </div>
                  <div className="md:hidden grid grid-cols-1 gap-4">
                    {attestationRows.map((row, i) => (
                      <ZoneAttestationCard
                        key={row.zone.id || `${row.zone.name}-${i}`}
                        row={row}
                        onRetry={() => retryAttestation(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Auditor cheatsheet</h2>
              </div>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-foreground mb-2">
                      1. Fetch the public key
                    </p>
                    <CodeBlock label="curl-key">{verifyCurl}</CodeBlock>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground mb-2">
                      2. Pull a zone's attestation root
                    </p>
                    <CodeBlock label="curl-attestation">{attestationCurl}</CodeBlock>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground mb-2">
                      3. Verify any observation against the key
                    </p>
                    <CodeBlock label="curl-verify">{verifyEndpointCurl}</CodeBlock>
                    <p className="text-xs text-muted-foreground mt-2">
                      The verify endpoint is stateless — pass any payload that includes a
                      signature, and we'll tell you whether it was signed by us. We never
                      need to have stored it.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        )}

        <footer className="pt-4 text-xs text-muted-foreground">
          <p>
            None of the endpoints linked from this page require authentication. They are
            intentionally part of the public surface declared in
            <code className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
              PUBLIC_ROUTES
            </code>
            and verified by the public-surface lock test.
          </p>
        </footer>
      </div>
    </div>
  );
}
