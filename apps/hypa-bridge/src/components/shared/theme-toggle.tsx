import { Monitor, Moon, Sun } from "lucide-react";
import { useStore } from "../../store";
import { cn } from "../../lib/cn";
import type { Theme } from "../../lib/types";

const OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "system", icon: Monitor, label: "System" },
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { settings, setSettings } = useStore();
  const theme: Theme = settings.theme ?? "system";

  if (compact) {
    const active = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[0]!;
    return (
      <button
        type="button"
        aria-label={`Theme: ${active.label}. Change theme`}
        title="Change theme"
        onClick={() => {
          const order: Theme[] = ["system", "light", "dark"];
          const next = order[(order.indexOf(theme) + 1) % order.length]!;
          setSettings({ theme: next });
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
      >
        <active.icon className="size-[18px]" aria-hidden />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-secondary p-0.5"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setSettings({ theme: value })}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
            theme === value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
