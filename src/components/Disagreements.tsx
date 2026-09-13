import { useQuery } from "convex/react";
import { Scale } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";

/**
 * Where the two official sources disagree.
 *
 * Deliberately prominent. A pharmacist or patient checking one source is seeing
 * part of the picture, and the drugs that fall in the gap have included
 * vancomycin and two chemotherapy agents.
 */
export function Disagreements({ limit = 8 }: { limit?: number }) {
  const rows = useQuery(api.sources.disagreements, { limit });
  const coverage = useQuery(api.sources.coverage, {});

  if (rows === undefined || rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-medium text-text">
        <Scale className="size-3.5 text-warn" aria-hidden="true" />
        The two official sources disagree
      </h2>
      <p className="mb-3 max-w-2xl text-xs text-text-muted leading-relaxed">
        ASHP and the FDA both track US drug shortages, and ASHP&rsquo;s own
        documentation says it frequently lists more of them. These are currently
        on ASHP&rsquo;s shortage list but not marked as a current shortage in the
        FDA record.
        {coverage !== undefined && coverage.ashpBulletins > 0 && (
          <>
            {" "}
            Read from {coverage.ashpBulletins} ASHP bulletins.
          </>
        )}
      </p>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-warn-border bg-surface">
        {rows.map(({ bulletin, drugSlug, drugName }) => (
          <li key={bulletin._id} className="px-4 py-2.5 text-sm">
            <Link
              to={`/d/${drugSlug}`}
              className="font-medium text-text hover:text-accent"
            >
              {drugName}
            </Link>
            <p className="mt-0.5 text-xs text-text-muted">
              ASHP: <span className="text-text">{bulletin.title}</span>
              {bulletin.revisionDateText !== undefined && (
                <> · revised {bulletin.revisionDateText}</>
              )}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-text-faint">
        Neither source is wrong — they use different criteria and different
        reporting. Both are worth checking, which is the point.
      </p>
    </section>
  );
}
