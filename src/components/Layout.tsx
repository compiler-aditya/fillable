import { Activity, Pill } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-tight"
          >
            <Pill className="size-4 text-primary" aria-hidden="true" />
            Fillable
          </Link>

          <nav className="ml-auto flex items-center gap-0.5">
            <NavLink to="/">Medications</NavLink>
            <NavLink to="/pipeline">
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5" aria-hidden="true" />
                Live data
              </span>
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>

      <footer className="mt-12 border-t border-border">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-8">
          {/*
            Non-negotiable framing. This reports supply facts published by the
            FDA. It does not advise anyone on what to take, and must never read
            as though it does.
          */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            <strong className="font-medium text-foreground">
              Fillable reports drug supply information. It is not medical advice.
            </strong>{" "}
            Availability here is what manufacturers reported to the FDA — not a
            live view of any pharmacy&rsquo;s stock. Confirm with your pharmacist,
            and never change how you take a medication without speaking to your
            prescriber.
          </p>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Data from{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://open.fda.gov/apis/drug/shortages/"
              target="_blank"
              rel="noreferrer noopener"
            >
              openFDA
            </a>{" "}
            and{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://www.ashp.org/drug-shortages/current-shortages"
              target="_blank"
              rel="noreferrer noopener"
            >
              ASHP
            </a>
            . Built for the Convex All Gas Hackathon.
          </p>
        </div>
      </footer>
    </div>
  );
}
