import { useQuery } from "convex/react";
import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AvailabilityBar } from "../components/Availability";
import { Disagreements } from "../components/Disagreements";
import { Ticker } from "../components/Ticker";

function DrugCard({ drug }: { drug: Doc<"drugs"> }) {
  return (
    <Link
      to={`/d/${drug.slug}`}
      className="group block rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-text leading-snug truncate">
            {drug.displayName}
          </h3>
          {drug.brandNames.length > 0 && (
            <p className="mt-0.5 text-xs text-text-faint truncate">
              {drug.brandNames.slice(0, 2).join(" · ")}
            </p>
          )}
        </div>
        <ArrowRight className="size-4 shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-3">
        <AvailabilityBar
          available={drug.availableCount}
          limited={drug.limitedCount}
          unavailable={drug.unavailableCount}
        />
      </div>

      <p className="mt-2.5 text-xs text-text-muted tnum">
        <span className="text-good font-medium">{drug.availableCount}</span> you
        can get ·{" "}
        <span className="text-bad font-medium">{drug.unavailableCount}</span> you
        cannot
        {drug.limitedCount > 0 && (
          <>
            {" "}
            · <span className="text-warn font-medium">{drug.limitedCount}</span>{" "}
            limited
          </>
        )}
      </p>
    </Link>
  );
}

export function Board() {
  const [raw, setRaw] = useState("");
  const [term, setTerm] = useState("");

  // Debounced so every keystroke does not open a new subscription.
  useEffect(() => {
    const id = setTimeout(() => setTerm(raw.trim()), 180);
    return () => clearTimeout(id);
  }, [raw]);

  const stats = useQuery(api.stats.global, {});
  const board = useQuery(api.drugs.board, { limit: 24 });
  const results = useQuery(
    api.drugs.search,
    term.length >= 2 ? { q: term, limit: 24 } : "skip",
  );

  const searching = term.length >= 2;
  const shown = searching ? results : board;
  const loading = shown === undefined;

  const headline = useMemo(() => {
    if (stats === undefined || stats === null) return null;
    return {
      available: stats.availableInShortageCount,
      split: stats.splitDrugCount,
      packages: stats.totalPresentations,
      drugs: stats.drugCount,
    };
  }, [stats]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text text-balance">
          Your medication is “in shortage.”
          <br />
          <span className="text-accent">Some versions of it are in stock.</span>
        </h1>

        <p className="mt-3 max-w-2xl text-text-muted leading-relaxed">
          Shortages are reported per package, not per drug. The FDA publishes
          exactly which manufacturer&rsquo;s version is available, down to the NDC
          number — but almost nobody reads it at that depth, so people call a
          dozen pharmacies asking the wrong question.
        </p>

        {headline !== null && (
          <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "packages available inside a shortage",
                value: headline.available,
                accent: true,
              },
              { label: "drugs where the version matters", value: headline.split },
              { label: "packages tracked", value: headline.packages },
              { label: "medications", value: headline.drugs },
            ].map((s) => (
              <div
                key={s.label}
                className={`rounded-card border p-3 ${
                  s.accent
                    ? "border-good-border bg-good-bg"
                    : "border-border bg-surface"
                }`}
              >
                <dd
                  className={`text-2xl font-semibold tnum ${
                    s.accent ? "text-good" : "text-text"
                  }`}
                >
                  {s.value.toLocaleString()}
                </dd>
                <dt className="mt-0.5 text-xs leading-tight text-text-muted">
                  {s.label}
                </dt>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <label className="relative block">
          <span className="sr-only">Search for a medication</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-faint"
            aria-hidden="true"
          />
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            type="search"
            autoComplete="off"
            placeholder="Search by brand or generic name — try Adderall, Vyvanse, Ativan"
            className="w-full rounded-card border border-border bg-surface py-2.5 pl-9 pr-9 text-text placeholder:text-text-faint outline-none focus:border-accent"
          />
          {raw.length > 0 && (
            <button
              type="button"
              onClick={() => setRaw("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-faint hover:text-text"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-text">
            {searching
              ? `Results for “${term}”`
              : "Where knowing the exact package changes the answer"}
          </h2>
          {!searching && shown !== undefined && (
            <span className="text-xs text-text-faint tnum">
              {shown.length} shown
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[7.5rem] animate-pulse rounded-card border border-border bg-surface-2"
              />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-text-muted">
            {searching ? (
              <>
                Nothing matched “{term}”. That usually means this medication
                isn&rsquo;t currently on the FDA shortage list — which is good
                news.
              </>
            ) : (
              "No data loaded yet."
            )}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((d) => (
              <DrugCard key={d._id} drug={d} />
            ))}
          </div>
        )}
      </section>

      <Disagreements />

      <Ticker />
    </div>
  );
}
