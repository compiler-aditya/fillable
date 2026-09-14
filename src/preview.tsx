/**
 * Component fixtures. No Convex, no auth, no network.
 *
 * Exists so the availability states — including the awkward ones like a package
 * with no stated availability, or a drug where nothing is gettable — can be
 * designed and checked without waiting for the FDA to produce that case.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Doc } from "../convex/_generated/dataModel";
import { AvailabilityBadge, AvailabilityBar, AvailabilityCounts } from "./components/Availability";
import "./index.css";

const base = {
  _id: "p1" as Doc<"presentations">["_id"],
  _creationTime: 0,
  drugId: "d1" as Doc<"presentations">["drugId"],
  recordKey: "k",
  packageNdc: "47781-179-01",
  companyName: "Alvogen",
  presentationText: "Amphetamine Aspartate Monohydrate, Tablet, 20mg",
  brandNames: ["ADDERALL"],
  materialHash: "h",
  lastSeenAt: 0,
  isRetired: false,
} satisfies Omit<Doc<"presentations">, "availability" | "status">;

const fixtures: Doc<"presentations">[] = [
  { ...base, availability: "available", status: "current" },
  { ...base, availability: "limited", status: "current" },
  { ...base, availability: "unavailable", status: "current" },
  // The 444 records where the FDA states no availability at all.
  { ...base, availability: "unknown", status: "to_be_discontinued" },
  { ...base, availability: "unknown", status: "resolved" },
];

export function Preview() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <h1 className="text-xl font-semibold">Availability states</h1>

      <div className="flex flex-wrap gap-2">
        {fixtures.map((p, i) => (
          <AvailabilityBadge key={i} presentation={p} />
        ))}
      </div>

      <h2 className="text-sm font-medium">Distribution bars</h2>
      <div className="space-y-4">
        {[
          { available: 44, limited: 9, unavailable: 20 },
          { available: 56, limited: 33, unavailable: 1 },
          { available: 0, limited: 0, unavailable: 12 },
          { available: 7, limited: 0, unavailable: 0 },
        ].map((d, i) => (
          <div key={i} className="space-y-1">
            <AvailabilityBar {...d} />
            <AvailabilityCounts {...d} />
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
