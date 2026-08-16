"use client";

// Public order status — looked up by unguessable lookupToken only, never order number
// (STOREFRONT-REQUIREMENTS.md #3).
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PublicOrderStatusResponse } from "@harolds/types";
import { getOrderStatus, StorefrontApiError } from "@/lib/storefront-api";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Order received",
  PRINTED: "Sent to the kitchen",
  IN_PROGRESS: "Being prepared",
  READY: "Ready for pickup",
  COMPLETED: "Picked up",
  CANCELLED: "Cancelled",
};

export default function OrderStatusPage() {
  const params = useParams<{ lookupToken: string }>();
  const [order, setOrder] = useState<PublicOrderStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getOrderStatus(params.lookupToken);
        if (!cancelled) setOrder(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof StorefrontApiError
              ? "We couldn't find that order. Double-check your link."
              : "Something went wrong loading your order.",
          );
        }
      }
    };
    void load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.lookupToken]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-semibold text-destructive">{error}</p>
        <Link href="/">
          <Button className="mt-4">Back to menu</Button>
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 text-center text-muted-foreground">
        Loading your order…
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-12">
      <div className="flex flex-col items-center py-10 text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">Thanks, {order.firstName}!</h1>
        {order.orderNumber && (
          <p className="mt-1 text-muted-foreground">Order {order.orderNumber}</p>
        )}
        <p className="mt-3 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
          {STATUS_LABELS[order.status] ?? order.status}
        </p>
        {order.estimatedReadyAt && (
          <p className="mt-2 text-sm text-muted-foreground">
            Estimated ready:{" "}
            {new Date(order.estimatedReadyAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-border">
        <ul className="divide-y divide-border">
          {order.lines.map((line, i) => (
            <li key={i} className="flex justify-between px-4 py-3 text-sm">
              <div>
                <span className="font-medium">
                  {line.quantity} × {line.itemName}
                </span>
                {line.selectedModifiers.length > 0 && (
                  <p className="text-muted-foreground">
                    {line.selectedModifiers.map((m) => m.optionName).join(", ")}
                  </p>
                )}
              </div>
              <span className="font-medium">{formatCents(line.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-border px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCents(order.subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span>{formatCents(order.taxCents)}</span>
          </div>
          {order.tipCents > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tip</span>
              <span>{formatCents(order.tipCents)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-bold">
            <span>Total</span>
            <span>{formatCents(order.totalCents)}</span>
          </div>
        </div>
      </section>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Show this page or your confirmation at pickup. Pickup only — no delivery.
      </p>

      <div className="mt-6 flex justify-center">
        <Link href="/">
          <Button variant="outline">Order again</Button>
        </Link>
      </div>
    </div>
  );
}
