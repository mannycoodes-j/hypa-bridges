import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "../../lib/cn";
import type { Language } from "../../lib/types";

export interface LanguagePickerProps {
  languages: Language[];
  value?: string;
  onValueChange: (label: string) => void;
  placeholder?: string;
  align?: "start" | "center" | "end";
  disabled?: boolean;
}

/** Radix-Popover language picker with instant filtering. */
export function LanguagePicker({
  languages,
  value,
  onValueChange,
  placeholder = "Choose a language",
  align = "start",
  disabled,
}: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter((l) => l.label.toLowerCase().includes(q));
  }, [languages, query]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3.5 text-sm font-medium shadow-xs transition-colors",
            "hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tertiary/15 text-[11px] font-semibold text-tertiary"
              >
                {value.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{value}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className={cn(
            "z-50 w-[280px] rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
          role="listbox"
        >
          <div className="relative mb-1.5">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search languages…"
              role="combobox"
              aria-label="Search languages"
              className="h-9 w-full rounded-lg border border-transparent bg-secondary pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <ul className="no-scrollbar max-h-72 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No languages match “{query}”.
              </li>
            )}
            {filtered.map((lang) => {
              const selected = lang.label.toLowerCase() === value?.toLowerCase();
              return (
                <li key={lang.label} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onValueChange(lang.label);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-tertiary/12 font-medium text-tertiary"
                        : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <span className="truncate">{lang.label}</span>
                    {lang.voices && lang.voices.length > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {lang.voices.length} {lang.voices.length === 1 ? "voice" : "voices"}
                      </span>
                    )}
                    {selected && <Check aria-hidden className="size-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
