import React from "react";
import { cn } from "@/lib/utils";

/**
 * Uniform "this collection is empty" treatment.
 *
 * Use this whenever a fetch completed successfully but returned zero
 * items. An empty section without an EmptyState is indistinguishable
 * from a silent failure to the user — that ambiguity is exactly what
 * caused last quarter's "the dashboard is broken" support pings when
 * in fact the seed step had been skipped.
 *
 * Pass `icon` as a Lucide icon component (or any React node), `title`
 * for the headline, `description` for the explanatory copy, and an
 * optional `action` node (a Button) for the next step the user can take.
 */
export default function EmptyState({
  icon: Icon,
  title = "Nothing here yet",
  description,
  action,
  className,
  "data-testid": testId = "empty-state",
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 px-6 text-center",
        className
      )}
      data-testid={testId}
    >
      {Icon ? (
        <div
          className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
          data-testid="empty-state-icon"
        >
          {React.isValidElement(Icon) ? Icon : <Icon className="w-6 h-6" aria-hidden="true" />}
        </div>
      ) : null}
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      ) : null}
      {action ? <div className="mt-2" data-testid="empty-state-action">{action}</div> : null}
    </div>
  );
}
