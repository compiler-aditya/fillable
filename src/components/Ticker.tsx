import { useQuery } from "convex/react";
import { ArrowDownRight, ArrowUpRight, Minus, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { relativeTime } from "../lib/format";

const SEVERITY = {
  good: { cls: "text-good", Icon: ArrowUpRight },
  bad: { cls: "text-bad", Icon: ArrowDownRight },
  neutral: { cls: "text-text-faint", Icon: Minus },
} as const;

/**
 * The live feed of FDA changes.
 *
 * Subscribed, not polled: when a sweep writes a new event this list grows
 * without the reader doing anything. New rows are marked so the movement is
 * noticeable — the whole point is that the page is not a snapshot.
 */
export function Ticker({ limit = 12 }: { limit?: number }) {
  const events = useQuery(api.events.recent, { limit });

  // Wall clock lives here rather than in the query: a query is not rerun as
  // time passes, so a timestamp computed server-side would silently go stale.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Track which ids are newly arrived so they can be flashed once.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (events === undefined) return;
    const ids = new Set(events.map((e) => e._id));
    if (seen.current === null) {
      // First render is not "new" — everything would flash at once.
      seen.current = ids;
      return;
    }
    const added = [...ids].filter((id) => !seen.current!.has(id));
    seen.current = ids;
    if (added.length > 0) setFresh(new Set(added));
  }, [events]);

  if (events === undefined || events.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-text">
        <Radio className="size-3.5 text-accent" aria-hidden="true" />
        What the FDA changed recently
      </h2>

      <ul
        className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface"
        aria-live="polite"
      >
        {events.map((e) => {
          const { cls, Icon } = SEVERITY[e.severity];
          return (
            <li
              key={e._id}
              className={`flex items-start gap-2.5 px-4 py-2.5 text-sm ${
                fresh.has(e._id) ? "flash" : ""
              }`}
            >
              <Icon
                className={`mt-0.5 size-3.5 shrink-0 ${cls}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 text-text-muted">{e.summary}</span>
              <time
                className="shrink-0 text-xs text-text-faint tnum"
                dateTime={new Date(e.occurredAt).toISOString()}
              >
                {relativeTime(e.occurredAt, now)}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
