import { useQuery } from "convex/react";
import { CircleCheck, CircleSlash, Loader } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { AppShell } from "../components/AppShell";
import { Ticker } from "../components/Ticker";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { relativeTime } from "../lib/format";

const SOURCE_LABEL: Record<string, string> = {
  openfda_delta: "openFDA · recently updated",
  openfda_full: "openFDA · full sweep",
  fda_page: "FDA site · changefeed",
  ashp_changefeed: "ASHP · changefeed",
  ashp_full: "ASHP · full sweep",
  fda_detail: "FDA site · drug detail",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-0 p-4">
      <p className="tnum text-xl font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

export function Pipeline() {
  const runs = useQuery(api.pipeline.recentRuns, { limit: 20 });
  const running = useQuery(api.pipeline.running, {});
  const stats = useQuery(api.stats.global, {});

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <AppShell title="Pipeline">
    <div className="space-y-5">
      <div>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Every number on this site comes from a scheduled job reading the FDA
          and ASHP. This page shows those jobs as they run — the counters move
          while a sweep is in flight, without reloading.
        </p>
      </div>

      {stats !== undefined && stats !== null && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label="packages tracked"
            value={stats.totalPresentations.toLocaleString()}
          />
          <Stat label="medications" value={stats.drugCount.toLocaleString()} />
          <Stat
            label="Firecrawl credits today"
            value={stats.firecrawlCreditsUsedToday.toLocaleString()}
          />
          <Stat
            label="last sync"
            value={
              stats.lastSyncAt === undefined
                ? "never"
                : relativeTime(stats.lastSyncAt, now)
            }
          />
        </div>
      )}

      {running !== undefined && running.length > 0 && (
        <Card className="gap-0 border-primary/40 bg-accent p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
            <Loader className="size-4 animate-spin" aria-hidden="true" />
            A sweep is running now
          </p>
          <ul className="tnum mt-2 space-y-1 text-sm text-muted-foreground">
            {running.map((r) => (
              <li key={r._id}>
                {SOURCE_LABEL[r.source] ?? r.source} —{" "}
                <strong className="font-semibold text-foreground">
                  {r.recordsSeen.toLocaleString()}
                </strong>{" "}
                records read so far
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium">Recent runs</h2>

        {runs === undefined ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : runs.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No syncs have run yet.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Read</TableHead>
                    <TableHead className="text-right">Changed</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Took</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="max-w-[16rem] align-top">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          {r.state === "ok" ? (
                            <CircleCheck
                              className="size-3.5 text-ok"
                              aria-label="succeeded"
                            />
                          ) : r.state === "error" ? (
                            <CircleSlash
                              className="size-3.5 text-none"
                              aria-label="failed"
                            />
                          ) : (
                            <Loader
                              className="size-3.5 animate-spin text-primary"
                              aria-label="running"
                            />
                          )}
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </span>
                        {r.error !== undefined && (
                          /* Raw provider errors arrive as unwrapped JSON. Without
                             a width bound and a wrap, one 503 body stretched this
                             column to 1166px inside a 736px card and pushed every
                             numeric column off screen. */
                          <p className="mt-1 line-clamp-2 break-words text-xs text-none">
                            {r.error}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="tnum text-right text-muted-foreground">
                        {r.recordsSeen.toLocaleString()}
                      </TableCell>
                      <TableCell className="tnum text-right">
                        <span
                          className={
                            r.recordsChanged > 0 ? "" : "text-muted-foreground"
                          }
                        >
                          {r.recordsChanged.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="tnum text-right">
                        <span
                          className={
                            r.eventsEmitted > 0 ? "" : "text-muted-foreground"
                          }
                        >
                          {r.eventsEmitted.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="tnum text-right text-muted-foreground">
                        {r.finishedAt === undefined
                          ? "—"
                          : `${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s`}
                      </TableCell>
                      <TableCell className="tnum whitespace-nowrap text-right text-muted-foreground">
                        {relativeTime(r.startedAt, now)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
            </Table>
          </Card>
        )}

        <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
          A run that reads every record and changes nothing is the normal case,
          not a failure. Most FDA updates are reverifications where the agency
          re-checked a package and nothing moved — those are deliberately not
          treated as changes, so this feed stays meaningful.
        </p>
      </section>
      <Ticker />
    </div>
    </AppShell>
  );
}
