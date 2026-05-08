import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from "lucide-react";
import { subscribe, dismiss } from "@/lib/toast";
import { cn } from "@/lib/utils";

const LEVEL_STYLES = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-primary",
    border: "border-primary/30",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    border: "border-destructive/40",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-amber-600",
    border: "border-amber-500/30",
  },
  info: {
    icon: Info,
    iconClass: "text-foreground/70",
    border: "border-border",
  },
};

/**
 * Single global Toaster. Mount once at the App root. Subscribes to the
 * imperative toast store at @/lib/toast and renders the active toasts as
 * a stack in the bottom-right corner. Designed for the calm 0.2s
 * fade/slide animations the design system mandates — no framer-motion.
 */
export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribe(setItems);
    return unsubscribe;
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto"
      role="region"
      aria-label="Notifications"
      data-testid="toaster"
    >
      {items.map((item) => {
        const style = LEVEL_STYLES[item.level] || LEVEL_STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={item.id}
            className={cn(
              "rounded-md border bg-card text-card-foreground shadow-md p-4 flex items-start gap-3 animate-fade-in",
              style.border
            )}
            role="status"
            data-testid={`toast-${item.level}`}
          >
            <Icon className={cn("w-5 h-5 mt-0.5 flex-shrink-0", style.iconClass)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              {item.description ? (
                <p className="text-xs text-muted-foreground mt-1 break-words">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss notification"
              data-testid="toast-dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
