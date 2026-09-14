import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { AppShell } from "../components/AppShell";
import { Skeleton } from "../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

/**
 * Where the two official sources disagree.
 *
 * ASHP and the FDA both track US shortages and do not agree; ASHP's own
 * documentation says it frequently lists more. Anyone checking one source is
 * seeing part of the picture, and the drugs in the gap have included
 * vancomycin and two chemotherapy agents.
 */
export function Conflicts() {
  const navigate = useNavigate();
  const rows = useQuery(api.sources.disagreements, { limit: 50 });
  const coverage = useQuery(api.sources.coverage, {});

  return (
    <AppShell title="Source conflicts">
      <div className="space-y-3">
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          Listed as a current shortage by ASHP, but not marked current in the FDA
          record.
          {coverage !== undefined && coverage.ashpBulletins > 0 && (
            <>
              {" "}
              Reconciled across{" "}
              <span className="tnum font-medium text-foreground">
                {coverage.ashpBulletins}
              </span>{" "}
              ASHP bulletins, of which{" "}
              <span className="tnum font-medium text-foreground">
                {coverage.ashpMatched}
              </span>{" "}
              are matched to an FDA drug.
            </>
          )}{" "}
          Neither source is wrong — they use different criteria. Both are worth
          checking, which is the point.
        </p>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {rows === undefined ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="px-3 py-2.5">
                  <Skeleton className="h-4 w-full max-w-lg" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              No conflicts detected in the current data.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 text-xs">Medication (FDA)</TableHead>
                  <TableHead className="h-8 text-xs">ASHP bulletin</TableHead>
                  <TableHead className="h-8 text-xs">Revised</TableHead>
                  <TableHead className="h-8 w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ bulletin, drugSlug, drugName }) => (
                  <TableRow
                    key={bulletin._id}
                    tabIndex={0}
                    role="link"
                    className="cursor-pointer"
                    onClick={() => navigate(`/d/${drugSlug}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/d/${drugSlug}`);
                    }}
                  >
                    <TableCell className="py-2 text-[0.8125rem] font-medium">
                      {drugName}
                    </TableCell>
                    <TableCell className="py-2 text-[0.8125rem] text-muted-foreground">
                      {bulletin.title}
                    </TableCell>
                    <TableCell className="tnum py-2 text-xs text-muted-foreground">
                      {bulletin.revisionDateText ?? "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      <ChevronRight
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
