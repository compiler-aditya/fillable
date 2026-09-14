/**
 * Route-of-administration compatibility.
 *
 * A deterministic guard on top of the model's matching. Asking a model in the
 * prompt not to cross routes is a request, not a guarantee: told explicitly
 * that "Calcitriol Injection" must not match "Calcitriol Capsule", it made
 * exactly that match anyway. So the rule is enforced here, in code, where it
 * cannot be talked out of.
 *
 * Why it matters: route is not a cosmetic difference. An injection and an oral
 * capsule of the same molecule are separate products with separate supply
 * chains and separate manufacturers. Attaching one's shortage to the other
 * tells someone their medicine is affected when it is not.
 */

export type Route =
  | "parenteral"
  | "oral"
  | "topical"
  | "ophthalmic"
  | "otic"
  | "inhalation"
  | "irrigation"
  | "rectal"
  | "unknown";

/**
 * Ordered longest-phrase-first so "injectable suspension" is read as parenteral
 * before "suspension" can suggest oral.
 */
const PATTERNS: Array<[RegExp, Route]> = [
  [/\binjectable\s+suspension\b/i, "parenteral"],
  [/\bauto[-\s]?injector/i, "parenteral"],
  [/\binject(ion|able)\b/i, "parenteral"],
  [/\bintravenous\b|\bIV\b/i, "parenteral"],
  [/\bsubcutaneous\b/i, "parenteral"],
  [/\bintramuscular\b/i, "parenteral"],
  [/\bprefilled\s+syringe\b|\bsyringe\b/i, "parenteral"],
  [/\bvial\b/i, "parenteral"],

  [/\birrigation\b/i, "irrigation"],
  [/\bophthalmic\b|\beye\s+(drops|ointment)\b/i, "ophthalmic"],
  [/\botic\b|\bear\s+drops\b/i, "otic"],
  [/\binhalation\b|\bnebuli[sz]|\binhaler\b/i, "inhalation"],
  [/\bsuppositor|\brectal\b/i, "rectal"],
  [/\btopical\b|\bcream\b|\bointment\b|\bgel\b|\btransdermal\b|\bpatch\b/i, "topical"],

  [/\boral\b|\btablet/i, "oral"],
  [/\bcapsule/i, "oral"],
  [/\blozenge\b|\bsublingual\b|\bchewable\b/i, "oral"],
];

/** Best-effort route from a product name. "unknown" when nothing is stated. */
export function detectRoute(name: string): Route {
  for (const [pattern, route] of PATTERNS) {
    if (pattern.test(name)) return route;
  }
  return "unknown";
}

/**
 * May these two names refer to the same product?
 *
 * Permissive by design: only an explicit conflict blocks a match. If either
 * side states no route, there is no evidence of a conflict, and rejecting on
 * absence would throw away correct matches — the model's shortlist has already
 * established they are the same molecule.
 *
 * A "Kit" is deliberately unrecognised rather than mapped: adalimumab ships a
 * prefilled-syringe kit that is genuinely parenteral, while other kits are not,
 * so guessing would be worse than abstaining.
 */
export function routesCompatible(a: string, b: string): boolean {
  const ra = detectRoute(a);
  const rb = detectRoute(b);
  if (ra === "unknown" || rb === "unknown") return true;
  return ra === rb;
}
