import { useQuery } from "convex/react";
import {
  Activity,
  GitCompareArrows,
  Menu,
  Pill,
  Search,
  Table2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/utils";
import { CommandPalette } from "./CommandPalette";
import { Button } from "./ui/button";

const NAV = [
  { to: "/explore", label: "Shortages", Icon: Table2 },
  { to: "/conflicts", label: "Source conflicts", Icon: GitCompareArrows },
  { to: "/pipeline", label: "Pipeline", Icon: Activity },
] as const;

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum font-medium">{value}</span>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const stats = useQuery(api.stats.global, {});

  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4"
        aria-label="Fillable home"
      >
        <Pill className="size-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold tracking-tight">Fillable</span>
      </Link>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV.map(({ to, label, Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      {stats !== undefined && stats !== null && (
        <div className="space-y-1.5 border-t border-border p-4">
          <SidebarStat
            label="Packages"
            value={stats.totalPresentations.toLocaleString()}
          />
          <SidebarStat
            label="Medications"
            value={stats.drugCount.toLocaleString()}
          />
          <SidebarStat
            label="Available in shortage"
            value={stats.availableInShortageCount.toLocaleString()}
          />
          <SidebarStat
            label="Firecrawl credits"
            value={stats.firecrawlCreditsUsedToday.toLocaleString()}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Application shell.
 *
 * Persistent sidebar, fixed top bar, dense scrolling content. Deliberately not
 * a centred marketing column: people open this to look one thing up, so the
 * screen budget belongs to rows of data, not to a headline.
 */
export function AppShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card/40 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-60 border-r border-border bg-background shadow-xl">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <Menu className="size-4" /> : <Menu className="size-4" />}
          </Button>

          <h1 className="truncate text-[0.8125rem] font-medium">{title}</h1>

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaletteOpen(true)}
              className="h-7 gap-2 px-2 text-xs text-muted-foreground"
            >
              <Search className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-border bg-muted px-1 font-mono text-[0.625rem] sm:inline">
                ⌘K
              </kbd>
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl p-4 sm:p-6">{children}</div>

          <footer className="mx-auto max-w-6xl border-t border-border px-4 py-5 sm:px-6">
            {/*
              Non-negotiable framing: this reports supply facts published by the
              FDA and must never read as though it advises anyone on treatment.
            */}
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                Supply information, not medical advice.
              </span>{" "}
              Availability is what manufacturers reported to the FDA, not a live
              view of pharmacy stock. Confirm with your pharmacist; never change
              how you take a medication without speaking to your prescriber.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

export { X };
