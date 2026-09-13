import { describe, expect, it } from "vitest";
import {
  ASHP_BY_REVISION_URL,
  ashpPageActions,
  matchKey,
  parseAshpDate,
  parseAshpList,
} from "./ashpParse";

/**
 * Verbatim excerpt of what Firecrawl returned from ASHP on 2026-09-13.
 *
 * Kept as a fixture rather than fetched in tests, so a change to ASHP's markup
 * shows up as a failing test with a visible diff instead of a flaky network
 * call — and so the suite runs without an API key.
 */
const FIXTURE = `
## Current Drug Shortage Bulletins

Entries:
10

| Generic Name | Revision Date | Created Date |
| --- | --- | --- |
| [0.9% Sodium Chloride Irrigation](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=811) | Apr 22, 2026 | Feb 25, 2022 |
| [5% Dextrose Injection Small Volume Bags](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=798) | Mar 31, 2026 | Feb 04, 2022 |
| [Acetazolamide Injection](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=1179) | Aug 24, 2026 | Sep 22, 2025 |
| [Acetylcysteine Intravenous Solution](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=1212) | Aug 04, 2026 | Mar 13, 2026 |
| [Activated Charcoal Oral Suspension](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=1232) | Jul 08, 2026 | Jun 23, 2026 |
| [Acyclovir Injection](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=1196) | Sep 03, 2026 | Dec 16, 2025 |
| [Adalimumab-ryvk Subcutaneous Injection](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=1236) | Aug 26, 2026 | Jul 09, 2026 |
| [Aluminum Chloride Hexahydrate Topical Solution](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=1233) | Aug 03, 2026 | Jun 23, 2026 |
| [Amino Acid Products](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=564) | Aug 04, 2026 | May 15, 2019 |
| [Amiodarone Injection](https://www.ashp.org/drug-shortages/current-shortages/Drug-Shortage-Detail.aspx?id=374) | Sep 08, 2026 | Jan 06, 2018 |

Showing 1 to 10 of 186 entries

Previous12345…19Next

## Related Links

|     |     |
| --- | --- |
| [Current Shortages](https://www.ashp.org/Drug-Shortages/Current-Shortages/drug-shortages-list?page=CurrentShortages) |  |
| [Discontinued Drugs](https://www.ashp.org/Drug-Shortages/Current-Shortages/drug-shortages-list?page=DrugsNoLongerAvailable) |  |
`;

describe("parseAshpList", () => {
  const page = parseAshpList(FIXTURE);

  it("reads every bulletin row", () => {
    expect(page.bulletins).toHaveLength(10);
  });

  it("captures id, title, url and both dates", () => {
    const first = page.bulletins[0];
    expect(first.bulletinId).toBe("811");
    expect(first.title).toBe("0.9% Sodium Chloride Irrigation");
    expect(first.detailUrl).toContain("Drug-Shortage-Detail.aspx?id=811");
    expect(first.revisionDateText).toBe("Apr 22, 2026");
    expect(first.revisionAtMs).toBe(Date.UTC(2026, 3, 22));
    expect(first.createdDateText).toBe("Feb 25, 2022");
  });

  it("reads the total so the sweep knows how many pages to walk", () => {
    // 186 bulletins at 10 per page is 19 pages — the crawl budget depends on it.
    expect(page.totalEntries).toBe(186);
  });

  it("ignores the related-links table, which has no bulletin ids", () => {
    // Those rows link to list pages, not Drug-Shortage-Detail.aspx.
    expect(page.bulletins.every((b) => /^\d+$/.test(b.bulletinId))).toBe(true);
    expect(page.bulletins.some((b) => b.title === "Current Shortages")).toBe(
      false,
    );
  });

  it("keeps titles with punctuation and percentages intact", () => {
    expect(page.bulletins[1].title).toBe(
      "5% Dextrose Injection Small Volume Bags",
    );
    expect(page.bulletins[6].title).toBe(
      "Adalimumab-ryvk Subcutaneous Injection",
    );
  });

  it("returns nothing rather than throwing on unrelated markdown", () => {
    const empty = parseAshpList("# Some other page\n\nNo table here.");
    expect(empty.bulletins).toEqual([]);
    expect(empty.totalEntries).toBeUndefined();
  });

  it("does not emit a duplicate when an id appears twice", () => {
    const doubled = parseAshpList(FIXTURE + FIXTURE);
    expect(doubled.bulletins).toHaveLength(10);
  });
});

describe("parseAshpDate", () => {
  it("parses ASHP's format as UTC", () => {
    expect(parseAshpDate("Sep 08, 2026")).toBe(Date.UTC(2026, 8, 8));
    expect(parseAshpDate("Jan 06, 2018")).toBe(Date.UTC(2018, 0, 6));
  });

  it("returns undefined for anything else, never NaN", () => {
    expect(parseAshpDate("2026-09-08")).toBeUndefined();
    expect(parseAshpDate("Smarch 40, 2026")).toBeUndefined();
    expect(parseAshpDate(undefined)).toBeUndefined();
  });
});

describe("ashpPageActions", () => {
  // ASHP paginates server-side with no usable URL parameter. A guessed
  // `pageNum` is silently ignored and every request returns page one — which
  // cost 19 credits to learn and yielded 10 bulletins. Its own page-size
  // control does work, so the table is driven rather than the URL.
  it("sets the page size before reading, on every page", () => {
    for (const index of [0, 1, 2]) {
      const scripts = ashpPageActions(index)
        .filter((a) => a.type === "executeJavascript")
        .map((a) => (a as { script: string }).script);
      expect(scripts[0]).toContain("value='100'");
    }
  });

  it("clicks Next once per page beyond the first", () => {
    const nextCount = (index: number) =>
      ashpPageActions(index)
        .filter(
          (a) =>
            a.type === "executeJavascript" &&
            /next/i.test((a as { script: string }).script),
        ).length;

    expect(nextCount(0)).toBe(0);
    expect(nextCount(1)).toBe(1);
    expect(nextCount(2)).toBe(2);
  });

  it("waits after every interaction so the table can re-render", () => {
    const actions = ashpPageActions(1);
    expect(actions[actions.length - 1].type).toBe("wait");
  });

  it("has a revision-sorted url for the cheap changefeed pass", () => {
    expect(ASHP_BY_REVISION_URL).toContain("sort=2");
  });
});

describe("matchKey", () => {
  it("collapses dosage-form wording so obvious pairs line up", () => {
    expect(matchKey("Acyclovir Injection")).toBe("acyclovir");
    expect(matchKey("Amiodarone Injection")).toBe("amiodarone");
  });

  it("does not force clinical and chemical names together", () => {
    // ASHP says "Amino Acid Products", the FDA says "Amino Acid Injection".
    // Both reduce to "amino acid" here, which is a candidate, not a verdict —
    // anything ambiguous stays unmatched for a model pass rather than guessed.
    expect(matchKey("Amino Acid Products")).toBe("amino acid");
    expect(matchKey("Amino Acid Injection")).toBe("amino acid");

    // But genuinely different drugs must never collide.
    expect(matchKey("Acetazolamide Injection")).not.toBe(
      matchKey("Acetylcysteine Intravenous Solution"),
    );
  });
});
