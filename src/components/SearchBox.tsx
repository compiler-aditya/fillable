import { useQuery } from "convex/react";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { cn } from "../lib/utils";
import { Meter } from "./Availability";

/** Brand first: "Adderall" is what people type, not the four-salt generic. */
const chipLabel = (d: Doc<"drugs">) => d.brandNames[0] ?? d.displayName;

export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const listId = useId();
  const [raw, setRaw] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setTerm(raw.trim()), 150);
    return () => clearTimeout(id);
  }, [raw]);

  const searching = term.length >= 2;
  const found = useQuery(api.drugs.search, searching ? { q: term, limit: 6 } : "skip");
  const popular = useQuery(api.drugs.suggestions, { limit: 5 });

  const results = searching ? (found ?? []) : [];
  const showList = open && searching;
  const loading = searching && found === undefined;

  const go = (d: Doc<"drugs">) => {
    setOpen(false);
    navigate(`/d/${d.slug}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const hit = results[active];
      if (hit) go(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="w-full">
      <div className="relative">
        <div
          className={cn(
            "flex h-16 items-center gap-3 rounded-full border-2 border-border bg-card pl-5 pr-2 shadow-[0_8px_30px_-12px_rgba(30,42,43,0.18)] transition-colors",
            "focus-within:border-primary",
          )}
        >
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              showList && results[active] ? `${listId}-${results[active]._id}` : undefined
            }
            aria-label="Search medications by brand or generic name"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="Search a medication…"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => results[active] && go(results[active])}
            disabled={!results[active]}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Check
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>

        {showList && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-2 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-left shadow-xl"
          >
            {loading ? (
              <li className="px-4 py-4 text-sm text-muted-foreground">Searching…</li>
            ) : results.length === 0 ? (
              <li className="px-4 py-4 text-sm text-muted-foreground">
                Nothing matched &ldquo;{term}&rdquo;. It may not be on the FDA shortage list — usually
                good news.
              </li>
            ) : (
              results.map((d, i) => (
                <li
                  key={d._id}
                  id={`${listId}-${d._id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(d)}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 rounded-xl px-3 py-2.5",
                    i === active && "bg-muted",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {d.displayName}
                      {d.brandNames.length > 0 && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {d.brandNames.slice(0, 3).join(", ")}
                        </span>
                      )}
                    </p>
                    <p className="tnum mt-0.5 text-xs text-muted-foreground">
                      {d.availableCount} of {d.presentationCount} packages available
                    </p>
                  </div>
                  <Meter
                    available={d.availableCount}
                    limited={d.limitedCount}
                    unavailable={d.unavailableCount}
                    size="sm"
                    className="w-20"
                  />
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {popular !== undefined && popular.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">Popular:</span>
          {popular.map((d) => (
            <button
              key={d._id}
              type="button"
              onClick={() => go(d)}
              className="rounded-full border border-border bg-card px-3 py-1 font-medium transition-colors hover:border-primary hover:text-primary"
            >
              {chipLabel(d)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
