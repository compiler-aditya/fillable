import { useQuery } from "convex/react";
import { ArrowLeft, Check, ClipboardCopy, Info } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AvailabilityBadge } from "../components/Availability";
import { shortPresentation } from "../lib/format";

function CopyNdc({ ndc }: { ndc: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ndc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked in some embedded browsers. The number is on
      // screen in large type regardless, so this is a convenience, not the
      // mechanism.
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-good-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-good" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <ClipboardCopy className="size-3.5" aria-hidden="true" />
          Copy NDC
        </>
      )}
    </button>
  );
}

function PackageRow({ p }: { p: Doc<"presentations"> }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
      <code className="font-mono text-sm text-text tnum">{p.packageNdc}</code>
      <AvailabilityBadge presentation={p} />
      <span className="text-sm text-text-muted">{p.companyName}</span>
      <span className="w-full text-xs text-text-faint sm:w-auto sm:ml-auto">
        {shortPresentation(p.presentationText)}
      </span>
      {(p.shortageReason !== undefined || p.recoveryDateText !== undefined) && (
        <p className="w-full text-xs text-text-faint">
          {p.shortageReason}
          {p.recoveryDateText !== undefined && (
            <>
              {p.shortageReason !== undefined && " · "}
              <span className="text-text-muted">
                expected back {p.recoveryDateText}
              </span>
            </>
          )}
        </p>
      )}
    </li>
  );
}

function PackageGroup({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: Doc<"presentations">[];
  tone: "good" | "warn" | "bad";
}) {
  if (rows.length === 0) return null;
  const border = {
    good: "border-good-border",
    warn: "border-warn-border",
    bad: "border-bad-border",
  }[tone];

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium text-text">
        {title}{" "}
        <span className="text-text-faint tnum font-normal">({rows.length})</span>
      </h3>
      <ul
        className={`divide-y divide-border overflow-hidden rounded-card border bg-surface ${border}`}
      >
        {rows.map((p) => (
          <PackageRow key={p._id} p={p} />
        ))}
      </ul>
    </section>
  );
}

export function Drug() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useQuery(api.drugs.detail, slug === undefined ? "skip" : { slug });

  if (detail === undefined) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-40 animate-pulse rounded-card bg-surface-2" />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="rounded-card border border-border bg-surface p-8 text-center">
        <p className="text-text">That medication isn&rsquo;t on the list.</p>
        <Link to="/" className="mt-3 inline-block text-sm text-accent underline">
          Back to all medications
        </Link>
      </div>
    );
  }

  const { drug, available, limited, unavailable, askFor } = detail;

  return (
    <div className="space-y-7">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All medications
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text text-balance">
          {drug.displayName}
        </h1>
        {drug.brandNames.length > 0 && (
          <p className="mt-1 text-sm text-text-muted">
            Sold as {drug.brandNames.slice(0, 3).join(", ")}
          </p>
        )}
        <p className="mt-1 text-xs text-text-faint">{drug.genericName}</p>
      </div>

      {/* The answer. Everything else on this page is supporting detail. */}
      {askFor !== null ? (
        <section className="rounded-card border border-good-border bg-good-bg p-5">
          <p className="text-sm font-medium text-good">
            Ask your pharmacy for this package
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="font-mono text-2xl sm:text-3xl font-semibold tracking-tight text-text tnum">
              {askFor.packageNdc}
            </code>
            <CopyNdc ndc={askFor.packageNdc} />
          </div>

          <p className="mt-2 text-sm text-text">
            {askFor.companyName} · {shortPresentation(askFor.presentationText)}
          </p>

          {askFor.status === "current" && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                This medication is officially in shortage — but the manufacturer
                reports this package as available. That is why asking for the NDC
                gets a different answer than asking for the drug by name.
              </span>
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-card border border-bad-border bg-bad-bg p-5">
          <p className="text-sm font-medium text-bad">
            No package of this medication is currently reported available
          </p>
          <p className="mt-2 text-sm text-text-muted">
            Every version on the FDA&rsquo;s list is unavailable or limited right
            now. Your pharmacist can check local stock and your prescriber can
            discuss alternatives — this page only reports what manufacturers told
            the FDA.
          </p>
        </section>
      )}

      <div className="space-y-5">
        <PackageGroup title="Available" rows={available} tone="good" />
        <PackageGroup title="Limited availability" rows={limited} tone="warn" />
        <PackageGroup title="Not available" rows={unavailable} tone="bad" />
      </div>

      <p className="text-xs text-text-faint">
        Reported by manufacturers to the FDA. Not a live view of pharmacy stock —
        confirm with your pharmacist.
      </p>
    </div>
  );
}
