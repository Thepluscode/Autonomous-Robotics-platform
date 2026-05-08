import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Uniform "this surface failed to load" treatment.
 *
 * Pages MUST surface fetch failures through this component instead of
 * silently rendering blank or stale state. If `onRetry` is provided, a
 * retry button is shown. If `error` carries a useful message, it's shown
 * in a muted line below the title — never expose stack traces.
 *
 * Pair this with the toast pipeline at @/lib/toast for transient
 * failures (mutations, background refreshes); the ErrorState is for
 * the primary read that gates the page.
 */
export default function ErrorState({
  title = "Couldn't load this view",
  description,
  error,
  onRetry,
  className,
  "data-testid": testId = "error-state",
}) {
  const message = description || (error && (error.message || String(error))) || null;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 px-6 text-center",
        className
      )}
      data-testid={testId}
      role="alert"
    >
      <div
        className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center"
        aria-hidden="true"
      >
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      {message ? (
        <p
          className="text-sm text-muted-foreground max-w-md break-words"
          data-testid="error-state-message"
        >
          {message}
        </p>
      ) : null}
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-2 gap-2"
          data-testid="error-state-retry"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
