import { Activity, Pill } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-border sticky top-0 z-20 bg-bg/85 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-text"
          >
            <Pill className="size-5 text-accent" aria-hidden="true" />
            Fillable
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                pathname === "/"
                  ? "bg-surface-2 text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              Medications
            </Link>
            <Link
              to="/pipeline"
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                pathname === "/pipeline"
                  ? "bg-surface-2 text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Activity className="size-3.5" aria-hidden="true" />
              Live data
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-border mt-8">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-text-faint space-y-2">
          {/*
            Non-negotiable framing. This product reports supply facts published
            by the FDA. It does not advise anyone on what to take, and must
            never read as if it does.
          */}
          <p className="max-w-2xl">
            <strong className="text-text-muted">
              Fillable reports drug supply information. It is not medical advice.
            </strong>{" "}
            Availability shown here is what manufacturers reported to the FDA — it
            is not a live view of any pharmacy's stock. Always confirm with your
            pharmacist, and never change how you take a medication without
            speaking to your prescriber.
          </p>
          <p>
            Source:{" "}
            <a
              className="underline hover:text-text-muted"
              href="https://open.fda.gov/apis/drug/shortages/"
              target="_blank"
              rel="noreferrer noopener"
            >
              openFDA drug shortages
            </a>
            . Built for the Convex All Gas Hackathon.
          </p>
        </div>
      </footer>
    </div>
  );
}
