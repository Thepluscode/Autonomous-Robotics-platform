import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../state";
import {
  FileSignature,
  Radio,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { CopyButton } from "./CopyButton";

// Per-zone attestation surface for /gaia-prime. Two views over the same
// row data: table on md+ (auditor density) and cards on mobile (touch
// targets). Both consume the rows produced by useZoneAttestations.

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8001").replace(/\/+$/, "");

export function ZoneAttestationCard({ row, onRetry }) {
  const { zone, data, loading, error } = row;

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
          <div className="min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-primary" />
              {zone.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
              {zone.id}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {zone.type}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <LoadingState compact label="Fetching attestation…" />
        ) : error ? (
          <ErrorState
            title="Couldn't load attestation"
            error={error}
            onRetry={onRetry}
          />
        ) : data && data.count > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Observations (7d)</p>
                <p className="font-mono text-base font-semibold tabular-nums">
                  {data.count}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Key ID</p>
                <p className="font-mono text-[10px] truncate" title={data.key_id}>
                  {data.key_id || "—"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Aggregate root (SHA-256 of sorted digests)
              </p>
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
              {data.aggregate_root ? (
                <CopyButton text={data.aggregate_root} label="Copy root" />
              ) : null}
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

function ZoneAttestationRow({ row, onRetry }) {
  const { zone, data, loading, error } = row;

  if (!zone.id) {
    return (
      <tr data-testid={`attestation-row-${zone.name}`}>
        <td className="p-3 align-top">
          <div className="text-sm font-medium">{zone.name}</div>
          <div className="text-[10px] text-muted-foreground italic">
            No public ID exposed
          </div>
        </td>
        <td className="p-3 align-top">
          <Badge variant="outline" className="text-[10px]">
            {zone.type}
          </Badge>
        </td>
        <td className="p-3 align-top text-xs text-muted-foreground">—</td>
        <td className="p-3 align-top text-xs text-muted-foreground">—</td>
        <td className="p-3 align-top text-xs text-muted-foreground">—</td>
      </tr>
    );
  }

  return (
    <tr
      className="border-t border-border hover:bg-muted/30"
      data-testid={`attestation-row-${zone.id}`}
    >
      <td className="p-3 align-top min-w-0">
        <div className="text-sm font-medium truncate" title={zone.name}>
          {zone.name}
        </div>
        <div
          className="text-[10px] font-mono text-muted-foreground truncate max-w-[220px]"
          title={zone.id}
        >
          {zone.id}
        </div>
      </td>
      <td className="p-3 align-top">
        <Badge variant="outline" className="text-[10px]">
          {zone.type}
        </Badge>
      </td>
      <td className="p-3 align-top">
        {loading ? (
          <span className="text-xs text-muted-foreground">…</span>
        ) : error ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="font-mono text-sm tabular-nums">
            {(data?.count || 0).toLocaleString()}
          </span>
        )}
      </td>
      <td className="p-3 align-top">
        {loading ? (
          <span className="text-xs text-muted-foreground">loading…</span>
        ) : error ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs text-primary hover:underline"
            data-testid="retry-attestation"
          >
            retry
          </button>
        ) : data?.aggregate_root ? (
          <div className="flex items-center gap-2 min-w-0">
            <code
              className="font-mono text-[10px] truncate max-w-[200px]"
              title={data.aggregate_root}
            >
              {data.aggregate_root.slice(0, 16)}…
            </code>
            <CopyButton text={data.aggregate_root} label="Copy root" iconOnly />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">no observations</span>
        )}
      </td>
      <td className="p-3 align-top">
        <a
          href={`${API_BASE}/api/zones/${zone.id}/attestation?hours=168`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          data-testid="open-attestation-json-row"
        >
          JSON
          <ExternalLink className="w-3 h-3" />
        </a>
      </td>
    </tr>
  );
}

function SortHeader({ label, active, direction, onClick }) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
      data-testid={`sort-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {label}
      <Icon className="w-3 h-3" />
    </button>
  );
}

export function ZoneAttestationTable({ rows, onRetry }) {
  const [sortBy, setSortBy] = useState("count");
  const [sortDir, setSortDir] = useState("desc");

  const toggle = (key) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    const sign = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      if (sortBy === "name") {
        return sign * (a.zone.name || "").localeCompare(b.zone.name || "");
      }
      if (sortBy === "count") {
        const ac = a.data?.count ?? -1;
        const bc = b.data?.count ?? -1;
        return sign * (ac - bc);
      }
      return 0;
    });
    return copy;
  }, [rows, sortBy, sortDir]);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-left" data-testid="attestation-table">
        <caption className="sr-only">
          Per-zone signed-observation aggregate roots over the last 7 days
        </caption>
        <thead className="bg-muted/40">
          <tr>
            <th scope="col" className="p-3">
              <SortHeader
                label="Zone"
                active={sortBy === "name"}
                direction={sortDir}
                onClick={() => toggle("name")}
              />
            </th>
            <th scope="col" className="p-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              Type
            </th>
            <th scope="col" className="p-3">
              <SortHeader
                label="Observations (7d)"
                active={sortBy === "count"}
                direction={sortDir}
                onClick={() => toggle("count")}
              />
            </th>
            <th scope="col" className="p-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              Aggregate root
            </th>
            <th scope="col" className="p-3 text-[10px] uppercase tracking-wider text-muted-foreground">
              Open
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <ZoneAttestationRow
              key={row.zone.id || `${row.zone.name}-${i}`}
              row={row}
              onRetry={() => {
                const originalIndex = rows.indexOf(row);
                if (originalIndex >= 0) onRetry(originalIndex);
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
