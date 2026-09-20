import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { CommandPalette } from "./CommandPalette";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="relative inline-flex h-4 w-7 -rotate-[24deg] overflow-hidden rounded-full ring-1 ring-foreground/10"
      >
        <span className="h-full w-1/2 bg-primary" />
        <span className="h-full w-1/2 bg-low" />
      </span>
      <span className="font-display text-xl font-bold tracking-tight">fillable</span>
    </span>
  );
}

const ghost =
  "inline-flex h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function SiteHeader({ showSearch = true }: { showSearch?: boolean }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Fillable home" className="rounded-md">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1">
          <Link to="/#board" className={ghost}>
            Shortages
          </Link>
          <Link to="/#how" className={cn(ghost, "max-sm:hidden")}>
            How it works
          </Link>
          {showSearch && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Search className="size-4" aria-hidden="true" />
              Search
              <kbd className="hidden rounded border border-primary-foreground/30 px-1 font-mono text-[0.625rem] sm:inline">
                ⌘K
              </kbd>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-sm text-pretty leading-relaxed">
            Package-level availability from the FDA Drug Shortages database and ASHP, refreshed
            throughout the day.
          </p>
          <nav aria-label="Data" className="flex gap-4 text-xs">
            <Link to="/conflicts" className="hover:text-foreground">
              Source conflicts
            </Link>
            <Link to="/pipeline" className="hover:text-foreground">
              Pipeline
            </Link>
          </nav>
        </div>
        {/*
          Non-negotiable framing: this reports supply facts published by the
          FDA and must never read as though it advises anyone on treatment.
        */}
        <p className="max-w-md text-pretty leading-relaxed">
          <span className="font-medium text-foreground">Supply information, not medical advice.</span>{" "}
          Fillable reports what manufacturers tell the FDA. It is not a guarantee of stock at any
          pharmacy. Always confirm with your pharmacist or prescriber.
        </p>
      </div>
    </footer>
  );
}

export function Page({ children, showSearch }: { children: ReactNode; showSearch?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader showSearch={showSearch} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
