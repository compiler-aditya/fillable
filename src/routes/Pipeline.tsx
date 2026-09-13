import { useQuery } from "convex/react";
import { CircleCheck, CircleSlash, Loader } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { relativeTime } from "../lib/format";

const SOURCE_LABEL: Record<string, string> = {
  openfda_delta: "openFDA · recently updated",
  openfda_full: "openFDA · full sweep",
  fda_page: "FDA website · changefeed",
  ashp_changefeed: "ASHP · changefeed",
  ashp_full: "ASHP · full sweep",
  fda_detail: "FDA website · drug detail",
};

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
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Live data
        </h1>
        <p className="mt-2 max-w-2xl text-text-muted leading-relaxed">
          Every number on this site comes from a scheduled job reading the FDA.
          This page shows those jobs as they run — the counters below move while
          a sweep is in flight, without reloading.
        </p>
      </div>

      {stats !== undefined && stats !== null && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "packages tracked", value: stats.totalPresentations.toLocaleString() },
            { label: "medications", value: stats.drugCount.toLocaleString() },
            {
              label: "FDA data dated",
              value: stats.fdaApiLastUpdated ?? "unknown",
            },
            {
              label: "last sync",
              value:
                stats.lastSyncAt === undefined
                  ? "never"
                  : relativeTime(stats.lastSyncAt, now),
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-card border border-border bg-surface p-3"
            >
              <dd className="text-lg font-semibold text-text tnum">{s.value}</dd>
              <dt className="mt-0.5 text-xs text-text-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}

      {running !== undefined && running.length > 0 && (
        <section className="rounded-card border border-accent bg-accent-bg p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            <Loader className="size-4 animate-spin" aria-hidden="true" />
            A sweep is running now
          </p>
          <ul className="mt-2 space-y-1 text-sm text-text-muted tnum">
            {running.map((r) => (
              <li key={r._id}>
                {SOURCE_LABEL[r.source] ?? r.source} —{" "}
                <strong className="text-text">{r.recordsSeen.toLocaleString()}</strong>{" "}
                records read so far
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-text">Recent runs</h2>

        {runs === undefined ? (
          <div className="h-48 animate-pulse rounded-card border border-border bg-surface-2" />
        ) : runs.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-text-muted">
            No syncs have run yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-faint">
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium text-right">Read</th>
                  <th className="px-4 py-2.5 font-medium text-right">Changed</th>
                  <th className="px-4 py-2.5 font-medium text-right">Events</th>
                  <th className="px-4 py-2.5 font-medium text-right">Took</th>
                  <th className="px-4 py-2.5 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => {
                  const took =
                    r.finishedAt === undefined
                      ? null
                      : `${((r.finishedAt - r.startedAt) / 1000).toFixed(1)}s`;
                  return (
                    <tr key={r._id}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {r.state === "ok" ? (
                            <CircleCheck
                              className="size-3.5 text-good"
                              aria-label="succeeded"
                            />
                          ) : r.state === "error" ? (
                            <CircleSlash
                              className="size-3.5 text-bad"
                              aria-label="failed"
                            />
                          ) : (
                            <Loader
                              className="size-3.5 animate-spin text-accent"
                              aria-label="running"
                            />
                          )}
                          <span className="text-text">
                            {SOURCE_LABEL[r.source] ?? r.source}
                          </span>
                        </span>
                        {r.error !== undefined && (
                          <p className="mt-1 text-xs text-bad">{r.error}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-muted tnum">
                        {r.recordsSeen.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tnum">
                        <span
                          className={
                            r.recordsChanged > 0 ? "text-text" : "text-text-faint"
                          }
                        >
                          {r.recordsChanged.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tnum">
                        <span
                          className={
                            r.eventsEmitted > 0 ? "text-text" : "text-text-faint"
                          }
                        >
                          {r.eventsEmitted.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-faint tnum">
                        {took ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-faint tnum">
                        {relativeTime(r.startedAt, now)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-text-faint max-w-2xl">
          A run that reads every record and changes nothing is the normal case,
          not a failure. Most FDA updates are reverifications where the agency
          re-checked a package and nothing moved — those are deliberately not
          treated as changes, so this feed stays meaningful.
        </p>
      </section>
    </div>
  );
}
