import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";
import {
  LayoutDashboard, Plane, MapPin, BarChart3, Brain, Route, FileText,
  Map, Camera, Bug, Cloud, TrendingUp, Zap, Shield, Users, Download,
  Bell, LogOut, Leaf, ChevronLeft, ChevronRight, Rocket,
} from "lucide-react";
import { cn } from "../../lib/utils";

const navSections = [
  {
    label: "Overview",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/map", icon: Map, label: "Ecosystem Map" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/mission-control", icon: Rocket, label: "Mission Control", roles: ["admin", "field_operator", "scientist"] },
      { to: "/drones", icon: Plane, label: "Drone Fleet", roles: ["admin", "field_operator"] },
      { to: "/zones", icon: MapPin, label: "Zone Management", roles: ["admin", "field_operator", "scientist"] },
      { to: "/patrols", icon: Route, label: "Patrol Scheduling", roles: ["admin", "field_operator"] },
      { to: "/patrol-reports", icon: FileText, label: "Patrol Reports" },
      { to: "/feeds", icon: Camera, label: "Camera Feeds", roles: ["admin", "field_operator"] },
      { to: "/geofencing", icon: Shield, label: "Geofencing", roles: ["admin", "field_operator"] },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/analytics", icon: BarChart3, label: "Analytics", roles: ["admin", "scientist"] },
      { to: "/ai", icon: Brain, label: "AI Recommendations", roles: ["admin", "scientist"] },
      { to: "/species", icon: Bug, label: "Species ID", roles: ["admin", "scientist"] },
      { to: "/forecasting", icon: TrendingUp, label: "Forecasting", roles: ["admin", "scientist"] },
      { to: "/interventions", icon: Zap, label: "Interventions", roles: ["admin", "scientist"] },
      { to: "/weather", icon: Cloud, label: "Weather" },
    ],
  },
  {
    label: "Collaboration",
    items: [
      { to: "/team", icon: Users, label: "Team Tasks" },
      { to: "/reports", icon: Download, label: "Reports" },
      { to: "/notifications", icon: Bell, label: "Notifications" },
    ],
  },
];

export default function Sidebar() {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-[var(--sidebar-width)]"
      )}
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-primary text-primary-foreground">
          <Leaf className="w-4 h-4" strokeWidth={1.5} />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-heading font-bold text-foreground truncate">Ecosystem Architect</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Command Center</p>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setCollapsed(!collapsed)} data-testid="sidebar-toggle">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className="p-2 space-y-4">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.roles || hasRole(item.roles)
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.label}>
                {!collapsed && (
                  <p className="px-3 mb-1 text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.to;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-all duration-200",
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User profile */}
      <Separator />
      <div className="p-3">
        {user && (
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary text-xs font-semibold shrink-0">
              {user.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{user.role}</p>
              </div>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={logout} data-testid="logout-btn">
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
