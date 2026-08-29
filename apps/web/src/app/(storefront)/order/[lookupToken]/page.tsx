"use client";

// SPRINT-14: confirmation (design.md §9.4). Ticket chip first at mono-lg, then the pickup
// estimate, the address with a maps link, the full order with modifiers, and the totals.
// No account prompt, no upsell, no "rate your experience".
//
// Public order status — looked up by unguessable lookupToken only, never order number
// (STOREFRONT-REQUIREMENTS.md #3). Every figure here comes from the server response.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PublicOrderStatusResponse, StoreStatus } from "@harolds/types";
import { getOrderStatus, getStoreStatus, StorefrontApiError } from "@/lib/storefront-api";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { TicketChip } from "@/components/storefront/ticket-chip";

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
  const [store, setStore] = useState<StoreStatus | null>(null);
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
              ? "We couldn't find that order. Check your link."
              : "We couldn't load your order. Try again.",
          );
        }
      }
    };
    void load();
    // §9.4 needs the store address and its maps link; the order payload does not carry one and
    // the contract is frozen, so the address comes from the existing public store-status
    // endpoint. Fetched once, not on the polling interval.
    void getStoreStatus()
      .then((s) => {
        if (!cancelled) setStore(s);
      })
      .catch(() => undefined);
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.lookupToken]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-4">
        <ErrorState message={error} />
        <div className="flex justify-center">
          <Link href="/menu">
            <Button variant="secondary">Back to the menu</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    // §12: the skeleton occupies the same box the loaded confirmation will.
    return (
      <div className="mx-auto min-h-dvh max-w-[560px] px-4 py-10">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-[46px] w-40" />
          <Skeleton className="h-[26px] w-56" />
          <Skeleton className="h-[22px] w-44" />
        </div>
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  }

  const address = store
    ? [store.addressLine1, store.addressLine2, `${store.city}, ${store.state} ${store.postalCode}`]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <div className="mx-auto min-h-dvh max-w-[560px] px-4 pb-16">
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        {order.orderNumber ? <TicketChip orderNumber={order.orderNumber} size="lg" /> : null}

        <h1 className="t-display-lg text-ink">
          {order.orderNumber ? `Order ${order.orderNumber} is in` : "Your order is in"}
        </h1>

        <Badge variant={order.status === "CANCELLED" ? "failed" : "paid"}>
          {STATUS_LABELS[order.status] ?? order.status}
        </Badge>

        {order.estimatedReadyAt && (
          <p className="t-body-lg t-nums text-ink">
            Ready at about{" "}
            {new Date(order.estimatedReadyAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}

        <p className="t-body text-ink-muted">A text message is on its way.</p>
      </div>

      {address ? (
        <section className="mb-6 rounded-md border border-line bg-surface p-4">
          <h2 className="t-label mb-2 text-ink-muted">Pick up at</h2>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(`${store!.storeName}, ${address}`)}`}
            target="_blank"
            rel="noreferrer"
            className="t-body text-ink underline underline-offset-4"
          >
            {address}
          </a>
        </section>
      ) : null}

      <section className="rounded-md border border-line bg-surface">
        <ul className="divide-y divide-line">
          {order.lines.map((line, i) => (
            <li key={i} className="flex justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="t-body font-semibold text-ink">
                  {line.quantity} × {line.itemName}
                </p>
                {line.selectedModifiers.length > 0 && (
                  <ul className="mt-0.5">
                    {line.selectedModifiers.map((m, j) => (
                      <li key={j} className="t-body-sm text-ink-muted">
                        {m.optionName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="t-body t-nums shrink-0 text-ink">
                {formatCents(line.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t border-line bg-paper-sunk px-4 py-3">
          <Row label="Subtotal" value={formatCents(order.subtotalCents)} />
          <Row label="Tax" value={formatCents(order.taxCents)} />
          {order.tipCents > 0 && <Row label="Tip" value={formatCents(order.tipCents)} />}
          <div className="flex items-baseline justify-between pt-1">
            <span className="t-display-sm text-ink">Total</span>
            <span className="t-display-sm t-nums text-ink">{formatCents(order.totalCents)}</span>
          </div>
        </div>
      </section>

      <p className="t-body-sm mt-6 text-center text-ink-muted">
        Show this page at pickup. Pickup only — no delivery.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="t-body text-ink-muted">{label}</span>
      <span className="t-body t-nums text-ink">{value}</span>
    </div>
  );
}
