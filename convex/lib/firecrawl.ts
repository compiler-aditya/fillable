/**
 * Firecrawl client.
 *
 * Plain `fetch` against the v2 API so this stays on the default Convex runtime
 * rather than forcing `"use node"`.
 *
 * Firecrawl is load-bearing here, not decorative. ASHP — the second opinion the
 * product's whole "sources disagree" thesis rests on — returns **403 to a plain
 * fetch**, verified including with a browser User-Agent, and 200 through
 * Firecrawl. A Convex action cannot reach it any other way. The FDA's own HTML
 * changefeed is likewise a 302 to plain fetch, and runs 1–3 days ahead of the
 * JSON API's nightly snapshot.
 */

const API_BASE = "https://api.firecrawl.dev/v2";

export interface ScrapeResult {
  markdown: string;
  /** Read from the response, never estimated. Drives the budget guard. */
  creditsUsed: number;
  statusCode?: number;
  sourceUrl?: string;
}

function apiKey(): string {
  // Read lazily so importing this module never throws on a deployment that has
  // not had the key set yet.
  const key = process.env.FIRECRAWL_API_KEY;
  if (key === undefined || key.length === 0) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set on this deployment. Set it with `npx convex env set FIRECRAWL_API_KEY …`.",
    );
  }
  return key;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/**
 * Scrape one page to markdown.
 *
 * Markdown rather than the JSON/extract format on every scheduled path: markdown
 * costs 1 credit where structured extraction costs 5, and the parsing we need is
 * deterministic enough to do ourselves — which also means a markup change fails
 * a unit test instead of quietly costing five times as much for a worse answer.
 */
export type ScrapeAction =
  | { type: "wait"; milliseconds: number }
  | { type: "executeJavascript"; script: string }
  | { type: "scrape" };

export async function scrapeMarkdown(args: {
  url: string;
  waitFor?: number;
  onlyMainContent?: boolean;
  /**
   * Browser steps run before the page is read.
   *
   * Needed because some sources only expose their full table through their own
   * controls. ASHP paginates server-side with no usable URL parameter, but its
   * page-size selector will render 100 rows at once — driving that control
   * turns 19 scrapes into 2, at the same 1 credit each.
   */
  actions?: ScrapeAction[];
}): Promise<ScrapeResult> {
  const response = await fetch(`${API_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: args.url,
      formats: ["markdown"],
      onlyMainContent: args.onlyMainContent ?? true,
      waitFor: args.waitFor ?? 2500,
      // Force a live fetch: the point of this path is freshness the cached
      // JSON API does not have, so a reused snapshot would defeat it.
      maxAge: 0,
      ...(args.actions !== undefined && args.actions.length > 0
        ? { actions: args.actions }
        : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Firecrawl scrape failed for ${args.url}: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  const body = asRecord(JSON.parse(text));
  const data = asRecord(body.data);
  const metadata = asRecord(data.metadata);

  const markdown = typeof data.markdown === "string" ? data.markdown : "";
  const creditsUsed =
    typeof metadata.creditsUsed === "number" ? metadata.creditsUsed : 1;
  const statusCode =
    typeof metadata.statusCode === "number" ? metadata.statusCode : undefined;
  const sourceUrl =
    typeof metadata.sourceURL === "string" ? metadata.sourceURL : undefined;

  if (markdown.length === 0) {
    throw new Error(
      `Firecrawl returned no markdown for ${args.url} (status ${statusCode ?? "unknown"})`,
    );
  }

  return { markdown, creditsUsed, statusCode, sourceUrl };
}
