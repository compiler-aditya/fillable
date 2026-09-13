import { CircleAlert, CircleCheck, CircleMinus, CircleSlash } from "lucide-react";
import type { Doc } from "../../convex/_generated/dataModel";
import { stateLabel, type Availability } from "../lib/format";

const STYLES: Record<Availability, { cls: string; Icon: typeof CircleCheck }> = {
  available: {
    cls: "bg-good-bg text-good border-good-border",
    Icon: CircleCheck,
  },
  limited: { cls: "bg-warn-bg text-warn border-warn-border", Icon: CircleAlert },
  unavailable: { cls: "bg-bad-bg text-bad border-bad-border", Icon: CircleSlash },
  unknown: {
    cls: "bg-surface-2 text-text-muted border-border",
    Icon: CircleMinus,
  },
};

/**
 * Availability badge.
 *
 * Always icon + word, never colour alone — this has to survive colour blindness
 * and a bad phone screen in a pharmacy queue.
 */
export function AvailabilityBadge({
  presentation,
  className = "",
}: {
  presentation: Doc<"presentations">;
  className?: string;
}) {
  const { cls, Icon } = STYLES[presentation.availability];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls} ${className}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {stateLabel(presentation)}
    </span>
  );
}

/** Proportional bar of a drug's packages by state. */
export function AvailabilityBar({
  available,
  limited,
  unavailable,
}: {
  available: number;
  limited: number;
  unavailable: number;
}) {
  const total = available + limited + unavailable;
  if (total === 0) return null;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      role="img"
      aria-label={`${available} available, ${limited} limited, ${unavailable} unavailable of ${total} packages`}
    >
      {available > 0 && (
        <div style={{ width: pct(available) }} className="bg-good" />
      )}
      {limited > 0 && <div style={{ width: pct(limited) }} className="bg-warn" />}
      {unavailable > 0 && (
        <div style={{ width: pct(unavailable) }} className="bg-bad" />
      )}
    </div>
  );
}
