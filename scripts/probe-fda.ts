/**
 * Validates convex/lib/fdaRecord.ts against the full live openFDA dataset.
 *
 * Run: node --experimental-strip-types scripts/probe-fda.ts
 *
 * This is a correctness probe, not part of the app. It exists because the unit
 * tests only cover fixtures we chose; this proves the normalizer survives every
 * record the FDA actually publishes, and surfaces any value we do not map.
 */
import {
  normalizeRecord,
  type NormalizeWarning,
  supersedeDuplicates,
  type RawFdaRecord,
} from "../convex/lib/fdaRecord.ts";

const BASE = "https://api.fda.gov/drug/shortages.json";

async function page(skip: number, limit: number): Promise<RawFdaRecord[]> {
  const res = await fetch(`${BASE}?limit=${limit}&skip=${skip}`);
  if (!res.ok) throw new Error(`openFDA ${res.status} at skip=${skip}`);
  const body = (await res.json()) as { results?: RawFdaRecord[] };
  return body.results ?? [];
}

const meta = await fetch(`${BASE}?limit=1`).then(
  (r) => r.json() as Promise<{ meta: { last_updated: string; results: { total: number } } }>,
);
const total = meta.meta.results.total;
console.log(`openFDA total=${total} last_updated=${meta.meta.last_updated}\n`);

const raw: RawFdaRecord[] = [];
for (let skip = 0; skip < total; skip += 1000) {
  raw.push(...(await page(skip, 1000)));
}
console.log(`fetched ${raw.length} records`);

const warnings: NormalizeWarning[] = [];
const normalizedAll = [];
const drugs = new Map<string, { name: string; avail: number; unavail: number; limited: number }>();
let dropped = 0;
const availability = new Map<string, number>();
const statuses = new Map<string, number>();
const hashes = new Map<string, string>();
let hashCollisions = 0;
let availableInCurrentShortage = 0;
let withRecoveryDate = 0;

for (const r of raw) {
  const n = normalizeRecord(r, warnings);
  if (n === null) { dropped++; continue; }
  normalizedAll.push(n);
}
const deduped = supersedeDuplicates(normalizedAll);
console.log(`\nsuperseded ${normalizedAll.length - deduped.length} duplicate postings`);
for (const n of deduped) {
  availability.set(n.availability, (availability.get(n.availability) ?? 0) + 1);
  statuses.set(n.status, (statuses.get(n.status) ?? 0) + 1);
  if (n.status === "current" && n.availability === "available") availableInCurrentShortage++;
  if (n.recoveryDateText !== undefined) withRecoveryDate++;

  const prior = hashes.get(n.recordKey);
  if (prior !== undefined && prior !== n.materialHash) hashCollisions++;
  hashes.set(n.recordKey, n.materialHash);

  const d = drugs.get(n.slug) ?? { name: n.displayName, avail: 0, unavail: 0, limited: 0 };
  if (n.availability === "available") d.avail++;
  else if (n.availability === "unavailable") d.unavail++;
  else if (n.availability === "limited") d.limited++;
  drugs.set(n.slug, d);
}

console.log(`\n--- normalization ---`);
console.log(`dropped (no ndc/name): ${dropped}`);
console.log(`distinct drugs (slugs): ${drugs.size}`);
console.log(`distinct recordKeys:    ${hashes.size}`);
console.log(`superseded duplicates:  ${raw.length - dropped - hashes.size} (0 remaining collisions)`);
console.log(`availability:`, Object.fromEntries(availability));
console.log(`status:      `, Object.fromEntries(statuses));

console.log(`\n--- unmapped values (must be empty) ---`);
if (warnings.length === 0) console.log("none — every live value is mapped");
else {
  const uniq = new Map<string, number>();
  for (const w of warnings) {
    const k = `${w.field}=${w.value}`;
    uniq.set(k, (uniq.get(k) ?? 0) + 1);
  }
  for (const [k, c] of uniq) console.log(`  ${k} (${c}×)`);
}

console.log(`\n--- THE PRODUCT THESIS ---`);
console.log(`NDCs marked Available while status is Current shortage: ${availableInCurrentShortage}`);
const split = [...drugs.values()].filter((d) => d.avail > 0 && d.unavail + d.limited > 0);
console.log(`drugs with BOTH an available and an unavailable/limited NDC: ${split.length}`);
console.log(`presentations carrying a real recovery estimate: ${withRecoveryDate}`);

console.log(`\n--- top 8 split drugs (the ones worth asking for by NDC) ---`);
for (const d of [...drugs.values()]
  .filter((x) => x.avail > 0 && x.unavail + x.limited > 0)
  .sort((a, b) => b.avail + b.unavail - (a.avail + a.unavail))
  .slice(0, 8)) {
  console.log(`  ${d.name}: ${d.avail} available / ${d.unavail} unavailable / ${d.limited} limited`);
}
