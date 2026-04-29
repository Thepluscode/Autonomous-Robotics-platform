import React, { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { alertAPI } from "../../lib/api";
import useWebSocket from "../../hooks/useWebSocket";

export default function Header({ title }) {
  const { isConnected } = useWebSocket();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    alertAPI.getAll(true).then((res) => setUnreadCount(res.data?.length || 0)).catch(() => {});
  }, []);

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
        <Button variant="ghost" size="icon" className="relative" data-testid="alerts-btn">
          <Bell className="w-4 h-4" strokeWidth={1.5} />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 text-[10px] px-1 flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  );
}
