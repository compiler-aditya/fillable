import type { Doc } from "../../convex/_generated/dataModel";
import { AVAILABILITY_LABEL, stateLabel, type Availability } from "../lib/format";
import { cn } from "../lib/utils";

const DOT: Record<Availability, string> = {
  available: "bg-ok",
  limited: "bg-low",
  unavailable: "bg-none",
  unknown: "bg-unknown",
};

const PILL: Record<Availability, string> = {
  available: "bg-ok-surface text-ok-foreground",
  limited: "bg-low-surface text-low-foreground",
  unavailable: "bg-none-surface text-none-foreground",
  unknown: "bg-muted text-muted-foreground",
};

/**
 * Availability pill: dot plus word, never colour alone — this is read on a
 * phone, in a pharmacy, by people who may be colour blind.
 */
export function StatusPill({
  availability,
  label,
  className,
}: {
  availability: Availability;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        PILL[availability],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[availability])} aria-hidden="true" />
      {label ?? AVAILABILITY_LABEL[availability]}
    </span>
  );
}

export function AvailabilityBadge({
  presentation,
  className,
}: {
  presentation: Doc<"presentations">;
  className?: string;
}) {
  return (
    <StatusPill
      availability={presentation.availability}
      label={stateLabel(presentation)}
      className={className}
    />
  );
}

/**
 * Segmented meter: one rounded bar split by count. Reads at a glance whether
 * a drug has anything fillable without parsing numbers.
 */
export function Meter({
  available,
  limited,
  unavailable,
  className,
  size = "md",
}: {
  available: number;
  limited: number;
  unavailable: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const total = Math.max(1, available + limited + unavailable);
  const h = size === "lg" ? "h-3" : size === "sm" ? "h-1.5" : "h-2";
  const segments: Array<[number, string]> = [
    [available, "bg-ok"],
    [limited, "bg-low"],
    [unavailable, "bg-none"],
  ];
  return (
    <div
      role="img"
      aria-label={`${available} available, ${limited} limited, ${unavailable} unavailable`}
      className={cn("flex w-full gap-0.5 overflow-hidden rounded-full bg-muted", h, className)}
    >
      {segments.map(([n, color], i) =>
        n > 0 ? (
          <span key={i} className={cn("h-full", color)} style={{ width: `${(n / total) * 100}%` }} />
        ) : null,
      )}
    </div>
  );
}

/** Kept for the analyst routes; same meter, thin. */
export function AvailabilityBar(props: {
  available: number;
  limited: number;
  unavailable: number;
  className?: string;
}) {
  if (props.available + props.limited + props.unavailable === 0) return null;
  return <Meter {...props} size="sm" />;
}

export function CountsLine({
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
  const parts = [
    { n: available, label: "available", dot: DOT.available },
    { n: limited, label: "limited", dot: DOT.limited },
    { n: unavailable, label: "unavailable", dot: DOT.unavailable },
  ].filter((p) => p.n > 0);
  return (
    <p
      className={cn(
        "tnum flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
    >
      {parts.map((p) => (
        <span key={p.label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", p.dot)} aria-hidden="true" />
          <span className="font-semibold text-foreground">{p.n}</span> {p.label}
        </span>
      ))}
    </p>
  );
}

export const AvailabilityCounts = CountsLine;
