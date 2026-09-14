import { describe, expect, it } from "vitest";
import { detectRoute, routesCompatible } from "./route";

describe("detectRoute", () => {
  it("reads the common routes", () => {
    expect(detectRoute("Vancomycin Hydrochloride Injection")).toBe("parenteral");
    expect(detectRoute("Calcitriol Capsule")).toBe("oral");
    expect(detectRoute("Morphine Sulfate Immediate-Release Tablets")).toBe("oral");
    expect(detectRoute("0.9% Sodium Chloride Irrigation")).toBe("irrigation");
    expect(detectRoute("Lidocaine 5% Transdermal Patch")).toBe("topical");
    expect(detectRoute("Albuterol Inhalation Solution")).toBe("inhalation");
  });

  it("reads an injectable suspension as parenteral, not oral", () => {
    // "suspension" alone suggests oral; the longer phrase must win.
    expect(detectRoute("Triamcinolone Acetonide Injectable Suspension")).toBe(
      "parenteral",
    );
  });

  it("reads auto-injectors and syringes as parenteral", () => {
    expect(detectRoute("Epinephrine Auto-Injectors")).toBe("parenteral");
    expect(detectRoute("Enoxaparin Prefilled Syringe")).toBe("parenteral");
  });

  it("returns unknown rather than guessing", () => {
    expect(detectRoute("Amino Acid Products")).toBe("unknown");
    expect(detectRoute("Adalimumab-ryvk Kit")).toBe("unknown");
  });
});

describe("routesCompatible", () => {
  it("BLOCKS the match the model kept making despite being told not to", () => {
    // Real defect: the model matched these even with the pair named verbatim
    // in its instructions. A prompt rule is a request; this is enforcement.
    expect(
      routesCompatible("Calcitriol Injection", "Calcitriol Capsule"),
    ).toBe(false);
  });

  it("blocks irrigation against injection", () => {
    // Irrigation fluid is not injectable, however identical the molecule.
    expect(
      routesCompatible(
        "0.9% Sodium Chloride Irrigation",
        "Sodium Chloride 0.9% Injection",
      ),
    ).toBe(false);
  });

  it("allows the same route with different wording", () => {
    expect(
      routesCompatible("Ketamine Injection", "Ketamine Hydrochloride Injection"),
    ).toBe(true);
    expect(
      routesCompatible(
        "Triamcinolone Acetonide Injectable Suspension",
        "Triamcinolone Acetonide Injection",
      ),
    ).toBe(true);
    expect(
      routesCompatible("Epinephrine Auto-Injectors", "Epinephrine Injection"),
    ).toBe(true);
  });

  it("treats tablet and capsule as compatible, both being oral", () => {
    expect(
      routesCompatible(
        "Mesalamine Extended-Release Capsules",
        "Mesalamine Tablet",
      ),
    ).toBe(true);
  });

  it("allows a pairing when either side states no route", () => {
    // Absence of evidence is not a conflict, and rejecting on it would discard
    // correct matches the shortlist already established are the same molecule.
    expect(
      routesCompatible("Adalimumab-ryvk Subcutaneous Injection", "Adalimumab-ryvk Kit"),
    ).toBe(true);
    expect(routesCompatible("Amino Acid Products", "Amino Acid Injection")).toBe(
      true,
    );
  });

  it("blocks topical against oral", () => {
    expect(routesCompatible("Diclofenac Gel", "Diclofenac Tablet")).toBe(false);
  });
});
