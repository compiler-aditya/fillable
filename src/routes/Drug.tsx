import { useQuery } from "convex/react";
import { ArrowLeft, Check, Copy, Info } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { AppShell } from "../components/AppShell";
import { AvailabilityBadge } from "../components/Availability";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { shortPresentation } from "../lib/format";
import { cn } from "../lib/utils";

function CopyNdc({ ndc }: { ndc: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ndc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Blocked in some embedded browsers. The number is on screen regardless.
      setCopied(false);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} className="h-7 gap-1.5 text-xs">
      {copied ? (
        <>
          <Check className="size-3 text-ok" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden="true" />
          Copy NDC
        </>
      )}
    </Button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="tnum mt-0.5 truncate text-[0.8125rem] font-medium">{value}</dd>
    </div>
  );
}

function PackageTable({ rows }: { rows: Doc<"presentations">[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        No packages in this state.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 text-xs">NDC</TableHead>
          <TableHead className="h-8 text-xs">State</TableHead>
          <TableHead className="h-8 text-xs">Manufacturer</TableHead>
          <TableHead className="h-8 text-xs">Presentation</TableHead>
          <TableHead className="h-8 text-xs">Reason / expected</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p._id}>
            <TableCell className="tnum py-2 font-mono text-[0.8125rem] font-medium">
              {p.packageNdc}
            </TableCell>
            <TableCell className="py-2">
              <AvailabilityBadge presentation={p} />
            </TableCell>
            <TableCell className="py-2 text-[0.8125rem]">{p.companyName}</TableCell>
            <TableCell className="py-2 text-xs text-muted-foreground">
              {shortPresentation(p.presentationText)}
            </TableCell>
            <TableCell className="py-2 text-xs text-muted-foreground">
              {p.shortageReason ?? "—"}
              {p.recoveryDateText !== undefined && (
                <span className="block font-medium text-foreground">
                  back {p.recoveryDateText}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Drug() {
  const { slug } = useParams<{ slug: string }>();
  const detail = useQuery(api.drugs.detail, slug === undefined ? "skip" : { slug });
  const [tab, setTab] = useState("available");

  if (detail === undefined) {
    return (
      <AppShell title="Medication">
        <div className="space-y-4">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </AppShell>
    );
  }

  if (detail === null) {
    return (
      <AppShell title="Not found">
        <div className="rounded-lg border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm">That medication isn&rsquo;t on the list.</p>
          <Link to="/" className="mt-3 inline-block text-sm text-primary underline">
            Back to shortages
          </Link>
        </div>
      </AppShell>
    );
  }

  const { drug, available, limited, unavailable, askFor } = detail;
  const rows =
    tab === "available" ? available : tab === "limited" ? limited : unavailable;

  return (
    <AppShell
      title={drug.displayName}
      actions={
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Shortages
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Record header: identity and the numbers, in one dense strip. */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-pretty text-lg font-semibold tracking-tight">
            {drug.displayName}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {drug.genericName}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
            <Meta
              label="Brands"
              value={drug.brandNames.slice(0, 2).join(", ") || "—"}
            />
            <Meta label="Packages" value={String(drug.presentationCount)} />
            <Meta label="Available" value={String(drug.availableCount)} />
            <Meta label="Limited" value={String(drug.limitedCount)} />
            <Meta label="Out" value={String(drug.unavailableCount)} />
          </dl>
        </div>

        {/* The answer. One strip, unmissable, not a decorative panel. */}
        {askFor !== null ? (
          <div className="rounded-lg border border-ok-border bg-ok-surface p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ok">
                  Ask your pharmacy for
                </p>
                <code className="tnum mt-1 block font-mono text-2xl font-semibold tracking-tight">
                  {askFor.packageNdc}
                </code>
              </div>
              <div className="min-w-0 flex-1 text-[0.8125rem]">
                <p className="font-medium">{askFor.companyName}</p>
                <p className="truncate text-muted-foreground">
                  {shortPresentation(askFor.presentationText)}
                </p>
              </div>
              <CopyNdc ndc={askFor.packageNdc} />
            </div>

            {askFor.status === "current" && (
              <p className="mt-3 flex items-start gap-1.5 border-t border-ok-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                Officially in shortage, yet the manufacturer reports this package
                available — which is why the NDC gets a different answer than the
                drug name.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-none-border bg-none-surface p-4">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-none">
              Nothing currently available
            </p>
            <p className="mt-1.5 text-[0.8125rem]">
              Every version on the FDA&rsquo;s list is unavailable or limited.
              Your pharmacist can check local stock; your prescriber can discuss
              alternatives.
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-2 py-1.5">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-7 bg-transparent p-0">
                {[
                  { id: "available", label: "Available", n: available.length, tone: "text-ok" },
                  { id: "limited", label: "Limited", n: limited.length, tone: "text-low" },
                  { id: "unavailable", label: "Out", n: unavailable.length, tone: "text-none" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="h-7 gap-1.5 px-2.5 text-xs data-[state=active]:bg-muted"
                  >
                    {t.label}
                    <span className={cn("tnum", tab === t.id ? t.tone : "text-muted-foreground")}>
                      {t.n}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <PackageTable rows={rows} />
        </div>
      </div>
    </AppShell>
  );
}
