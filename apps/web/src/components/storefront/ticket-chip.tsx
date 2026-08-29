// SPRINT-14: the ticket chip (design.md §4.1, §7.8) — the signature element and the only place
// a dashed border is permitted. ONE parameterised component: `lg` on the confirmation and the
// KDS, `sm` in admin tables. Never two implementations.
import { cn } from "@/lib/utils";

export function TicketChip({
  orderNumber,
  size = "lg",
  className,
}: {
  orderNumber: string;
  size?: "lg" | "sm";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm bg-paper-sunk",
        size === "lg" ? "p-1" : "p-0.5",
        className,
      )}
    >
      <span
        className={cn(
          "ticket-chip-rule inline-flex items-center rounded-sm uppercase text-ink",
          size === "lg" ? "t-mono-lg px-4 py-1.5" : "t-mono px-2 py-0.5",
        )}
      >
        {orderNumber}
      </span>
    </span>
  );
}
