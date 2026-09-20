import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { BoardGrid } from "../components/BoardGrid";
import { ChangesFeed } from "../components/ChangesFeed";
import { SearchBox } from "../components/SearchBox";
import { Page } from "../components/SiteChrome";
import { relativeTime } from "../lib/format";
import { useNow } from "../lib/useNow";

export function Board() {
  const now = useNow();
  const drugs = useQuery(api.drugs.list, { limit: 400 });
  const events = useQuery(api.events.recent, { limit: 8 });
  const stats = useQuery(api.stats.global, {});

  const drugsById = useMemo(() => {
    const m = new Map<Id<"drugs">, Doc<"drugs">>();
    for (const d of drugs ?? []) m.set(d._id, d);
    return m;
  }, [drugs]);

  return (
    <Page showSearch={false}>
      <section className="hero-wash">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pb-14 pt-14 text-center sm:px-6 sm:pt-20">
          <h1 className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Which package can your pharmacy actually fill?
          </h1>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Shortages are reported package by package. Search your medication and we&apos;ll show the
            exact packages manufacturers say are available — so you can ask for one by name.
          </p>
          <div className="w-full max-w-2xl">
            <SearchBox />
          </div>
          {stats && (
            <p className="tnum text-xs text-muted-foreground">
              {stats.drugCount} medications · {stats.availableInShortageCount.toLocaleString()} packages
              available inside active shortages
              {stats.lastSyncAt !== undefined && <> · synced {relativeTime(stats.lastSyncAt, now)}</>}
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <BoardGrid drugs={drugs} now={now} />

        <aside id="changes" aria-labelledby="changes-title" className="scroll-mt-20 lg:pt-1">
          <h2 id="changes-title" className="font-display text-xl font-bold tracking-tight">
            What changed
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest status updates from the FDA and ASHP.</p>
          <div className="mt-4 rounded-2xl border border-border bg-card px-4">
            <ChangesFeed events={events} drugsById={drugsById} now={now} />
          </div>
        </aside>
      </div>

      <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-t border-border bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          <div className="md:col-span-3">
            <h2 id="how-title" className="font-display text-2xl font-bold tracking-tight">
              Why asking by package works
            </h2>
          </div>
          <Step
            title={"Shortages aren't all-or-nothing"}
            body="The FDA lists each strength and package size separately. A drug can be “in shortage” while several of its packages are shipping normally."
          />
          <Step
            title="Pharmacies order by NDC"
            body="A pharmacist searches their wholesaler by package code, not drug name. Handing them a specific NDC skips the guesswork."
          />
          <Step
            title="We watch every package for you"
            body="Fillable syncs FDA and ASHP data throughout the day and flags the moment a package flips to available."
          />
        </div>
      </section>
    </Page>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-5">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
