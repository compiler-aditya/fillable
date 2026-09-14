import { useQuery } from "convex/react";
import { Activity, GitCompareArrows, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";

/**
 * ⌘K search.
 *
 * The primary way to get to a medication. Full-text search runs server-side
 * over generic names and brands, so "adderall" resolves to the amphetamine
 * salts record without the reader knowing the chemistry.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setTerm(raw.trim()), 160);
    return () => clearTimeout(id);
  }, [raw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const results = useQuery(
    api.drugs.search,
    term.length >= 2 ? { q: term, limit: 12 } : "skip",
  );
  const suggestions = useQuery(
    api.drugs.suggestions,
    term.length >= 2 ? "skip" : { limit: 6 },
  );

  const go = (path: string) => {
    onOpenChange(false);
    setRaw("");
    navigate(path);
  };

  const list = term.length >= 2 ? results : suggestions;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Find a medication by brand or generic name"
    >
      {/*
        This shadcn CommandDialog renders its children straight into
        DialogContent without wrapping them in <Command>, so cmdk's store is
        never created and every child throws reading 'subscribe' on undefined.
        Supplying the provider here is the fix.

        shouldFilter is off because the server's full-text search has already
        ranked these; filtering again on the client would drop correct hits
        whose match came from a field not shown in the row.
      */}
      <Command shouldFilter={false}>
      <CommandInput
        value={raw}
        onValueChange={setRaw}
        placeholder="Search a medication — Adderall, Vyvanse, Ativan…"
      />
      <CommandList>
        {list !== undefined && list.length === 0 && (
          <CommandEmpty>
            {term.length >= 2
              ? `Nothing matched “${term}”. That usually means it is not on the FDA shortage list.`
              : "No medications loaded."}
          </CommandEmpty>
        )}

        {list !== undefined && list.length > 0 && (
          <CommandGroup heading={term.length >= 2 ? "Medications" : "Frequently checked"}>
            {list.map((d) => (
              <CommandItem
                key={d._id}
                /* The value is what cmdk filters on locally. Using the Convex
                   id here would make every server-ranked result vanish the
                   moment someone typed, because no id contains "adderall".
                   Feeding it the searchable text keeps the local filter in
                   agreement with the server's ranking. */
                value={`${d.displayName} ${d.genericName} ${d.brandNames.join(" ")}`}
                onSelect={() => go(`/d/${d.slug}`)}
                className="gap-3"
              >
                <span className="min-w-0 flex-1 truncate">{d.displayName}</span>
                {d.brandNames.length > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.brandNames[0]}
                  </span>
                )}
                <span className="tnum shrink-0 text-xs">
                  <span className="text-ok">{d.availableCount}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-none">{d.unavailableCount}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Go to">
          <CommandItem value="nav-shortages" onSelect={() => go("/")}>
            <Table2 className="size-4" aria-hidden="true" />
            Shortages
          </CommandItem>
          <CommandItem value="nav-conflicts" onSelect={() => go("/conflicts")}>
            <GitCompareArrows className="size-4" aria-hidden="true" />
            Source conflicts
          </CommandItem>
          <CommandItem value="nav-pipeline" onSelect={() => go("/pipeline")}>
            <Activity className="size-4" aria-hidden="true" />
            Pipeline
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
