import { describe, expect, it } from "vitest";
import {
  displayNameFor,
  extractRecoveryDate,
  hash64,
  materialHash,
  normalizeAvailability,
  normalizeRecord,
  normalizeStatus,
  parseFdaDate,
  recordKeyFor,
  slugify,
  type NormalizeWarning,
  supersedeDuplicates,
  type RawFdaRecord,
} from "./fdaRecord";

/** Real record, pulled from api.fda.gov on 2026-09-14. Not invented. */
const QUINAPRIL: RawFdaRecord = {
  package_ndc: "43547-411-09",
  generic_name: "Quinapril Hydrochloride Tablet",
  company_name: "Solco Healthcare US, LLC",
  availability: "Unavailable",
  status: "Current",
  update_type: "Reverified",
  update_date: "06/29/2026",
  shortage_reason: "Shortage of an active ingredient",
  related_info:
    "Not available. Long-term backorder for all NDCs. No estimated release date at this time.",
  dosage_form: "Tablet",
  therapeutic_category: ["Cardiovascular"],
  presentation: "Quinapril Hydrochloride, Tablet, 40mg (NDC 43547-411-09)",
};

/** The ADHD case the whole product is built around. Also real. */
const ADDERALL_UNAVAILABLE: RawFdaRecord = {
  package_ndc: "13107-068-01",
  generic_name:
    "Amphetamine Aspartate Monohydrate, Amphetamine Sulfate, Dextroamphetamine Saccharate, Dextroamphetamine Sulfate Tablet",
  company_name: "Aurobindo Pharma USA",
  availability: "Unavailable",
  status: "Current",
  update_date: "06/29/2026",
  shortage_reason: "Shortage of an active ingredient",
  related_info: "Estimated availability: October 2026",
  dosage_form: "Tablet",
  therapeutic_category: ["Psychiatry", "Pediatric"],
  presentation:
    "Amphetamine Aspartate Monohydrate, ... Tablet, 1.25 mg (NDC 13107-068-01)",
};

const ADDERALL_AVAILABLE: RawFdaRecord = {
  ...ADDERALL_UNAVAILABLE,
  package_ndc: "47781-179-01",
  company_name: "Alvogen",
  availability: "Available",
  shortage_reason: undefined,
  related_info: undefined,
  presentation:
    "Amphetamine Aspartate Monohydrate, ... Tablet, 20mg (NDC 47781-179-01)",
};

describe("normalizeAvailability", () => {
  it("maps the four live FDA strings", () => {
    expect(normalizeAvailability("Available")).toBe("available");
    expect(normalizeAvailability("Limited Availability")).toBe("limited");
    expect(normalizeAvailability("Unavailable")).toBe("unavailable");
  });

  it("maps the FDA's live typo 'Unvailable' rather than dropping the row", () => {
    // Verified present in production data on 2026-09-14 with count 1. Treating
    // it as "unknown" would silently remove a real unavailable NDC.
    expect(normalizeAvailability("Unvailable")).toBe("unavailable");
  });

  it("is case and whitespace insensitive", () => {
    expect(normalizeAvailability("  AVAILABLE  ")).toBe("available");
  });

  it("reports an unrecognized value instead of swallowing it", () => {
    const warnings: NormalizeWarning[] = [];
    expect(normalizeAvailability("Backordered", warnings)).toBe("unknown");
    expect(warnings).toEqual([{ field: "availability", value: "Backordered" }]);
  });

  it("treats missing as unknown without warning", () => {
    const warnings: NormalizeWarning[] = [];
    expect(normalizeAvailability(undefined, warnings)).toBe("unknown");
    expect(warnings).toHaveLength(0);
  });
});

describe("normalizeStatus", () => {
  it("maps the three live status values", () => {
    expect(normalizeStatus("Current")).toBe("current");
    expect(normalizeStatus("To Be Discontinued")).toBe("to_be_discontinued");
    expect(normalizeStatus("Resolved")).toBe("resolved");
  });

  it("accepts the website's wording as well as the API's", () => {
    expect(normalizeStatus("Currently in Shortage")).toBe("current");
  });
});

describe("parseFdaDate", () => {
  it("parses MM/DD/YYYY as UTC", () => {
    expect(parseFdaDate("06/29/2026")).toBe(Date.UTC(2026, 5, 29));
  });

  it("returns undefined for junk rather than NaN", () => {
    expect(parseFdaDate("June 29, 2026")).toBeUndefined();
    expect(parseFdaDate("")).toBeUndefined();
    expect(parseFdaDate(undefined)).toBeUndefined();
  });
});

describe("extractRecoveryDate", () => {
  it("pulls the estimate out of related_info", () => {
    expect(extractRecoveryDate("Estimated availability: October 2026")).toBe(
      "October 2026",
    );
  });

  it("returns undefined when there is genuinely no estimate", () => {
    // This is the common, bleak case and must not produce a fake date.
    expect(extractRecoveryDate(QUINAPRIL.related_info)).toBeUndefined();
    expect(extractRecoveryDate(undefined)).toBeUndefined();
  });

  it("never invents a date out of a negated phrase", () => {
    // Regression: an earlier pattern matched "estimated release" inside "No
    // estimated release date at this time" and returned "date at this time",
    // which would render as a recovery estimate to someone deciding whether
    // they can get their medication.
    for (const text of [
      "No estimated release date at this time.",
      "No estimated availability at this time.",
      "No known estimated release date.",
    ]) {
      expect(extractRecoveryDate(text)).toBeUndefined();
    }
  });

  it("accepts a colon-less estimate only when it is date-shaped", () => {
    expect(extractRecoveryDate("Estimated availability October 2026")).toBe(
      "October 2026",
    );
    expect(extractRecoveryDate("Estimated release Q1 2027")).toBe("Q1 2027");
    expect(
      extractRecoveryDate("Estimated release depends on the supplier"),
    ).toBeUndefined();
  });

  it("handles the other FDA wordings", () => {
    expect(extractRecoveryDate("Estimated resupply: late 2026")).toBe("late 2026");
    expect(extractRecoveryDate("Estimated recovery date: March 2027")).toBe(
      "March 2027",
    );
  });
});

describe("slugify / displayNameFor", () => {
  it("makes a stable url-safe slug", () => {
    expect(slugify("Quinapril Hydrochloride Tablet")).toBe(
      "quinapril-hydrochloride-tablet",
    );
  });

  it("collapses punctuation in multi-salt names and stays bounded", () => {
    const slug = slugify(ADDERALL_UNAVAILABLE.generic_name!);
    expect(slug.startsWith("amphetamine-aspartate-monohydrate")).toBe(true);
    expect(slug).not.toMatch(/[^a-z0-9-]/);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("shortens a 120-character generic name for display", () => {
    expect(displayNameFor(ADDERALL_UNAVAILABLE.generic_name!)).toBe(
      "Amphetamine Aspartate Monohydrate",
    );
  });
});

describe("materialHash", () => {
  const base = {
    availability: "available" as const,
    status: "current" as const,
    shortageReason: undefined,
    relatedInfo: undefined,
    presentationText: "Tablet, 20mg",
    companyName: "Alvogen",
  };

  it("is stable for identical material content", () => {
    expect(materialHash(base)).toBe(materialHash({ ...base }));
  });

  it("changes when availability changes", () => {
    expect(materialHash({ ...base, availability: "unavailable" })).not.toBe(
      materialHash(base),
    );
  });

  it("changes when the recovery estimate changes", () => {
    expect(
      materialHash({ ...base, relatedInfo: "Estimated availability: Nov 2026" }),
    ).not.toBe(materialHash(base));
  });

  it("does not collide on adjacent field values", () => {
    // A naive concatenation would make ("ab","c") and ("a","bc") identical.
    expect(
      materialHash({ ...base, presentationText: "ab", companyName: "c" }),
    ).not.toBe(materialHash({ ...base, presentationText: "a", companyName: "bc" }));
  });
});

describe("normalizeRecord", () => {
  it("normalizes a real record end to end", () => {
    const r = normalizeRecord(QUINAPRIL)!;
    expect(r).not.toBeNull();
    expect(r.packageNdc).toBe("43547-411-09");
    expect(r.availability).toBe("unavailable");
    expect(r.status).toBe("current");
    expect(r.slug).toBe("quinapril-hydrochloride-tablet");
    expect(r.fdaUpdateAtMs).toBe(Date.UTC(2026, 5, 29));
    expect(r.recoveryDateText).toBeUndefined();
    expect(r.therapeuticCategories).toEqual(["Cardiovascular"]);
  });

  it("captures the recovery estimate when the FDA gives one", () => {
    expect(normalizeRecord(ADDERALL_UNAVAILABLE)!.recoveryDateText).toBe(
      "October 2026",
    );
  });

  it("THE PRODUCT: two NDCs of one in-shortage drug differ in availability", () => {
    // This is the entire thesis. Same drug, same "Current" shortage status,
    // one manufacturer available and one not — which is why a patient should
    // ask for NDC 47781-179-01 by number instead of calling 13 pharmacies.
    const unavailable = normalizeRecord(ADDERALL_UNAVAILABLE)!;
    const available = normalizeRecord(ADDERALL_AVAILABLE)!;

    expect(unavailable.slug).toBe(available.slug);
    expect(unavailable.status).toBe("current");
    expect(available.status).toBe("current");
    expect(unavailable.availability).toBe("unavailable");
    expect(available.availability).toBe("available");
    expect(unavailable.recordKey).not.toBe(available.recordKey);
  });

  it("keys on NDC + company, so one NDC under two companies stays distinct", () => {
    expect(recordKeyFor("47781-179-01", "Alvogen", "current", "Tablet, 20mg")).not.toBe(
      recordKeyFor("47781-179-01", "Aurobindo Pharma USA", "current", "Tablet, 20mg"),
    );
  });

  it("record keys are case and whitespace stable across syncs", () => {
    expect(recordKeyFor(" 47781-179-01 ", "ALVOGEN", "current", " Tablet, 20mg ")).toBe(
      recordKeyFor("47781-179-01", "Alvogen", "current", "Tablet, 20mg"),
    );
  });

  it("separates one NDC published as two different doses", () => {
    // Real: NDC 57664-048-88 is published by Sun as BOTH Lisdexamfetamine
    // 20 mg and 30 mg. An NDC+company key would drop one of them.
    expect(
      recordKeyFor("57664-048-88", "Sun Pharmaceutical Industries, Inc.", "current", "Lisdexamfetamine Dimesylate, Capsule, 20 mg"),
    ).not.toBe(
      recordKeyFor("57664-048-88", "Sun Pharmaceutical Industries, Inc.", "current", "Lisdexamfetamine Dimesylate, Capsule, 30 mg"),
    );
  });

  it("separates one NDC appearing as both current and to-be-discontinued", () => {
    // Real: Furosemide 25021-311-04 from Gland Pharma is in both lists.
    const p = "Furosemide, Injection, 10 mg/1 mL";
    expect(recordKeyFor("25021-311-04", "Gland Pharma Limited", "current", p)).not.toBe(
      recordKeyFor("25021-311-04", "Gland Pharma Limited", "to_be_discontinued", p),
    );
  });

  it("the key does not move when the content it describes changes", () => {
    // The whole point of a stable key: availability flips must be detected as
    // a CHANGE to an existing row, not as a new row plus a retirement.
    const before = normalizeRecord(QUINAPRIL)!;
    const after = normalizeRecord({
      ...QUINAPRIL,
      availability: "Available",
      related_info: "Estimated availability: October 2026",
      update_date: "09/11/2026",
    })!;
    expect(after.recordKey).toBe(before.recordKey);
    expect(after.materialHash).not.toBe(before.materialHash);
  });
});

describe("supersedeDuplicates", () => {
  const make = (relatedInfo: string, updateDate: string) =>
    normalizeRecord({
      package_ndc: "65219-082-10",
      generic_name: "Ropivacaine Hydrochloride Injection",
      company_name: "Jiangsu Hengrui Pharmaceuticals Co., Ltd.",
      presentation: "Ropivacaine Hydrochloride, Injection, 2 mg/1 mL",
      status: "To Be Discontinued",
      related_info: relatedInfo,
      update_date: updateDate,
    })!;

  it("keeps the newer posting when the FDA republishes a package", () => {
    // Real pair: the same discontinuation reposted with the marketer added.
    const older = make("Discontinuation of the manufacture of the drug", "05/21/2026");
    const newer = make(
      "Marketed by Fresenius Kabi, USA; Discontinuation of the manufacture of the drug",
      "06/30/2026",
    );
    expect(older.recordKey).toBe(newer.recordKey);

    for (const order of [[older, newer], [newer, older]]) {
      const out = supersedeDuplicates(order);
      expect(out).toHaveLength(1);
      expect(out[0].fdaUpdateDate).toBe("06/30/2026");
    }
  });

  it("is order independent, so a row cannot flap between syncs", () => {
    const a = make("first", "05/21/2026");
    const b = make("second", "06/30/2026");
    expect(supersedeDuplicates([a, b])[0].materialHash).toBe(
      supersedeDuplicates([b, a])[0].materialHash,
    );
  });

  it("leaves genuinely distinct records alone", () => {
    const distinct = [
      normalizeRecord(QUINAPRIL)!,
      normalizeRecord(ADDERALL_AVAILABLE)!,
      normalizeRecord(ADDERALL_UNAVAILABLE)!,
    ];
    expect(supersedeDuplicates(distinct)).toHaveLength(3);
  });

  it("treats a missing update date as oldest rather than crashing", () => {
    const dated = make("dated", "06/30/2026");
    const undated = normalizeRecord({
      package_ndc: "65219-082-10",
      generic_name: "Ropivacaine Hydrochloride Injection",
      company_name: "Jiangsu Hengrui Pharmaceuticals Co., Ltd.",
      presentation: "Ropivacaine Hydrochloride, Injection, 2 mg/1 mL",
      status: "To Be Discontinued",
      related_info: "undated",
    })!;
    const out = supersedeDuplicates([undated, dated]);
    expect(out).toHaveLength(1);
    expect(out[0].fdaUpdateDate).toBe("06/30/2026");
  });

  it("drops a row with no NDC rather than minting a churning synthetic key", () => {
    expect(normalizeRecord({ ...QUINAPRIL, package_ndc: undefined })).toBeNull();
    expect(normalizeRecord({ ...QUINAPRIL, generic_name: "  " })).toBeNull();
  });

  it("survives a record that is missing every optional field", () => {
    const r = normalizeRecord({
      package_ndc: "1-2-3",
      generic_name: "Mystery Drug",
    })!;
    expect(r.availability).toBe("unknown");
    expect(r.companyName).toBe("Unknown manufacturer");
    expect(r.therapeuticCategories).toEqual([]);
  });

  it("REVERIFIED: update_date moving must not change the material hash", () => {
    // 853 of 1602 live records carry update_type "Reverified". If the hash
    // moved with update_date, every reverification would emit a false event
    // and the live ticker would be pure noise. This is the load-bearing test.
    const before = normalizeRecord(QUINAPRIL)!;
    const after = normalizeRecord({
      ...QUINAPRIL,
      update_date: "09/11/2026",
      update_type: "Reverified",
    })!;

    expect(after.fdaUpdateDate).not.toBe(before.fdaUpdateDate);
    expect(after.materialHash).toBe(before.materialHash);
  });

  it("a genuine availability flip does change the hash", () => {
    const before = normalizeRecord(QUINAPRIL)!;
    const after = normalizeRecord({ ...QUINAPRIL, availability: "Available" })!;
    expect(after.materialHash).not.toBe(before.materialHash);
  });
});

describe("hash64", () => {
  it("is deterministic and fixed width", () => {
    expect(hash64("fillable")).toBe(hash64("fillable"));
    expect(hash64("fillable")).toHaveLength(16);
    expect(hash64("")).toHaveLength(16);
  });

  it("differs for different input", () => {
    expect(hash64("a")).not.toBe(hash64("b"));
  });
});
