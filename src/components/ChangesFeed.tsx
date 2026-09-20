import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { relativeTime } from "../lib/format";
import { cn } from "../lib/utils";
import { Skeleton } from "./ui/skeleton";

type Event = Doc<"statusEvents">;

const SOURCE: Record<Event["source"], string> = {
  openfda: "FDA",
  fda_page: "FDA",
  ashp: "ASHP",
  crowd: "Community",
};

function SeverityIcon({ severity }: { severity: Event["severity"] }) {
  const base = "flex size-7 shrink-0 items-center justify-center rounded-full";
  if (severity === "good")
    return (
      <span className={cn(base, "bg-ok-surface text-ok-foreground")}>
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </span>
    );
  if (severity === "bad")
    return (
      <span className={cn(base, "bg-none-surface text-none-foreground")}>
        <ArrowDownRight className="size-4" aria-hidden="true" />
      </span>
    );
  return (
    <span className={cn(base, "bg-muted text-muted-foreground")}>
      <Minus className="size-4" aria-hidden="true" />
    </span>
  );
}

export function ChangesFeed({
  events,
  drugsById,
  now,
  showDrug = true,
}: {
  events: Event[] | undefined;
  drugsById?: Map<Id<"drugs">, Doc<"drugs">>;
  now: number;
  showDrug?: boolean;
}) {
  if (events === undefined) {
    return (
      <div className="flex flex-col gap-3 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (events.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No changes recorded yet.</p>;
  }
  return (
    <ol className="flex flex-col divide-y divide-border">
      {events.map((e) => {
        const drug = drugsById?.get(e.drugId);
        return (
          <li key={e._id} className="flex gap-3 py-3">
            <SeverityIcon severity={e.severity} />
            <div className="min-w-0 flex-1">
              {showDrug && drug && (
                <Link
                  to={`/d/${drug.slug}`}
                  className="text-sm font-semibold hover:text-primary hover:underline"
                >
                  {drug.displayName}
                </Link>
              )}
              <p className="text-pretty text-sm leading-relaxed text-foreground/90">{e.summary}</p>
              <p className="tnum mt-1 text-xs text-muted-foreground">
                {SOURCE[e.source]} · {relativeTime(e.occurredAt, now)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
