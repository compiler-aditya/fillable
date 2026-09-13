import type { Doc } from "../../convex/_generated/dataModel";

export type Availability = Doc<"presentations">["availability"];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available",
  limited: "Limited",
  unavailable: "Unavailable",
  unknown: "Not stated",
};

/**
 * How a package's state should read.
 *
 * The FDA omits availability on discontinuations and resolutions, so "unknown"
 * is common and meaningless on its own — fall back to the shortage status,
 * which is the real information for those rows.
 */
export function stateLabel(p: Doc<"presentations">): string {
  if (p.availability !== "unknown") return AVAILABILITY_LABEL[p.availability];
  if (p.status === "to_be_discontinued") return "To be discontinued";
  if (p.status === "resolved") return "Resolved";
  return "Not stated";
}

export function relativeTime(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * NDC packages read as 5-4-2 groups. The FDA already hyphenates them, so this
 * only tidies whitespace rather than reformatting and risking a wrong number
 * being read aloud at a pharmacy counter.
 */
export const formatNdc = (ndc: string): string => ndc.trim();

/**
 * Make a combination-product strength readable.
 *
 * Combination drugs are published one strength per salt, so generic Adderall
 * 5 mg arrives as "1.25 mg; 1.25 mg; 1.25 mg; 1.25 mg" — four salts of
 * 1.25 mg each. A patient holding a prescription for "5 mg" does not recognise
 * that, and the whole product asks them to match a package to their script.
 *
 * When every component is the same strength and unit, show the total the drug
 * is actually prescribed as, keeping the breakdown. Verified against the FDA's
 * own data: the Alvogen row for the same drug is published directly as "5mg".
 *
 * Anything that is not a clean repeat is left exactly as published — inventing
 * a total across genuinely different strengths would be worse than verbose.
 */
export function readableStrength(text: string): string {
  const parts = text.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length < 2) return text;

  const parsed = parts.map((p) => /^([\d.]+)\s*([a-zA-Z/%]+)$/.exec(p));
  if (parsed.some((m) => m === null)) return text;

  const unit = parsed[0]![2];
  const first = parsed[0]![1];
  const allSame = parsed.every((m) => m![1] === first && m![2] === unit);
  if (!allSame) return text;

  const total = Number(first) * parts.length;
  if (!Number.isFinite(total)) return text;

  // Trim float noise from values like 1.875 × 4.
  const totalText = `${Number(total.toFixed(4))}${unit}`;
  return `${totalText} total (${parts.length} × ${first}${unit})`;
}

/** "Tablet, 20mg" out of the FDA's long presentation string, when possible. */
export function shortPresentation(text: string): string {
  const withoutNdc = text.replace(/\s*\(NDC[^)]*\)\s*$/i, "").trim();
  const parts = withoutNdc.split(",").map((s) => s.trim());
  // Long multi-salt names repeat the ingredients; the tail carries form + dose.
  const tail = parts.slice(-2).filter((p) => p.length > 0);
  if (tail.length === 0) return withoutNdc;

  const last = tail[tail.length - 1];
  tail[tail.length - 1] = readableStrength(last);
  return tail.join(", ");
}
