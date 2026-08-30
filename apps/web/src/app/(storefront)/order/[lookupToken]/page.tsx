"use client";

// Design v1.1 — confirmation. Paper band: eyebrow, poster headline, the ticket chip at mono-lg,
// the three-step timeline, then the ready estimate. Below it the order itself with board leaders
// in the totals, and a roast band carrying the pickup address.
// No account prompt, no upsell, no "rate your experience".
//
// Public order status — looked up by unguessable lookupToken only, never order number. Every
// figure here comes from the server response.
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PublicOrderStatusResponse, StoreStatus } from "@harolds/types";
import { getOrderStatus, getStoreStatus, StorefrontApiError } from "@/lib/storefront-api";
import { formatCents } from "@/lib/money";
import { StorefrontHeader } from "@/components/storefront/header";
import { ErrorState } from "@/components/ui/feedback";
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

/** The three points of the timeline, and which one each order status sits on. */
const STEPS = ["Received", "Preparing", "Ready"] as const;

function stepIndex(status: string): number {
  switch (status) {
    case "AWAITING_PAYMENT":
      return -1;
    case "PAID":
    case "PRINTED":
      return 0;
    case "IN_PROGRESS":
      return 1;
    case "READY":
    case "COMPLETED":
      return 2;
    default:
      return -1;
  }
}

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
    // The confirmation needs the store address and its maps link; the order payload does not
    // carry one and the contract is frozen, so the address comes from the existing public
    // store-status endpoint. Fetched once, not on the polling interval.
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
      <div className="sf-page">
        <StorefrontHeader status={store} />
        <main>
          <div className="band b-paper textured">
            <div className="container confirm-wrap">
              <ErrorState message={error} />
              <Link href="/menu" className="btn btn-secondary">
                Back to the menu
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!order) {
    // The skeleton occupies the same box the loaded confirmation will.
    return (
      <div className="sf-page">
        <StorefrontHeader status={store} />
        <main>
          <div className="band b-paper textured">
            <div className="container confirm-wrap">
              <div className="skel" style={{ height: 20, width: 160, margin: "0 auto 16px" }} />
              <div className="skel" style={{ height: 48, width: 280, margin: "0 auto 32px" }} />
              <div className="skel" style={{ height: 60, width: 200, margin: "0 auto" }} />
              <div className="skel" style={{ height: 80, marginTop: 40 }} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  const address = store
    ? [store.addressLine1, store.addressLine2, `${store.city}, ${store.state} ${store.postalCode}`]
        .filter(Boolean)
        .join(", ")
    : null;

  const active = stepIndex(order.status);
  const cancelled = order.status === "CANCELLED";

  return (
    <div className="sf-page">
      <StorefrontHeader status={store} />

      <main>
        <div className="band b-paper textured">
          <div className="container confirm-wrap">
            <p className="eyebrow">
              {cancelled ? "Order cancelled" : "Order placed · paid"}
            </p>
            <h2 className="poster" style={{ margin: "12px 0 32px" }}>
              {cancelled ? "This order was cancelled" : "We're on it"}
            </h2>

            {order.orderNumber ? (
              <TicketChip orderNumber={order.orderNumber} size="lg" />
            ) : null}

            {cancelled ? (
              <p style={{ marginTop: 32, color: "var(--danger)" }}>
                {STATUS_LABELS[order.status] ?? order.status}
              </p>
            ) : (
              <div className="timeline">
                {STEPS.map((label, i) => (
                  <div
                    key={label}
                    className={i < active ? "tstep done" : i === active ? "tstep now" : "tstep"}
                  >
                    <span className="pt" aria-hidden="true" />
                    <span className="lb">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {order.estimatedReadyAt && !cancelled ? (
              <p style={{ fontSize: "var(--body-lg)", marginTop: 24 }}>
                Ready around{" "}
                <strong className="t-nums" style={{ fontFamily: "var(--font-display)" }}>
                  {new Date(order.estimatedReadyAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </strong>
                .
              </p>
            ) : null}

            <p style={{ color: "var(--ink-muted)", marginTop: 8 }}>
              Give your order number at the counter. Receipt sent by email.
            </p>
          </div>
        </div>

        <div className="band b-paper" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 640 }}>
            <div className="co-card card">
              <h3>Your order</h3>

              {order.lines.map((line, i) => (
                <div key={i} style={{ padding: "6px 0" }}>
                  <div className="leader">
                    <span>
                      {line.quantity} × {line.itemName}
                    </span>
                    <span className="dots" />
                    <span className="amt">{formatCents(line.lineTotalCents)}</span>
                  </div>
                  {line.selectedModifiers.length > 0 ? (
                    <p style={{ fontSize: "var(--body-sm)", color: "var(--ink-muted)" }}>
                      {line.selectedModifiers.map((m) => m.optionName).join(" · ")}
                    </p>
                  ) : null}
                </div>
              ))}

              <div className="totals">
                <div className="leader">
                  <span>Subtotal</span>
                  <span className="dots" />
                  <span className="amt">{formatCents(order.subtotalCents)}</span>
                </div>
                <div className="leader">
                  <span>Tax</span>
                  <span className="dots" />
                  <span className="amt">{formatCents(order.taxCents)}</span>
                </div>
                {order.tipCents > 0 ? (
                  <div className="leader">
                    <span>Tip</span>
                    <span className="dots" />
                    <span className="amt">{formatCents(order.tipCents)}</span>
                  </div>
                ) : null}
                <div className="leader grand">
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>
                    Charged
                  </span>
                  <span className="dots" />
                  <span className="amt">{formatCents(order.totalCents)}</span>
                </div>
              </div>

              <p className="quote-note">
                Show this page at pickup. Pickup only — no delivery.
              </p>
            </div>
          </div>
        </div>

        <div className="band b-roast" style={{ padding: "48px 0" }}>
          <div className="container" style={{ textAlign: "center" }}>
            <p className="eyebrow" style={{ marginBottom: 16 }}>
              Pick up at
            </p>
            {address && store ? (
              <>
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 800,
                    fontSize: "var(--display-lg)",
                  }}
                >
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(`${store.storeName}, ${address}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit" }}
                  >
                    {address}
                  </a>
                </p>
                <p style={{ color: "var(--ink-on-roast-muted)", marginTop: 8 }}>
                  Come straight to the counter.
                </p>
              </>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "var(--display-lg)",
                }}
              >
                Come straight to the counter.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
