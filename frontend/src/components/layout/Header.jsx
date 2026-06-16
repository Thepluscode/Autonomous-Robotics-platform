import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { alertAPI } from "../../lib/api";
import useWebSocket from "../../hooks/useWebSocket";
import { LoadingState, EmptyState, ErrorState } from "../state";

function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

function severityDot(severity) {
  const s = (severity || "").toLowerCase();
  if (s === "critical" || s === "high") return "bg-red-500";
  if (s === "warning" || s === "medium") return "bg-amber-500";
  if (s === "info" || s === "low") return "bg-sky-500";
  return "bg-muted-foreground";
}

export default function Header({ title }) {
  const { isConnected } = useWebSocket();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef(null);

  const refreshCount = useCallback(() => {
    alertAPI
      .getAll(true)
      .then((res) => setUnreadCount(res.data?.length || 0))
      .catch(() => {});
  }, []);

  const loadAlerts = useCallback(() => {
    setLoading(true);
    setError(false);
    return alertAPI
      .getAll(true)
      .then((res) => {
        const data = res.data || [];
        setAlerts(data);
        setUnreadCount(data.length);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Initial unread badge count.
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // Load the list whenever the panel opens.
  useEffect(() => {
    if (open) loadAlerts();
  }, [open, loadAlerts]);

  // Close on click-outside / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = async () => {
    try {
      await alertAPI.markAllRead();
      setAlerts([]);
      setUnreadCount(0);
    } catch {
      setError(true);
    }
  };

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-card" data-testid="header">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-heading font-semibold text-foreground">{title || "Dashboard"}</h2>
      </div>
      <div className="flex items-center gap-3">
        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
          <span className="text-xs text-muted-foreground">{isConnected ? "Live" : "Offline"}</span>
        </div>

        {/* Alerts */}
        <div className="relative" ref={containerRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label="Notifications"
            data-testid="alerts-btn"
          >
            <Bell className="w-4 h-4" strokeWidth={1.5} />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 text-[10px] px-1 flex items-center justify-center"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>

          {open && (
            <div
              className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card shadow-lg z-50"
              role="dialog"
              aria-label="Notifications"
              data-testid="alerts-panel"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-sm font-heading font-semibold text-foreground">Notifications</span>
                {alerts.length > 0 && (
                  <button
                    type="button"
                    onClick={markAll}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 flex items-center gap-1"
                    data-testid="alerts-mark-all-read"
                  >
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <LoadingState compact label="Loading notifications..." className="px-4 py-6" data-testid="alerts-loading" />
                ) : error ? (
                  <ErrorState title="Couldn't load notifications" onRetry={loadAlerts} className="py-8" data-testid="alerts-error" />
                ) : alerts.length === 0 ? (
                  <EmptyState icon={Bell} title="No new notifications" description="You're all caught up." className="py-8" data-testid="alerts-empty" />
                ) : (
                  alerts.map((a) => (
                    <div
                      key={a.id}
                      className="flex gap-2.5 px-4 py-3 border-b border-border last:border-0"
                      data-testid="alert-item"
                    >
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${severityDot(a.severity)}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{a.title || a.type || "Alert"}</p>
                        {a.message && <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>}
                        {a.created_at && <p className="text-[10px] text-muted-foreground mt-1">{formatWhen(a.created_at)}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
