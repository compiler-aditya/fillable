import { Check, Copy, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";
import { ndcGroups, shortPresentation, stateLabel } from "../lib/format";
import { cn } from "../lib/utils";
import { StatusPill } from "./Availability";
import { Button } from "./ui/button";

type Drug = Doc<"drugs">;
type Presentation = Doc<"presentations">;

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Blocked in some embedded browsers. The number is on screen regardless.
      setCopied(false);
    }
  };
  return { copied, copy };
}

export function NdcDigits({ ndc, className }: { ndc: string; className?: string }) {
  const groups = ndcGroups(ndc);
  return (
    <span className={cn("tnum inline-flex items-baseline font-display font-bold tracking-tight", className)}>
      {groups.map((g, i) => (
        <span key={i} className="inline-flex items-baseline">
          {i > 0 && <span className="mx-[0.1em] font-medium opacity-40">-</span>}
          {g}
        </span>
      ))}
    </span>
  );
}

/** Full-screen, high-contrast view meant to be held up at the pharmacy counter. */
function CounterMode({
  drug,
  presentation,
  onClose,
}: {
  drug: Drug;
  presentation: Presentation;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Package to ask for, shown large"
      className="fixed inset-0 z-50 flex flex-col bg-card text-foreground"
    >
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-sm font-semibold text-muted-foreground">Could you check for this package?</p>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="rounded-full">
          <X />
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="rounded-full bg-ok-surface px-3 py-1 text-xs font-bold uppercase tracking-wider text-ok-foreground">
            NDC
          </span>
          <NdcDigits ndc={presentation.packageNdc} className="text-[clamp(2.75rem,12vw,8rem)] leading-none" />
        </div>
        <div className="max-w-md">
          <p className="text-balance font-display text-2xl font-semibold sm:text-3xl">{drug.displayName}</p>
          <p className="mt-2 text-lg text-muted-foreground">
            {shortPresentation(presentation.presentationText)} · {presentation.companyName}
          </p>
        </div>
      </div>

      <p className="px-5 pb-6 text-center text-sm text-muted-foreground">
        Manufacturer reported this to the FDA
        {presentation.fdaUpdateDate ? ` on ${presentation.fdaUpdateDate}` : ""}. Local stock may differ.
      </p>
    </div>
  );
}

export function AskTicket({ drug, presentation }: { drug: Drug; presentation: Presentation }) {
  const { copied, copy } = useCopy(presentation.packageNdc);
  const [counter, setCounter] = useState(false);
  const isAvailable = presentation.availability === "available";

  return (
    <>
      <section
        aria-labelledby="ask-for"
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_40px_-24px_rgba(30,42,43,0.25)]"
      >
        <div className="flex items-center justify-between gap-3 bg-primary px-5 py-3 text-primary-foreground">
          <h2 id="ask-for" className="font-display text-base font-semibold">
            {isAvailable ? "Ask your pharmacist for" : "Selected package"}
          </h2>
          <StatusPill
            availability={presentation.availability}
            label={stateLabel(presentation)}
            className="bg-card/15 text-primary-foreground"
          />
        </div>

        <div className="px-5 pb-5 pt-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">NDC</p>
          <p className="mt-1 leading-none">
            <NdcDigits ndc={presentation.packageNdc} className="text-[clamp(2rem,5vw,2.75rem)]" />
          </p>

          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Package</dt>
              <dd className="text-right font-medium">{shortPresentation(presentation.presentationText)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Made by</dt>
              <dd className="text-right font-medium">{presentation.companyName}</dd>
            </div>
            {presentation.fdaUpdateDate && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">FDA updated</dt>
                <dd className="tnum text-right font-medium">{presentation.fdaUpdateDate}</dd>
              </div>
            )}
            {presentation.recoveryDateText && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Expected back</dt>
                <dd className="text-right font-medium">{presentation.recoveryDateText}</dd>
              </div>
            )}
          </dl>

          {isAvailable && presentation.status === "current" && (
            <p className="mt-4 text-pretty text-xs leading-relaxed text-muted-foreground">
              Officially in shortage, yet the manufacturer reports this package available — which is
              why asking by NDC gets a different answer than asking by drug name.
            </p>
          )}
        </div>

        <div className="tear-line h-1 w-full" aria-hidden="true" />

        <div className="flex gap-2 p-4">
          <Button onClick={copy} className="flex-1 rounded-full" aria-live="polite">
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy NDC"}
          </Button>
          <Button variant="outline" onClick={() => setCounter(true)} className="flex-1 rounded-full">
            <Maximize2 />
            Show at counter
          </Button>
        </div>
      </section>

      {counter && <CounterMode drug={drug} presentation={presentation} onClose={() => setCounter(false)} />}
    </>
  );
}

export function NothingAvailable({ drug }: { drug: Drug }) {
  return (
    <section aria-labelledby="none-available" className="rounded-2xl border border-none/30 bg-none-surface px-5 py-5">
      <h2 id="none-available" className="font-display text-base font-semibold text-none-foreground">
        Nothing reported available right now
      </h2>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground/85">
        Every package of {drug.displayName} on the FDA list is unavailable or limited. Your pharmacist
        can still check local stock, and your prescriber can discuss alternatives.
      </p>
    </section>
  );
}
