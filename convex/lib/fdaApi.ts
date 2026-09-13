/**
 * openFDA drug-shortage client.
 *
 * Plain `fetch` against the public JSON API — no `"use node"` needed, since
 * fetch is available in the default Convex runtime and this must stay callable
 * from a normal action.
 *
 * The API key is optional but strongly recommended in production: Convex
 * actions egress from shared IP addresses, and openFDA's unauthenticated rate
 * limit is per-IP, so an unkeyed deployment shares a bucket with strangers.
 */
import type { RawFdaRecord } from "./fdaRecord";

const BASE = "https://api.fda.gov/drug/shortages.json";

/** openFDA caps `limit` at 1000 per request. */
export const MAX_PAGE = 1000;

export interface FdaMeta {
  total: number;
  lastUpdated?: string;
}

interface FdaEnvelope {
  meta?: {
    last_updated?: string;
    results?: { total?: number };
  };
  results?: RawFdaRecord[];
  error?: { code?: string; message?: string };
}

function url(params: Record<string, string | number>): string {
  const search = new URLSearchParams();
  for (const [k, value] of Object.entries(params)) {
    search.set(k, String(value));
  }
  // Read lazily so importing this module never throws on a fresh deployment.
  const key = process.env.FDA_API_KEY;
  if (key !== undefined && key.length > 0) search.set("api_key", key);
  return `${BASE}?${search.toString()}`;
}

async function request(params: Record<string, string | number>): Promise<FdaEnvelope> {
  const target = url(params);
  const response = await fetch(target);
  const text = await response.text();

  if (!response.ok) {
    // openFDA returns 404 with an error body when a query matches nothing,
    // which is a legitimate empty result rather than a failure.
    if (response.status === 404) return { results: [] };
    throw new Error(
      `openFDA ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  try {
    return JSON.parse(text) as FdaEnvelope;
  } catch {
    throw new Error(`openFDA returned non-JSON: ${text.slice(0, 200)}`);
  }
}

export async function fetchMeta(): Promise<FdaMeta> {
  const body = await request({ limit: 1 });
  return {
    total: body.meta?.results?.total ?? 0,
    lastUpdated: body.meta?.last_updated,
  };
}

/** One page of raw records. Caller normalizes. */
export async function fetchPage(
  skip: number,
  limit: number = MAX_PAGE,
): Promise<RawFdaRecord[]> {
  const body = await request({ limit: Math.min(limit, MAX_PAGE), skip });
  return body.results ?? [];
}

/**
 * The delta feed: most recently updated records first.
 *
 * Cheap enough to run every 15 minutes and, unlike a full sweep, bounded. Note
 * that most of what comes back will be `update_type: "Reverified"` with no
 * material change — the material hash in `fdaRecord.ts` is what stops those
 * from becoming events.
 */
export async function fetchRecentlyUpdated(
  limit: number = 150,
): Promise<RawFdaRecord[]> {
  const body = await request({
    limit: Math.min(limit, MAX_PAGE),
    skip: 0,
    sort: "update_date:desc",
  });
  return body.results ?? [];
}

/** Every record, paged. ~1602 rows over two requests today. */
export async function fetchAll(total: number): Promise<RawFdaRecord[]> {
  const out: RawFdaRecord[] = [];
  for (let skip = 0; skip < total; skip += MAX_PAGE) {
    out.push(...(await fetchPage(skip, MAX_PAGE)));
  }
  return out;
}
