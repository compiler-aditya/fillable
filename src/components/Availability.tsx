import { Check, CircleSlash, Minus, TriangleAlert } from "lucide-react";
import type { Doc } from "../../convex/_generated/dataModel";
import { cn } from "../lib/utils";
import { stateLabel, type Availability } from "../lib/format";

const TONE: Record<Availability, { cls: string; Icon: typeof Check }> = {
  available: {
    cls: "bg-ok-surface text-ok border-ok-border",
    Icon: Check,
  },
  limited: {
    cls: "bg-low-surface text-low border-low-border",
    Icon: TriangleAlert,
  },
  unavailable: {
    cls: "bg-none-surface text-none border-none-border",
    Icon: CircleSlash,
  },
  unknown: {
    cls: "bg-muted text-muted-foreground border-border",
    Icon: Minus,
  },
};

/**
 * Availability pill.
 *
 * Icon plus word, never colour alone — this is read on a phone, in a pharmacy,
 * by people who may be colour blind or looking at a bad screen in bad light.
 */
export function AvailabilityBadge({
  presentation,
  className,
}: {
  presentation: Doc<"presentations">;
  className?: string;
}) {
  const { cls, Icon } = TONE[presentation.availability];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        cls,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {stateLabel(presentation)}
    </span>
  );
}

/**
 * Proportional split of a drug's packages.
 *
 * Deliberately thin and quiet. It is a supporting glance, not the answer — the
 * answer is the NDC on the drug page.
 */
export function AvailabilityBar({
  available,
  limited,
  unavailable,
  className,
}: {
  available: number;
  limited: number;
  unavailable: number;
  className?: string;
}) {
  const total = available + limited + unavailable;
  if (total === 0) return null;
  const pct = (n: number) => `${((n / total) * 100).toFixed(2)}%`;

  return (
    <div
      className={cn(
        "flex h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      role="img"
      aria-label={`${available} available, ${limited} limited, ${unavailable} unavailable of ${total} packages`}
    >
      {available > 0 && <div style={{ width: pct(available) }} className="bg-ok" />}
      {limited > 0 && <div style={{ width: pct(limited) }} className="bg-low" />}
      {unavailable > 0 && (
        <div style={{ width: pct(unavailable) }} className="bg-none" />
      )}
    </div>
  );
}

/** Compact "44 · 9 · 20" count row that pairs with the bar. */
export function AvailabilityCounts({
  available,
  limited,
  unavailable,
}: {
  available: number;
  limited: number;
  unavailable: number;
}) {
  return (
    <p className="tnum text-xs text-muted-foreground">
      <span className="font-medium text-ok">{available}</span> available
      {limited > 0 && (
        <>
          {" · "}
          <span className="font-medium text-low">{limited}</span> limited
        </>
      )}
      {unavailable > 0 && (
        <>
          {" · "}
          <span className="font-medium text-none">{unavailable}</span> out
        </>
      )}
    </p>
  );
}
