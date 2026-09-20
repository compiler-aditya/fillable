import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { AskTicket, NothingAvailable } from "../components/AskTicket";
import { CountsLine, Meter } from "../components/Availability";
import { ChangesFeed } from "../components/ChangesFeed";
import { PackageList } from "../components/PackageList";
import { Page } from "../components/SiteChrome";
import { Skeleton } from "../components/ui/skeleton";
import { relativeTime } from "../lib/format";
import { useNow } from "../lib/useNow";
import { cn } from "../lib/utils";

type Presentation = Doc<"presentations">;

function Workspace({
  drug,
  rows,
  askFor,
}: {
  drug: Doc<"drugs">;
  rows: Presentation[];
  askFor: Presentation | null;
}) {
  // Null means "no manual pick": follow the recommendation, including when a
  // live sync changes it. A manual pick is never overridden.
  const [selectedId, setSelectedId] = useState<Id<"presentations"> | null>(null);

  const selected = useMemo(
    () => rows.find((p) => p._id === selectedId) ?? askFor ?? null,
    [rows, selectedId, askFor],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <PackageList
        rows={rows}
        selectedId={selected?._id ?? null}
        onSelect={(p) => setSelectedId(p._id)}
      />
      <div className="lg:sticky lg:top-20">
        {selected ? <AskTicket drug={drug} presentation={selected} /> : <NothingAvailable drug={drug} />}
      </div>
    </div>
  );
}

export function Drug() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useQuery(api.drugs.detail, slug === undefined ? "skip" : { slug });
  const events = useQuery(
    api.events.forDrug,
    detail ? { drugId: detail.drug._id, limit: 12 } : "skip",
  );
  const now = useNow();

  if (detail === undefined) {
    return (
      <Page>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-20 pt-8 sm:px-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-12 w-full max-w-lg rounded-xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </Page>
    );
  }

  if (detail === null) {
    return (
      <Page>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            That medication isn&apos;t on the list
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If it isn&apos;t on the FDA shortage list, that usually means it&apos;s not in shortage.
          </p>
          <Link to="/" className="mt-6 inline-block text-sm font-medium text-primary underline">
            Back to shortages
          </Link>
        </div>
      </Page>
    );
  }

  const { drug, available, limited, unavailable, askFor } = detail;
  const rows = [...available, ...limited, ...unavailable];
  const none = drug.availableCount === 0;
  // Combination products publish every salt ("A; B; C; D") — noise next to the brand name.
  const showGeneric =
    drug.genericName !== drug.displayName &&
    !drug.genericName.includes(";") &&
    drug.genericName.length < 60;

  return (
    <Page>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-20 pt-8 sm:px-6">
        <div className="flex flex-col gap-6">
          <Link
            to="/#board"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All shortages
          </Link>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_340px] md:items-end lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <h1 className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                {drug.displayName}
              </h1>
              <p className="mt-3 text-base text-muted-foreground">
                {drug.brandNames.length > 0 && (
                  <>
                    Sold as{" "}
                    <span className="font-medium text-foreground">{drug.brandNames.slice(0, 4).join(", ")}</span>
                  </>
                )}
                {drug.dosageForm && (
                  <>
                    {drug.brandNames.length > 0 ? " · " : ""}
                    {drug.dosageForm.toLowerCase()}
                  </>
                )}
                {showGeneric && <> · {drug.genericName}</>}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="tnum">
                <span className={cn("font-display text-4xl font-bold", none ? "text-none" : "text-ok")}>
                  {drug.availableCount}
                </span>
                <span className="text-muted-foreground"> of {drug.presentationCount} packages available</span>
              </p>
              <Meter
                available={drug.availableCount}
                limited={drug.limitedCount}
                unavailable={drug.unavailableCount}
                size="lg"
                className="mt-3"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <CountsLine
                  available={drug.availableCount}
                  limited={drug.limitedCount}
                  unavailable={drug.unavailableCount}
                />
                {drug.lastChangedAt !== undefined && (
                  <p className="tnum shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    Changed {relativeTime(drug.lastChangedAt, now)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <Workspace key={drug._id} drug={drug} rows={rows} askFor={askFor} />

        {detail.truncated && (
          <p className="text-xs text-muted-foreground">
            Showing the first {rows.length} packages; this drug has more on the FDA list.
          </p>
        )}

        {(events === undefined || events.length > 0) && (
          <section aria-labelledby="history-title" className="max-w-2xl">
            <h2 id="history-title" className="font-display text-xl font-bold tracking-tight">
              Recent changes
            </h2>
            <div className="mt-3 rounded-2xl border border-border bg-card px-4">
              <ChangesFeed events={events} now={now} showDrug={false} />
            </div>
          </section>
        )}
      </div>
    </Page>
  );
}
