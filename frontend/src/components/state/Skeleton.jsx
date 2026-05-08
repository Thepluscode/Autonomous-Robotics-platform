import React from "react";
import { cn } from "@/lib/utils";

/**
 * Pulsing placeholder block. Use it in the same shape and rough size as
 * the real content that's about to land — that's the whole reason
 * skeletons feel less janky than spinners on content-heavy surfaces.
 *
 * SkeletonRow / SkeletonCard are the two preset shapes most pages need;
 * use the bare Skeleton for one-offs (table cells, badges, etc.).
 */
export function Skeleton({ className, "data-testid": testId = "skeleton", ...rest }) {
  return (
    <div
      className={cn("animate-pulse bg-muted rounded-md", className)}
      data-testid={testId}
      aria-hidden="true"
      {...rest}
    />
  );
}

export function SkeletonRow({ count = 3, className }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="skeleton-rows">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 flex flex-col gap-3",
        className
      )}
      data-testid="skeleton-card"
    >
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-24 w-full mt-2" />
    </div>
  );
}

export default Skeleton;
