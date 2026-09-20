import { useMemo, useState } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { shortPresentation, stateLabel, type Availability } from "../lib/format";
import { cn } from "../lib/utils";
import { StatusPill } from "./Availability";

type Presentation = Doc<"presentations">;
type Tab = "all" | Availability;

const ORDER: Record<Availability, number> = { available: 0, limited: 1, unavailable: 2, unknown: 3 };

export function PackageList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: Presentation[];
  selectedId: Id<"presentations"> | null;
  onSelect: (p: Presentation) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      available: rows.filter((r) => r.availability === "available").length,
      limited: rows.filter((r) => r.availability === "limited").length,
      unavailable: rows.filter((r) => r.availability === "unavailable").length,
    }),
    [rows],
  );

  const visible = useMemo(
    () =>
      rows
        .filter((r) => tab === "all" || r.availability === tab)
        .sort(
          (a, b) =>
            ORDER[a.availability] - ORDER[b.availability] || a.companyName.localeCompare(b.companyName),
        ),
    [rows, tab],
  );

  const TABS: Array<{ id: Tab; label: string; n: number }> = [
    { id: "all", label: "All", n: counts.all },
    { id: "available", label: "Available", n: counts.available },
    { id: "limited", label: "Limited", n: counts.limited },
    { id: "unavailable", label: "Unavailable", n: counts.unavailable },
  ];

  return (
    <section aria-labelledby="packages-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h2 id="packages-title" className="font-display text-xl font-bold tracking-tight">
          Every package on the FDA list
        </h2>
        <div role="tablist" aria-label="Filter packages" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "tnum shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                tab === t.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className="opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Tap a package to load it into the ticket. Pharmacies order by package, so asking by NDC is what
        gets results.
      </p>

      <ul className="overflow-hidden rounded-2xl border border-border bg-card">
        {visible.map((p) => {
          const selected = p._id === selectedId;
          return (
            <li key={p._id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(p)}
                aria-pressed={selected}
                className={cn(
                  "grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[1fr_auto_auto]",
                  selected && "bg-accent/60 hover:bg-accent/60",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{shortPresentation(p.presentationText)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.companyName}
                    {p.recoveryDateText ? ` · back ${p.recoveryDateText}` : ""}
                  </p>
                </div>
                <p className="tnum order-3 col-span-2 text-xs text-muted-foreground sm:order-none sm:col-span-1 sm:text-sm sm:text-foreground/80">
                  {p.packageNdc}
                </p>
                <StatusPill availability={p.availability} label={stateLabel(p)} />
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">No packages in this group.</li>
        )}
      </ul>
    </section>
  );
}
