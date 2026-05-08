import React from "react";
import { cn } from "@/lib/utils";

/**
 * Uniform "this surface is loading" treatment.
 *
 * Use this whenever an async fetch hasn't returned yet. The `compact`
 * variant is for inline loaders (e.g., inside a list cell); the default
 * variant is for full-page or full-card loads. Pages must never render a
 * blank section while data is in flight — that's how silent failures
 * masquerade as empty datasets.
 */
export default function LoadingState({
  label = "Loading...",
  compact = false,
  className,
  "data-testid": testId = "loading-state",
}) {
  if (compact) {
    return (
      <div
        className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
        data-testid={testId}
        role="status"
        aria-live="polite"
      >
        <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 py-12", className)}
      data-testid={testId}
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground font-sans">{label}</p>
    </div>
  );
}
