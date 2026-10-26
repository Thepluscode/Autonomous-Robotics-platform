import React, { useCallback, useEffect, useState } from "react";
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
  Download,
  Eye,
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

const SOURCE_LABELS = {
  drone_telemetry: "Drone",
  drone_position: "Drone",
  sensor_reading: "Sensor",
  satellite_image_hash: "Satellite",
  species_identification: "AI",
  metered_cooking_device: "Cooking",
  zone_transition: "Zone",
};

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

// Browse recent signed observations and verify any one in-browser.
function ObservationExplorer({ zones }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [verifying, setVerifying] = useState({});

  const load = useCallback(async (sourceType) => {
    setLoading(true);
    setError(null);
    setVerifying({});
    try {
      const params = { limit: 25 };
      if (sourceType && sourceType !== "all") params.source_type = sourceType;
      const res = await provenanceAPI.listObservations(params);
      setObservations(res.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const verifyOne = async (obs) => {
    setVerifying((prev) => ({ ...prev, [obs.id]: "pending" }));
    try {
      const res = await provenanceAPI.verifyObservation(obs);
      setVerifying((prev) => ({ ...prev, [obs.id]: res.data }));
    } catch (err) {
      setVerifying((prev) => ({
        ...prev,
        [obs.id]: { valid: false, reason: err.message },
      }));
    }
  };

  const zoneNameMap = Object.fromEntries(
    (zones || []).map((z) => [z.id, z.name])
  );
  const FILTERS = [
    "all",
    "drone_telemetry",
    "sensor_reading",
    "satellite_image_hash",
    "species_identification",
  ];

  return (
    <section className="space-y-3" data-testid="observation-explorer">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-primary" />
        <h2 className="font-heading text-lg font-semibold">
          Live observation log
        </h2>
        <Badge variant="outline" className="text-[10px] ml-auto">
          last 25
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Every row is a signed, hash-chained observation. Click{" "}
        <span className="font-medium text-foreground">verify</span> to confirm
        the Ed25519 signature in the browser — no curl or Python required.
      </p>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Filter by source type"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-xs border transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:border-primary hover:text-foreground"
            }`}
            data-testid={`obs-filter-${f}`}
          >
            {f === "all" ? "All" : SOURCE_LABELS[f] || f}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingState label="Loading observations…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load observations"
          error={error}
          onRetry={() => load(filter)}
        />
      ) : observations.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No observations yet"
          description="Observations appear here once data flows in from drones, sensors, or satellites."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs" data-testid="observation-table">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">
                  Zone
                </th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">
                  Digest
                </th>
                <th className="px-3 py-2 text-right font-medium">Sig</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {observations.map((obs) => {
                const v = verifying[obs.id];
                const catColor =
                  SOURCE_CATEGORIES.find(
                    (c) => !c.isCatchAll && c.sources.includes(obs.source_type)
                  )?.color ||
                  SOURCE_CATEGORIES.find((c) => c.isCatchAll)?.color;
                return (
                  <tr
                    key={obs.id}
                    className="hover:bg-muted/30 transition-colors"
                    data-testid="obs-row"
                  >
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">
                      {relativeTime(obs.observed_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] text-white font-medium"
                        style={{ backgroundColor: catColor }}
                      >
                        {SOURCE_LABELS[obs.source_type] || obs.source_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono hidden sm:table-cell text-muted-foreground">
                      {zoneNameMap[obs.zone_id] ||
                        (obs.zone_id ? obs.zone_id.slice(0, 8) + "…" : "—")}
                    </td>
                    <td className="px-3 py-2 font-mono hidden md:table-cell text-muted-foreground">
                      {obs.digest ? obs.digest.slice(0, 14) + "…" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {v === "pending" ? (
                        <span className="text-muted-foreground text-[10px]">
                          …
                        </span>
                      ) : v ? (
                        <span
                          className={`font-semibold ${
                            v.valid
                              ? "text-green-600 dark:text-green-400"
                              : "text-red-500"
                          }`}
                          title={v.reason}
                          data-testid="obs-verify-result"
                        >
                          {v.valid ? "✓" : "✗"}
                        </span>
                      ) : (
                        <button
                          className="text-[10px] text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={() => verifyOne(obs)}
                          data-testid="obs-verify-btn"
                          disabled={!obs.signature}
                          title={
                            obs.signature
                              ? "Verify Ed25519 signature"
                              : "No signature (redacted or unsigned)"
                          }
                        >
                          {obs.signature ? "verify" : "—"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Paste any observation JSON and verify its signature in-browser.
// Uses POST /api/observations/verify — stateless, public, no auth needed.
function InBrowserVerifier() {
  const [json, setJson] = useState("");
  const [result, setResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [parseError, setParseError] = useState(null);

  const handleVerify = async () => {
    setParseError(null);
    setResult(null);
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      setParseError("Invalid JSON — check your pasted text.");
      return;
    }
    setVerifying(true);
    try {
      const res = await provenanceAPI.verifyObservation(parsed);
      setResult(res.data);
    } catch (err) {
      setResult({
        valid: false,
        reason:
          err.response?.data?.detail || err.message || "Request failed",
      });
    } finally {
      setVerifying(false);
    }
  };

  const clear = () => {
    setJson("");
    setResult(null);
    setParseError(null);
  };

  return (
    <section className="space-y-3" data-testid="in-browser-verifier">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h2 className="font-heading text-lg font-semibold">
          Verify in your browser
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste any signed observation JSON — from{" "}
        <code className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
          GET /api/observations
        </code>{" "}
        or an offline file — and confirm the Ed25519 signature instantly. The
        verify endpoint is stateless and public: we never need to have stored
        the observation.
      </p>
      <Card>
        <CardContent className="p-4 space-y-3">
          <textarea
            className="w-full h-40 bg-muted/50 border border-border rounded-md p-3 text-xs font-mono text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder={
              '{\n  "id": "...",\n  "source_type": "drone_telemetry",\n  "digest": "...",\n  "signature": "...",\n  "key_id": "...",\n  ...\n}'
            }
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setResult(null);
              setParseError(null);
            }}
            data-testid="verifier-textarea"
            aria-label="Observation JSON to verify"
          />
          {parseError && (
            <p
              className="text-xs text-destructive"
              data-testid="verifier-parse-error"
            >
              {parseError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleVerify}
              disabled={!json.trim() || verifying}
              size="sm"
              data-testid="verifier-submit"
            >
              {verifying ? "Verifying…" : "Verify signature"}
            </Button>
            {json.trim() && !verifying && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={clear}
                data-testid="verifier-clear"
              >
                Clear
              </button>
            )}
          </div>
          {result && (
            <div
              className={`flex items-start gap-3 p-3 rounded-md ${
                result.valid
                  ? "bg-green-50 border border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
                  : "bg-red-50 border border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
              }`}
              data-testid="verifier-result"
            >
              <span
                className="text-lg leading-none mt-0.5 select-none"
                aria-hidden="true"
              >
                {result.valid ? "✓" : "✗"}
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {result.valid ? "Valid signature" : "Invalid signature"}
                </p>
                {result.reason && (
                  <p className="text-xs mt-1 opacity-80">{result.reason}</p>
                )}
                {result.key_id && (
                  <p className="text-xs mt-1.5 font-mono opacity-70">
                    key_id: {result.key_id}
                  </p>
                )}
                {result.valid &&
                  result.current_key_id &&
                  result.key_id !== result.current_key_id && (
                    <p className="text-xs mt-1.5 text-amber-700 dark:text-amber-400">
                      ⚠ Signed with a rotated key (current:{" "}
                      {result.current_key_id.slice(0, 8)}…). Signature is
                      still valid — key rotation is documented in the
                      methodology.
                    </p>
                  )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
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

  const downloadAuditBundle = useCallback(() => {
    if (!stats || !keyInfo) return;
    const bundle = {
      generated_at: new Date().toISOString(),
      platform: "Autonomous Ecosystem Architect — Verifiable Rewilding Chain",
      chain: {
        key_id: keyInfo.kid,
        algorithm: keyInfo.alg || "EdDSA",
        curve: keyInfo.crv || "Ed25519",
        public_key_x: keyInfo.x || "(fetch from /.well-known/keys.json)",
        jwk_url: `${API_BASE}/.well-known/keys.json`,
      },
      stats: {
        total_observations: stats.total_observations,
        zones_with_observations: stats.zones_with_observations,
        latest_observation_at: stats.latest_observation_at,
        window_hours: 168,
        by_source_type: stats.by_source_type,
      },
      zones: attestationRows
        .filter((r) => r.data)
        .map((r) => ({
          id: r.zone.id,
          name: r.zone.name,
          attestation: {
            aggregate_root: r.data.aggregate_root,
            observation_count: r.data.count,
            since: r.data.since,
            key_id: r.data.key_id,
          },
        })),
      verification_instructions: {
        "1_fetch_key": `curl -s ${API_BASE}/.well-known/keys.json | jq .keys[0]`,
        "2_pull_attestation": `curl -s '${API_BASE}/api/zones/{zone_id}/attestation?hours=168' | jq`,
        "3_verify_observation": `curl -s -X POST ${API_BASE}/api/observations/verify -H 'Content-Type: application/json' -d @observation.json | jq`,
        "4_recompute_root": "SHA-256(sorted observation digests, newline-joined) must equal aggregate_root",
      },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gaia-prime-audit-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [stats, keyInfo, attestationRows]);

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
          <div className="flex flex-col sm:flex-row gap-2">
            {stats && keyInfo && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={downloadAuditBundle}
                data-testid="download-audit-bundle"
                title="Download a compiled JSON bundle: key material, chain stats, and all zone attestation roots for offline verification"
              >
                <Download className="w-3.5 h-3.5" />
                Download audit bundle
              </Button>
            )}
            <Link to="/public" data-testid="back-to-public-dashboard">
              <Button variant="outline" size="sm" className="gap-1.5 w-full sm:w-auto">
                <ArrowLeft className="w-3.5 h-3.5" />
                Public dashboard
              </Button>
            </Link>
          </div>
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

            <ObservationExplorer zones={zones} />

            <Separator />

            <InBrowserVerifier />

            <Separator />

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
