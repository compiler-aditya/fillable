import { useQuery } from "convex/react";
import { ArrowDownRight, ArrowUpRight, Dot, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { relativeTime } from "../lib/format";
import { cn } from "../lib/utils";
import { Card } from "./ui/card";

const TONE = {
  good: { cls: "text-ok", Icon: ArrowUpRight },
  bad: { cls: "text-none", Icon: ArrowDownRight },
  neutral: { cls: "text-muted-foreground", Icon: Dot },
} as const;

/**
 * The live feed of FDA changes.
 *
 * Subscribed, not polled — when a sweep writes an event this list grows without
 * the reader doing anything. New rows flash once so the movement is noticed;
 * the page is not a snapshot.
 */
export function Ticker({ limit = 10 }: { limit?: number }) {
  const events = useQuery(api.events.recent, { limit });

  // The clock lives here, not in the query: a Convex query is not rerun as time
  // passes, so a server-computed "3m ago" would quietly go stale.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (events === undefined) return;
    const ids = new Set(events.map((e) => e._id));
    if (seen.current === null) {
      // First paint is not "new" — everything would flash at once.
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
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Radio className="size-3.5 text-primary" aria-hidden="true" />
        Recent FDA changes
      </h2>

      <Card className="divide-y divide-border overflow-hidden p-0" aria-live="polite">
        {events.map((e) => {
          const { cls, Icon } = TONE[e.severity];
          return (
            <div
              key={e._id}
              className={cn(
                "flex items-start gap-2.5 px-4 py-2.5",
                fresh.has(e._id) && "flash",
              )}
            >
              <Icon
                className={cn("mt-0.5 size-3.5 shrink-0", cls)}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 text-sm leading-snug text-muted-foreground">
                {e.summary}
              </span>
              <time
                className="tnum shrink-0 text-xs text-muted-foreground"
                dateTime={new Date(e.occurredAt).toISOString()}
              >
                {relativeTime(e.occurredAt, now)}
              </time>
            </div>
          );
        })}
      </Card>
    </section>
  );
}
