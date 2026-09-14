import { useQuery } from "convex/react";
import { ArrowLeft, Check, Copy, Info } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AvailabilityBadge } from "../components/Availability";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { shortPresentation } from "../lib/format";
import { cn } from "../lib/utils";

/** Rows shown before the list collapses. A drug can carry 90 packages. */
const VISIBLE = 8;

function CopyNdc({ ndc }: { ndc: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ndc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked in some embedded browsers. The number is on screen
      // in large type either way — this is a convenience, not the mechanism.
      setCopied(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? (
        <>
          <Check className="size-3.5 text-ok" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden="true" />
          Copy
        </>
      )}
    </Button>
  );
}

function PackageList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Doc<"presentations">[];
  tone: "ok" | "low" | "none";
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) return null;

  const visible = expanded ? rows : rows.slice(0, VISIBLE);
  const dot = { ok: "bg-ok", low: "bg-low", none: "bg-none" }[tone];

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span className={cn("size-1.5 rounded-full", dot)} aria-hidden="true" />
        {title}
        <span className="tnum font-normal text-muted-foreground">
          {rows.length}
        </span>
      </h3>

      <Card className="divide-y divide-border overflow-hidden p-0">
        {visible.map((p) => (
          <div key={p._id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <code className="tnum font-mono text-sm font-medium">
                {p.packageNdc}
              </code>
              <AvailabilityBadge presentation={p} />
              <span className="text-sm text-muted-foreground">
                {p.companyName}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {shortPresentation(p.presentationText)}
            </p>
            {(p.shortageReason !== undefined ||
              p.recoveryDateText !== undefined) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {p.shortageReason}
                {p.recoveryDateText !== undefined && (
                  <>
                    {p.shortageReason !== undefined && " · "}
                    <span className="font-medium text-foreground">
                      expected back {p.recoveryDateText}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        ))}

        {rows.length > VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {expanded
              ? "Show fewer"
              : `Show all ${rows.length} — ${rows.length - VISIBLE} more`}
          </button>
        )}
      </Card>
    </section>
  );
}

export function Drug() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useQuery(api.drugs.detail, slug === undefined ? "skip" : { slug });

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  if (detail === null) {
    return (
      <Card className="px-6 py-12 text-center">
        <p className="text-sm">That medication isn&rsquo;t on the list.</p>
        <Link
          to="/"
          className="mt-3 inline-block text-sm text-primary underline underline-offset-2"
        >
          Back to all medications
        </Link>
      </Card>
    );
  }

  const { drug, available, limited, unavailable, askFor } = detail;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All medications
        </Link>

        <h1 className="mt-4 text-pretty text-2xl font-semibold tracking-tight sm:text-3xl">
          {drug.displayName}
        </h1>
        <p className="tnum mt-1.5 text-sm text-muted-foreground">
          {drug.brandNames.length > 0 && (
            <>
              <span className="font-medium text-foreground">
                {drug.brandNames.slice(0, 3).join(" · ")}
              </span>
              {" — "}
            </>
          )}
          {drug.presentationCount} packages tracked
        </p>
      </div>

      {/* The answer. Everything below is supporting detail. */}
      {askFor !== null ? (
        <Card className="gap-0 border-ok-border bg-ok-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ok">
            Ask your pharmacy for
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <code className="tnum font-mono text-3xl font-semibold tracking-tight sm:text-4xl">
              {askFor.packageNdc}
            </code>
            <CopyNdc ndc={askFor.packageNdc} />
          </div>

          <p className="mt-2.5 text-sm">
            <span className="font-medium">{askFor.companyName}</span>
            <span className="text-muted-foreground">
              {" · "}
              {shortPresentation(askFor.presentationText)}
            </span>
          </p>

          {askFor.status === "current" && (
            <p className="mt-4 flex items-start gap-2 border-t border-ok-border pt-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                This medication is officially in shortage — but the manufacturer
                reports this package as available. That is why asking for the NDC
                gets a different answer than asking for the drug by name.
              </span>
            </p>
          )}
        </Card>
      ) : (
        <Card className="gap-0 border-none-border bg-none-surface p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-none">
            Nothing currently available
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Every version of this medication on the FDA&rsquo;s list is
            unavailable or limited right now.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Your pharmacist can check local stock, and your prescriber can discuss
            alternatives. This page only reports what manufacturers told the FDA.
          </p>
        </Card>
      )}

      <div className="space-y-6">
        <PackageList title="Available" rows={available} tone="ok" />
        <PackageList title="Limited availability" rows={limited} tone="low" />
        <PackageList title="Not available" rows={unavailable} tone="none" />
      </div>
    </div>
  );
}
