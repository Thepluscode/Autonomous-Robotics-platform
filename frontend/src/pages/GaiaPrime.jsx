import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { provenanceAPI, publicAPI } from "../lib/api";
import { LoadingState, ErrorState, EmptyState } from "../components/state";
import { toast } from "../lib/toast";
import {
  ShieldCheck,
  Key,
  FileSignature,
  Radio,
  ExternalLink,
  Copy,
  Terminal,
  CheckCircle2,
  ArrowLeft,
  Activity,
  Globe2,
  Clock,
} from "lucide-react";

// Public, verifiable rewilding surface. /gaia-prime is the page an
// auditor lands on when they're asking the only question that matters
// for credit issuance: "can we verify this without trusting your
// servers?". Layout is intentionally calm and terminal-flavored — the
// HUD/marketing telemetry lives at /public; this is the
// machine-checkable-evidence side.

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8001").replace(/\/+$/, "");

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error("Couldn't copy", { description: err.message });
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5"
      data-testid="copy-button"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function CodeBlock({ children, label }) {
  return (
    <div className="relative">
      <pre
        className="bg-muted/50 border border-border rounded-md p-3 text-xs font-mono text-foreground overflow-x-auto"
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

function ZoneAttestationCard({ zone }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAttestation = useCallback(async () => {
    try {
      const res = await provenanceAPI.getZoneAttestation(zone.id, 168);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [zone.id]);

  useEffect(() => {
    if (!zone.id) {
      setLoading(false);
      return;
    }
    fetchAttestation();
  }, [zone.id, fetchAttestation]);

  if (!zone.id) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">
          Zone "{zone.name}" has no public ID exposed; attestation lookup
          requires the operator to seed zone IDs in the public dashboard.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={`zone-attestation-${zone.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-primary" />
              {zone.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{zone.id}</p>
          </div>
          <Badge variant="outline" className="text-[10px]">{zone.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <LoadingState compact label="Fetching attestation…" />
        ) : error ? (
          <ErrorState
            title="Couldn't load attestation"
            error={error}
            onRetry={() => { setError(null); setLoading(true); fetchAttestation(); }}
          />
        ) : data && data.count > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Observations (7d)</p>
                <p className="font-mono text-base font-semibold tabular-nums">{data.count}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Key ID</p>
                <p className="font-mono text-[10px] truncate" title={data.key_id}>{data.key_id || "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Aggregate root (SHA-256 of sorted digests)</p>
              <div className="font-mono text-[10px] break-all bg-muted/50 border border-border rounded p-2">
                {data.aggregate_root || "—"}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <a
                href={`${API_BASE}/api/zones/${zone.id}/attestation?hours=168`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                data-testid="open-attestation-json"
              >
                Open attestation JSON
                <ExternalLink className="w-3 h-3" />
              </a>
              {data.aggregate_root ? <CopyButton text={data.aggregate_root} label="Copy root" /> : null}
            </div>
          </>
        ) : (
          <EmptyState
            icon={Radio}
            title="No signed observations yet"
            description="Drone or sensor observations for this zone haven't been recorded in the last 7 days."
            className="py-4"
          />
        )}
      </CardContent>
    </Card>
  );
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

function StatTile({ icon: Icon, label, value, sub, testId }) {
  return (
    <div
      className="rounded-md border border-border bg-card p-4 flex flex-col gap-1.5"
      data-testid={testId}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {Icon ? <Icon className="w-3.5 h-3.5" aria-hidden="true" /> : null}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-heading font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
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
        // Stats are nice-to-have; show null tiles instead of failing the page.
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

  const keyId = keyInfo?.kid || "—";
  const verifyCurl = `curl -s ${API_BASE}/.well-known/keys.json | jq .keys[0]`;
  const sampleZoneId = zones.find((z) => z.id)?.id || "<zone-uuid>";
  const attestationCurl = `curl -s ${API_BASE}/api/zones/${sampleZoneId}/attestation?hours=168 | jq`;
  const verifyEndpointCurl = `curl -s -X POST ${API_BASE}/api/observations/verify -H "Content-Type: application/json" -d @observation.json | jq`;

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="gaia-prime-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Header */}
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
              Every drone observation, soil reading, and species identification we record is
              signed with an Ed25519 key whose public half is published below. Auditors —
              Verra, Gold Standard, third-party reviewers — can fetch any observation,
              recompute its hash, verify its signature, and re-derive the per-zone aggregate
              root, all without a single API call needing a token from us.
            </p>
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
            onRetry={() => { setError(null); setLoading(true); fetchAll(); }}
          />
        ) : (
          <>
            {/* Live chain counters — every number sourced from the same
                Mongo collection as /api/observations, so what the page
                shows and what an auditor pulls agree by construction. */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Live chain</h2>
                <Badge variant="outline" className="text-[10px] ml-auto">last 7 days</Badge>
              </div>
              {stats ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatTile
                      icon={FileSignature}
                      label="Signed observations"
                      value={stats.total_observations.toLocaleString()}
                      sub="Ed25519-signed, hash-chained"
                      testId="stat-observations"
                    />
                    <StatTile
                      icon={Globe2}
                      label="Active zones"
                      value={stats.zones_with_observations.toLocaleString()}
                      sub="contributing to the chain"
                      testId="stat-zones"
                    />
                    <StatTile
                      icon={Clock}
                      label="Latest entry"
                      value={relativeTime(stats.latest_observation_at)}
                      sub={stats.latest_observation_at ? new Date(stats.latest_observation_at).toLocaleString() : "—"}
                      testId="stat-latest"
                    />
                    <StatTile
                      icon={Key}
                      label="Active key"
                      value={(stats.key_id || "—").slice(0, 8) + "…"}
                      sub="see verification key"
                      testId="stat-key"
                    />
                  </div>
                  {Object.keys(stats.by_source_type || {}).length > 0 ? (
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                          Triple-witness mix — observations by source type
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                          {Object.entries(stats.by_source_type)
                            .sort((a, b) => b[1] - a[1])
                            .map(([sourceType, count]) => (
                              <div
                                key={sourceType}
                                className="rounded border border-border bg-muted/30 p-2"
                                data-testid={`source-${sourceType}`}
                              >
                                <div className="text-xs text-muted-foreground font-mono">
                                  {sourceType}
                                </div>
                                <div className="text-lg font-heading font-semibold tabular-nums">
                                  {count.toLocaleString()}
                                </div>
                              </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Drone telemetry, sensor readings, and intervention before/action/after
                          observations cross-witness each other. Auditors verify any of these
                          against the public key with{" "}
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

            {/* Public key */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">Verification key</h2>
                <Badge variant="outline" className="text-[10px] ml-auto">Ed25519 / OKP</Badge>
              </div>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Key ID</p>
                      <p className="font-mono text-sm break-all" data-testid="key-id">{keyId}</p>
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

            {/* Per-zone attestation */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-primary" />
                <h2 className="font-heading text-lg font-semibold">
                  Zone attestation roots
                </h2>
                <Badge variant="outline" className="text-[10px] ml-auto">last 7 days</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Each card is a SHA-256 aggregate of every signed observation digest for the
                zone over the last 7 days. Pull the per-observation list, verify each
                signature, sort the digests, recompute the SHA-256 — match means the chain
                is intact.
              </p>
              {zones.length === 0 ? (
                <EmptyState
                  icon={Radio}
                  title="No zones published"
                  description="Once zones are seeded, their public attestation roots appear here."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {zones.map((zone, i) => (
                    <ZoneAttestationCard key={zone.id || i} zone={zone} />
                  ))}
                </div>
              )}
            </section>

            {/* Auditor cheatsheet */}
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
            <code className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px] font-mono">PUBLIC_ROUTES</code>
            and verified by the public-surface lock test.
          </p>
        </footer>
      </div>
    </div>
  );
}
