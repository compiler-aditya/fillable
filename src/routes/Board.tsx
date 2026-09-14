import { useQuery } from "convex/react";
import { ChevronRight, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AvailabilityBar, AvailabilityCounts } from "../components/Availability";
import { Disagreements } from "../components/Disagreements";
import { Ticker } from "../components/Ticker";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";

function DrugRow({ drug }: { drug: Doc<"drugs"> }) {
  return (
    <Link
      to={`/d/${drug.slug}`}
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-sm font-medium">{drug.displayName}</h3>
          {drug.brandNames.length > 0 && (
            <span className="shrink-0 truncate text-xs text-muted-foreground">
              {drug.brandNames[0]}
            </span>
          )}
        </div>
        <div className="mt-2 max-w-56">
          <AvailabilityBar
            available={drug.availableCount}
            limited={drug.limitedCount}
            unavailable={drug.unavailableCount}
          />
        </div>
        <div className="mt-1.5">
          <AvailabilityCounts
            available={drug.availableCount}
            limited={drug.limitedCount}
            unavailable={drug.unavailableCount}
          />
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function Board() {
  const [raw, setRaw] = useState("");
  const [term, setTerm] = useState("");

  // Debounced so a keystroke does not open a new subscription each time.
  useEffect(() => {
    const id = setTimeout(() => setTerm(raw.trim()), 180);
    return () => clearTimeout(id);
  }, [raw]);

  const stats = useQuery(api.stats.global, {});
  const board = useQuery(api.drugs.board, { limit: 40 });
  const results = useQuery(
    api.drugs.search,
    term.length >= 2 ? { q: term, limit: 40 } : "skip",
  );

  const searching = term.length >= 2;
  const shown = searching ? results : board;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-pretty text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
          Your medication is &ldquo;in shortage.&rdquo;
          <br />
          <span className="text-primary">Some versions are in stock.</span>
        </h1>

        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">
          Shortages are reported per package, not per drug. The FDA publishes
          which manufacturer&rsquo;s version is available down to the NDC number.
          Find yours, and ask for it by number.
        </p>

        {/* The primary action, directly under the claim rather than below a
            wall of statistics — searching is why anyone opens this. */}
        <div className="relative mt-6">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            type="search"
            autoComplete="off"
            aria-label="Search for a medication"
            placeholder="Search a medication — Adderall, Vyvanse, Ativan…"
            className="h-12 rounded-xl pl-10 pr-10 text-base shadow-sm"
          />
          {raw.length > 0 && (
            <button
              type="button"
              onClick={() => setRaw("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {stats !== undefined && stats !== null && (
          <p className="tnum mt-4 text-sm text-muted-foreground">
            <strong className="font-semibold text-ok">
              {stats.availableInShortageCount.toLocaleString()}
            </strong>{" "}
            of {stats.totalPresentations.toLocaleString()} tracked packages are
            available right now inside drugs the FDA lists as in shortage.{" "}
            <strong className="font-semibold text-foreground">
              {stats.splitDrugCount}
            </strong>{" "}
            medications have both a version you can get and one you cannot.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">
            {searching
              ? `Results for “${term}”`
              : "Where the exact package changes the answer"}
          </h2>
          {shown !== undefined && shown.length > 0 && (
            <span className="tnum text-xs text-muted-foreground">
              {shown.length}
            </span>
          )}
        </div>

        {shown === undefined ? (
          <Card className="divide-y divide-border overflow-hidden p-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 px-4 py-3.5">
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-1 w-56" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </Card>
        ) : shown.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {searching ? (
                <>
                  Nothing matched &ldquo;{term}&rdquo;. That usually means this
                  medication isn&rsquo;t on the FDA shortage list — which is good
                  news.
                </>
              ) : (
                "No data loaded yet."
              )}
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border overflow-hidden p-0">
            {shown.map((d) => (
              <DrugRow key={d._id} drug={d} />
            ))}
          </Card>
        )}
      </section>

      <Disagreements />
      <Ticker />
    </div>
  );
}
