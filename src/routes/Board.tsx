import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AppShell } from "../components/AppShell";
import { AvailabilityBar } from "../components/Availability";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { cn } from "../lib/utils";

type SortKey =
  | "displayName"
  | "availableCount"
  | "limitedCount"
  | "unavailableCount"
  | "presentationCount";

type Filter = "split" | "all" | "critical";

const FILTERS: Array<{ id: Filter; label: string; hint: string }> = [
  { id: "split", label: "Package matters", hint: "Both an available and an unavailable version exist" },
  { id: "critical", label: "Nothing available", hint: "No package of this drug is currently available" },
  { id: "all", label: "All tracked", hint: "Every medication on the FDA shortage list" },
];

function SortHeader({
  label,
  column,
  sort,
  dir,
  onSort,
  numeric,
}: {
  label: string;
  column: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  numeric?: boolean;
}) {
  const active = sort === column;
  return (
    <TableHead className={cn("h-8", numeric && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 text-xs transition-colors hover:text-foreground",
          active ? "font-medium text-foreground" : "text-muted-foreground",
          numeric && "flex-row-reverse",
        )}
      >
        {label}
        {active &&
          (dir === "asc" ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          ))}
      </button>
    </TableHead>
  );
}

export function Board() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("split");
  const [raw, setRaw] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<SortKey>("presentationCount");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const id = setTimeout(() => setTerm(raw.trim()), 170);
    return () => clearTimeout(id);
  }, [raw]);

  const all = useQuery(api.drugs.list, {
    splitOnly: filter === "split",
    limit: 300,
  });
  const found = useQuery(
    api.drugs.search,
    term.length >= 2 ? { q: term, limit: 60 } : "skip",
  );

  const searching = term.length >= 2;
  const source = searching ? found : all;

  const rows = useMemo(() => {
    if (source === undefined) return undefined;
    const filtered =
      filter === "critical" && !searching
        ? source.filter((d) => d.availableCount === 0)
        : source;

    const sorted = [...filtered].sort((a, b) => {
      const mul = dir === "asc" ? 1 : -1;
      if (sort === "displayName") {
        return mul * a.displayName.localeCompare(b.displayName);
      }
      return mul * ((a[sort] as number) - (b[sort] as number));
    });
    return sorted;
  }, [source, filter, sort, dir, searching]);

  const onSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "displayName" ? "asc" : "desc");
    }
  };

  return (
    <AppShell title="Shortages">
      <div className="space-y-3">
        {/* Toolbar: filter, find, count. Everything a table needs, one row. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  filter === f.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              type="search"
              aria-label="Filter medications"
              placeholder="Filter by name or brand…"
              className="h-8 pl-8 pr-8 text-xs"
            />
            {raw.length > 0 && (
              <button
                type="button"
                onClick={() => setRaw("")}
                aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {rows !== undefined && (
            <span className="tnum shrink-0 text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "medication" : "medications"}
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {rows === undefined ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="px-3 py-2.5">
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {searching
                  ? `Nothing matched “${term}”. That usually means this medication is not on the FDA shortage list.`
                  : "No medications match this filter."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHeader
                    label="Medication"
                    column="displayName"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                  />
                  <TableHead className="hidden h-8 text-xs text-muted-foreground sm:table-cell">
                    Distribution
                  </TableHead>
                  <SortHeader
                    label="Available"
                    column="availableCount"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    numeric
                  />
                  <SortHeader
                    label="Limited"
                    column="limitedCount"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    numeric
                  />
                  <SortHeader
                    label="Out"
                    column="unavailableCount"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    numeric
                  />
                  <SortHeader
                    label="Packages"
                    column="presentationCount"
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                    numeric
                  />
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((d: Doc<"drugs">) => (
                  <TableRow
                    key={d._id}
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/d/${d.slug}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/d/${d.slug}`);
                    }}
                    className="cursor-pointer"
                  >
                    <TableCell className="py-2">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[0.8125rem] font-medium">
                          {d.displayName}
                        </span>
                        {d.brandNames.length > 0 && (
                          <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">
                            {d.brandNames[0]}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden w-40 py-2 sm:table-cell">
                      <AvailabilityBar
                        available={d.availableCount}
                        limited={d.limitedCount}
                        unavailable={d.unavailableCount}
                      />
                    </TableCell>
                    <TableCell className="tnum py-2 text-right text-[0.8125rem]">
                      <span className={d.availableCount > 0 ? "text-ok" : "text-muted-foreground"}>
                        {d.availableCount}
                      </span>
                    </TableCell>
                    <TableCell className="tnum py-2 text-right text-[0.8125rem]">
                      <span className={d.limitedCount > 0 ? "text-low" : "text-muted-foreground"}>
                        {d.limitedCount}
                      </span>
                    </TableCell>
                    <TableCell className="tnum py-2 text-right text-[0.8125rem]">
                      <span className={d.unavailableCount > 0 ? "text-none" : "text-muted-foreground"}>
                        {d.unavailableCount}
                      </span>
                    </TableCell>
                    <TableCell className="tnum py-2 text-right text-[0.8125rem] text-muted-foreground">
                      {d.presentationCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Sorted by {sort === "displayName" ? "name" : sort.replace("Count", "")},{" "}
          {dir === "asc" ? "ascending" : "descending"}. Click a row to see which
          exact package to ask for.{" "}
          <Button
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => navigate("/conflicts")}
          >
            View source conflicts
          </Button>
        </p>
      </div>
    </AppShell>
  );
}
