import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Doc } from "../../convex/_generated/dataModel";
import { relativeTime } from "../lib/format";
import { cn } from "../lib/utils";
import { Meter } from "./Availability";
import { Skeleton } from "./ui/skeleton";

type Filter = "split" | "fillable" | "none" | "all";

const FILTERS: Array<{ id: Filter; label: string; hint: string }> = [
  { id: "split", label: "Package matters", hint: "Both an available and an unavailable version exist" },
  { id: "fillable", label: "Something available", hint: "At least one package is reported available" },
  { id: "none", label: "Nothing available", hint: "No package of this drug is currently available" },
  { id: "all", label: "All tracked", hint: "Every medication on the FDA shortage list" },
];

function matches(d: Doc<"drugs">, f: Filter) {
  switch (f) {
    case "all":
      return true;
    case "split":
      return d.isSplit;
    case "fillable":
      return d.availableCount > 0;
    case "none":
      return d.availableCount === 0;
  }
}

export function BoardGrid({
  drugs,
  now,
}: {
  drugs: Doc<"drugs">[] | undefined;
  now: number;
}) {
  const [filter, setFilter] = useState<Filter>("split");

  const rows = useMemo(() => {
    if (drugs === undefined) return undefined;
    return drugs
      .filter((d) => matches(d, filter))
      .sort(
        (a, b) =>
          (b.lastChangedAt ?? 0) - (a.lastChangedAt ?? 0) ||
          b.presentationCount - a.presentationCount,
      );
  }, [drugs, filter]);

  return (
    <section id="board" aria-labelledby="board-title" className="scroll-mt-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="board-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Shortage board
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Medications currently in shortage, package by package.
          </p>
        </div>
        <div role="group" aria-label="Filter board" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              title={f.hint}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                filter === f.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows === undefined
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-40 w-full rounded-2xl" />
              </li>
            ))
          : rows.map((d) => (
              <li key={d._id}>
                <DrugCard drug={d} now={now} />
              </li>
            ))}
        {rows !== undefined && rows.length === 0 && (
          <li className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No medications match this filter.
          </li>
        )}
      </ul>
    </section>
  );
}

function DrugCard({ drug: d, now }: { drug: Doc<"drugs">; now: number }) {
  const none = d.availableCount === 0;
  return (
    <Link
      to={`/d/${d.slug}`}
      className="group flex h-full flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_30px_-16px_rgba(14,124,116,0.35)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold leading-tight tracking-tight">
            {d.displayName}
          </h3>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {d.brandNames.length > 0 ? d.brandNames.slice(0, 3).join(", ") : d.dosageForm ?? d.genericName}
          </p>
        </div>
        <ArrowUpRight
          className="size-5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="tnum text-sm">
            <span className={cn("font-display text-2xl font-bold", none ? "text-none" : "text-ok")}>
              {d.availableCount}
            </span>
            <span className="text-muted-foreground"> of {d.presentationCount} available</span>
          </p>
          {d.lastChangedAt !== undefined && (
            <p className="tnum text-xs text-muted-foreground">{relativeTime(d.lastChangedAt, now)}</p>
          )}
        </div>
        <Meter available={d.availableCount} limited={d.limitedCount} unavailable={d.unavailableCount} />
      </div>
    </Link>
  );
}
