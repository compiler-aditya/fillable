import { describe, expect, it } from "vitest";
import { readableStrength, relativeTime, shortPresentation } from "./format";

describe("readableStrength", () => {
  it("totals a combination product published one salt at a time", () => {
    // Generic Adderall 5 mg is four salts of 1.25 mg. The FDA publishes the
    // same drug from Alvogen directly as "5mg", which confirms the sum.
    expect(readableStrength("1.25 mg; 1.25 mg; 1.25 mg; 1.25 mg")).toBe(
      "5mg total (4 × 1.25mg)",
    );
    expect(readableStrength("7.5 mg; 7.5 mg; 7.5 mg; 7.5 mg")).toBe(
      "30mg total (4 × 7.5mg)",
    );
  });

  it("trims floating point noise", () => {
    // 1.875 × 4 is 7.5, not 7.500000000000001.
    expect(readableStrength("1.875 mg; 1.875 mg; 1.875 mg; 1.875 mg")).toBe(
      "7.5mg total (4 × 1.875mg)",
    );
    expect(readableStrength("3.125 mg; 3.125 mg; 3.125 mg; 3.125 mg")).toBe(
      "12.5mg total (4 × 3.125mg)",
    );
  });

  it("never invents a total across genuinely different strengths", () => {
    // A real combination like amoxicillin/clavulanate must stay verbatim.
    const mixed = "500 mg; 125 mg";
    expect(readableStrength(mixed)).toBe(mixed);
  });

  it("never totals across different units", () => {
    const mixed = "5 mg; 5 mL";
    expect(readableStrength(mixed)).toBe(mixed);
  });

  it("leaves a single strength alone", () => {
    expect(readableStrength("20mg")).toBe("20mg");
    expect(readableStrength("10 mg/1 mL")).toBe("10 mg/1 mL");
  });

  it("leaves unparseable text exactly as published", () => {
    expect(readableStrength("as directed; see label")).toBe(
      "as directed; see label",
    );
  });
});

describe("shortPresentation", () => {
  it("drops the trailing NDC, which is already shown separately", () => {
    expect(
      shortPresentation(
        "Amphetamine Aspartate Monohydrate, Tablet, 20mg (NDC 47781-179-01)",
      ),
    ).toBe("Tablet, 20mg");
  });

  it("makes a multi-salt tablet readable", () => {
    expect(
      shortPresentation(
        "Amphetamine Aspartate Monohydrate, Amphetamine Sulfate, Dextroamphetamine Saccharate, Dextroamphetamine Sulfate, Tablet, 1.25 mg; 1.25 mg; 1.25 mg; 1.25 mg (NDC 0527-0760-37)",
      ),
    ).toBe("Tablet, 5mg total (4 × 1.25mg)");
  });

  it("handles a presentation with no trailing NDC", () => {
    expect(shortPresentation("Quinapril Hydrochloride, Tablet, 40mg")).toBe(
      "Tablet, 40mg",
    );
  });
});

describe("relativeTime", () => {
  const now = 1_000_000_000;
  it("reads naturally across the ranges", () => {
    expect(relativeTime(now, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2d ago");
  });

  it("never shows a negative age from clock skew", () => {
    expect(relativeTime(now + 60_000, now)).toBe("just now");
  });
});
