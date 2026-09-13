/**
 * Firecrawl v2 wrapper.
 *
 * Grounding is what stops either agent from bluffing. Before a number is
 * proposed, both sides are working from the same scraped facts and the same
 * market comparables, each carrying a source URL that the proposal cites.
 */

const API_BASE = "https://api.firecrawl.dev/v2";

function apiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set on this deployment");
  return key;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Firecrawl ${path} failed: ${response.status} ${text.slice(0, 400)}`,
    );
  }
  return text.length > 0 ? (JSON.parse(text) as unknown) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export type ScrapedContext = {
  title?: string;
  sourceUrl: string;
  extracted: Record<string, unknown>;
  /** Dimension keys the page genuinely stated, after sanitising. */
  statedKeys: string[];
  snippet?: string;
};

/**
 * Drop values the page did not actually state.
 *
 * Extraction models answer "not stated" with `0` far more often than with
 * `null`, whatever the prompt says. A null is honest and the engine ignores it;
 * a zero is a number, and `deliveryDays: 0` would read as "deliver instantly"
 * and anchor a real proposal. Anything non-positive or non-finite is discarded
 * rather than trusted.
 */
export function sanitiseExtraction(
  raw: Record<string, unknown>,
  numericKeys: string[],
): { extracted: Record<string, unknown>; statedKeys: string[] } {
  const extracted: Record<string, unknown> = {};
  const statedKeys: string[] = [];

  if (typeof raw.summary === "string" && raw.summary.trim().length > 0) {
    extracted.summary = raw.summary.trim();
  }

  for (const key of numericKeys) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    extracted[key] = value;
    statedKeys.push(key);
  }

  return { extracted, statedKeys };
}

/**
 * Scrape one page and pull structured fields out of it.
 *
 * `prompt` describes the fields wanted; the model behind Firecrawl fills them
 * from the page. Anything it cannot find comes back null rather than invented,
 * which matters because these values become citable claims.
 */
export async function scrapeContext(args: {
  url: string;
  prompt: string;
  /** Dimension keys to accept as numbers; everything else is dropped. */
  numericKeys: string[];
}): Promise<ScrapedContext> {
  const result = await post("/scrape", {
    url: args.url,
    formats: ["markdown", { type: "json", prompt: args.prompt }],
    onlyMainContent: true,
  });

  const data = asRecord(asRecord(result).data);
  // v2 returns extraction under `json`; older responses used `extract`.
  const raw = asRecord(data.json ?? data.extract);
  const metadata = asRecord(data.metadata);
  const markdown = typeof data.markdown === "string" ? data.markdown : undefined;

  const { extracted, statedKeys } = sanitiseExtraction(raw, args.numericKeys);

  return {
    title:
      typeof metadata.title === "string"
        ? metadata.title
        : typeof metadata.ogTitle === "string"
          ? metadata.ogTitle
          : undefined,
    sourceUrl:
      typeof metadata.sourceURL === "string" ? metadata.sourceURL : args.url,
    extracted,
    statedKeys,
    snippet: markdown?.slice(0, 600),
  };
}

export type Comparable = {
  url: string;
  title: string;
  description: string;
};

/** Search the web for comparable market data. */
export async function searchComparables(args: {
  query: string;
  limit: number;
}): Promise<Comparable[]> {
  const result = await post("/search", {
    query: args.query,
    limit: args.limit,
    sources: ["web"],
  });

  const data = asRecord(asRecord(result).data);
  const web = Array.isArray(data.web) ? data.web : [];

  return web.slice(0, args.limit).map((entry) => {
    const row = asRecord(entry);
    return {
      url: typeof row.url === "string" ? row.url : "",
      title: typeof row.title === "string" ? row.title : "",
      description: typeof row.description === "string" ? row.description : "",
    };
  });
}
