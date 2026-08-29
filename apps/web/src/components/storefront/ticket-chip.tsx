// Design v1.1 — the ticket chip. The signature element and the only place a dashed border is
// permitted: notched corners cut with clip-path, the dashed flame rule inset 4px and following
// the notch. ONE parameterised component: `lg` on the confirmation and the kitchen card, `sm` in
// admin tables. Never two implementations.
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
  return <span className={cn("chip", size === "lg" && "chip-lg", className)}>{orderNumber}</span>;
}
