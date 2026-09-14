import { useQuery } from "convex/react";
import { ChevronRight, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Card } from "./ui/card";

/**
 * Where the two official sources disagree.
 *
 * ASHP and the FDA both track US drug shortages and do not agree — ASHP's own
 * documentation says it frequently lists more. Someone checking one source is
 * seeing part of the picture, and the drugs that fall in the gap have included
 * vancomycin and two chemotherapy agents.
 */
export function Disagreements({ limit = 6 }: { limit?: number }) {
  const rows = useQuery(api.sources.disagreements, { limit });
  const coverage = useQuery(api.sources.coverage, {});

  if (rows === undefined || rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <Scale className="size-3.5 text-low" aria-hidden="true" />
        The two official sources disagree
      </h2>
      <p className="mb-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
        These are on ASHP&rsquo;s current shortage list but not marked as a
        current shortage in the FDA record.
        {coverage !== undefined && coverage.ashpBulletins > 0 && (
          <> Read from {coverage.ashpBulletins} ASHP bulletins.</>
        )}
      </p>

      <Card className="divide-y divide-border overflow-hidden border-low-border p-0">
        {rows.map(({ bulletin, drugSlug, drugName }) => (
          <Link
            key={bulletin._id}
            to={`/d/${drugSlug}`}
            className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{drugName}</p>
              <p className="truncate text-xs text-muted-foreground">
                ASHP: {bulletin.title}
                {bulletin.revisionDateText !== undefined && (
                  <> · revised {bulletin.revisionDateText}</>
                )}
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </Card>

      <p className="mt-2 text-xs text-muted-foreground">
        Neither source is wrong — they use different criteria and different
        reporting. Both are worth checking, which is the point.
      </p>
    </section>
  );
}
