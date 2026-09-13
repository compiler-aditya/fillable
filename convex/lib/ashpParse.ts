/**
 * Parser for ASHP's drug shortage bulletin list.
 *
 * ASHP is the second opinion the product rests on: it "frequently lists more
 * shortages than FDA" by its own documentation, and the two disagree — 227
 * versus roughly 197 as of September 2026. It has no API, and it returns 403
 * to a plain fetch (verified, including with a browser User-Agent), so
 * Firecrawl is genuinely the only way to reach it rather than a convenience.
 *
 * Pure and fixture-tested: a change to ASHP's markup fails a test here rather
 * than silently writing nonsense into the database.
 */

export interface AshpBulletin {
  bulletinId: string;
  title: string;
  detailUrl: string;
  revisionDateText?: string;
  revisionAtMs?: number;
  createdDateText?: string;
}

export interface AshpPage {
  bulletins: AshpBulletin[];
  /** "Showing 1 to 10 of 186 entries" → 186. Undefined if absent. */
  totalEntries?: number;
}

/** Rows look like: | [Name](…Drug-Shortage-Detail.aspx?id=811) | Apr 22, 2026 | Feb 25, 2022 | */
const ROW =
  /^\|\s*\[([^\]]+)\]\(([^)]*Drug-Shortage-Detail\.aspx\?id=(\d+))\)\s*\|([^|]*)\|([^|]*)\|/i;

const TOTAL = /Showing\s+[\d,]+\s+to\s+[\d,]+\s+of\s+([\d,]+)\s+entries/i;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** ASHP prints "Apr 22, 2026". Returns UTC ms, or undefined if unrecognised. */
export function parseAshpDate(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/.exec(raw.trim());
  if (m === null) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return undefined;
  const ms = Date.UTC(Number(m[3]), month, Number(m[2]));
  return Number.isFinite(ms) ? ms : undefined;
}

const clean = (s: string | undefined): string | undefined => {
  const t = s?.trim();
  return t !== undefined && t.length > 0 ? t : undefined;
};

export function parseAshpList(markdown: string): AshpPage {
  const bulletins: AshpBulletin[] = [];
  const seen = new Set<string>();

  for (const line of markdown.split("\n")) {
    const m = ROW.exec(line.trim());
    if (m === null) continue;

    const [, title, detailUrl, bulletinId, revision, created] = m;
    // The related-links block repeats list links; keep the first row per id.
    if (seen.has(bulletinId)) continue;
    seen.add(bulletinId);

    const revisionDateText = clean(revision);
    bulletins.push({
      bulletinId,
      title: title.trim(),
      detailUrl: detailUrl.trim(),
      revisionDateText,
      revisionAtMs: parseAshpDate(revisionDateText),
      createdDateText: clean(created),
    });
  }

  const totalMatch = TOTAL.exec(markdown);
  const totalEntries =
    totalMatch === null ? undefined : Number(totalMatch[1].replace(/,/g, ""));

  return {
    bulletins,
    totalEntries: Number.isFinite(totalEntries) ? totalEntries : undefined,
  };
}

export const ASHP_LIST_URL =
  "https://www.ashp.org/drug-shortages/current-shortages/drug-shortages-list?page=CurrentShortages";

/** Sorted by revision date, newest first — the cheap changefeed pass. */
export const ASHP_BY_REVISION_URL = `${ASHP_LIST_URL}&sort=2`;

/**
 * Browser steps to render one 100-row page of the bulletin table.
 *
 * ASHP paginates server-side and exposes no usable page parameter — a guessed
 * `pageNum` is silently ignored and every request returns page one, which
 * costs a credit per page and yields nothing. Its own page-size control does
 * work, so setting entries to 100 and then advancing with "Next" reads all 186
 * bulletins in two scrapes instead of nineteen.
 */
export function ashpPageActions(pageIndex: number): Array<
  | { type: "wait"; milliseconds: number }
  | { type: "executeJavascript"; script: string }
> {
  const setPageSize = {
    type: "executeJavascript" as const,
    script:
      "var s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value=='100'||o.text=='100')); if(s){s.value='100'; s.dispatchEvent(new Event('change',{bubbles:true}));}",
  };
  const clickNext = {
    type: "executeJavascript" as const,
    script:
      "var n=[...document.querySelectorAll('a,button')].find(x=>/^\\s*next\\s*$/i.test(x.textContent||'')); if(n) n.click();",
  };

  const actions: Array<
    | { type: "wait"; milliseconds: number }
    | { type: "executeJavascript"; script: string }
  > = [{ type: "wait", milliseconds: 3000 }, setPageSize, { type: "wait", milliseconds: 3500 }];

  for (let i = 0; i < pageIndex; i++) {
    actions.push(clickNext, { type: "wait", milliseconds: 3500 });
  }
  return actions;
}

/**
 * Normalised form for matching an ASHP title against an FDA generic name.
 *
 * Deliberately crude — it only catches the easy exact matches, and anything it
 * cannot match stays `unmatched` for a model pass rather than being guessed at.
 * ASHP titles are clinical ("Amino Acid Products") where the FDA is chemical
 * ("Amino Acid Injection"), so a naive comparison would produce false pairs.
 */
export function matchKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(injection|tablet|capsule|solution|oral|intravenous|topical|suspension|products?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
