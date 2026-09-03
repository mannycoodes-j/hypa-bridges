import { cn } from "../../lib/cn";

/** Bridge mark: two dots joined by a line — two languages, one conversation. */
export function BridgeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("size-8", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <circle cx="11" cy="16" r="3.2" className="fill-primary-foreground" />
      <circle cx="21" cy="16" r="3.2" className="fill-tertiary" />
      <path
        d="M14.2 16h3.6"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="stroke-tertiary"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2.5 font-semibold tracking-tight",
        className,
      )}
    >
      <BridgeMark className="size-7" />
      <span className="text-[15px]">
        Hypa <span className="text-tertiary">Bridge</span>
      </span>
    </span>
  );
}
