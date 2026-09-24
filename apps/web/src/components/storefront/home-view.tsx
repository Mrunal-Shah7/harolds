"use client";

// Design v1.1 — home. Band rhythm: paper hero, sunk category rail, paper most-ordered,
// roast call to action, roast footer. At least one roast band per page.
//
// The hero is three stacked poster lines with ONE brand-red accent line — red is spent once,
// in type, rather than on a component. No carousel: the reference site's rotating hero is
// backed by a promotions system that does not exist here, and a carousel of one slide — or of
// slides that lie — is worse than a headline.
import { useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { FullMenu, MenuItemSummary, StoreStatus } from "@harolds/types";
import { StorefrontHeader } from "@/components/storefront/header";
import { AnnouncementStrip } from "@/components/storefront/announcement-strip";
import { StorefrontFooter } from "@/components/storefront/footer";
import { CategoryRail } from "@/components/storefront/category-rail";
import { ItemCard, hasRequiredGroups } from "@/components/storefront/item-card";
import { ItemModal } from "@/components/storefront/item-modal";
import { CartSheet } from "@/components/storefront/cart-sheet";
import { CartBar } from "@/components/storefront/cart-bar";
import { CartAnnouncer } from "@/components/storefront/cart-announcer";
import { ErrorState } from "@/components/ui/feedback";
import { storeStatusLabel } from "@/components/storefront/store-status-pill";
import { useCart } from "@/lib/cart-context";
import { useHeaderHeight } from "@/components/storefront/use-header-height";

export function HomeView({
  menu,
  status,
  mostOrdered,
}: {
  menu: FullMenu | null;
  status: StoreStatus | null;
  mostOrdered: MenuItemSummary[];
}) {
  const { addLine } = useCart();
  const [selected, setSelected] = useState<MenuItemSummary | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  // Publishes --sf-header-h; nothing on this page pins to it, but the value is shared with the
  // menu page's tab bar and measuring it here keeps the two pages consistent.
  useHeaderHeight();

  // Error: what failed, in plain words, plus a retry that retries. No status codes.
  if (!menu || !status) {
    return (
      <div className="sf-page">
        <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} compactStatus />
        <main>
          <ErrorState
            message="We couldn't load the menu. Try again."
            onRetry={() => window.location.reload()}
          />
        </main>
      </div>
    );
  }

  const categories = menu.categories.filter((c) => c.items.length > 0);
  const itemCount = categories.reduce((n, c) => n + c.items.length, 0);
  const closed = !status.isOpen || !status.acceptingOrders;
  const { label: statusLabel } = storeStatusLabel(status);

  const quickAdd = (item: MenuItemSummary) => {
    addLine({
      item,
      quantity: 1,
      selectedOptionIds: [],
      optionLabels: [],
      customerNote: null,
    });
  };

  return (
    <div className="sf-page">
      <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} compactStatus />
      <AnnouncementStrip announcement={status.announcement} />

      <main>
        {/* The banner is optional. Without one this is the design's plain paper hero; with one
            the band gets a full-bleed background and a paper-tinted scrim (globals.css), because
            the poster headline is unreadable over an arbitrary photograph. */}
        <section
          className={`band b-paper textured hero${status.heroImageUrl ? " has-banner" : ""}`}
          style={
            status.heroImageUrl ? { backgroundImage: `url(${status.heroImageUrl})` } : undefined
          }
        >
          <div className="container">
            <p className="eyebrow hero-place">
              <MapPin className="hero-place-icon" aria-hidden="true" />
              <span>
                {status.city}, {status.state}
              </span>
            </p>
            <h1 style={{ marginTop: 12 }}>
              Fries under.
              <br />
              Sauce over.
              <br />
              <span className="accent">75 years loud.</span>
            </h1>
            <p className="eyebrow hero-lede">
              Fried to order, the way the South Side has eaten it.
            </p>
            <div className="hero-actions">
              <Link href="/menu" className="btn btn-primary btn-lg">
                Order pickup
              </Link>
              {/* Delivery is DoorDash's, not ours — it leaves the site, so it is the secondary
                  action and opens in a new tab. */}
              <a
                href="https://www.doordash.com/store/51035085?utm_source=mx_share&aw=ToYEXtfMfeYuP_Lz"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-lg"
              >
                Order delivery
              </a>
            </div>
            {/* Browsing stays available when closed; only checkout is blocked, and it is blocked
                at the point of blocking with an explanation. */}
            {closed ? (
              <p style={{ marginTop: 20, color: "var(--danger)" }}>{statusLabel}</p>
            ) : null}
          </div>
        </section>

        {categories.length > 0 ? (
          <section className="band b-sunk textured cat-jump">
            <div className="container">
              <p className="eyebrow cat-jump-kicker">
                Straight to a section
              </p>
              <CategoryRail
                categories={categories.map((c) => ({
                  id: c.id,
                  name: c.name,
                  imageUrl: c.imageUrl ?? null,
                }))}
              />
            </div>
          </section>
        ) : null}

        {/* Hidden ENTIRELY when the curated list is empty. */}
        {mostOrdered.length > 0 ? (
          <section className="band b-paper textured">
            <div className="container">
              <h2 className="poster">Most ordered</h2>
              <p style={{ color: "var(--ink-muted)", marginTop: 8 }}>
                What the neighborhood keeps coming back for.
              </p>
              <div className="item-rail" role="list" aria-label="Most ordered items">
                {mostOrdered.map((item, i) => (
                  <div key={item.id} role="listitem">
                    <ItemCard
                      item={item}
                      priority={i === 0}
                      onOpen={setSelected}
                      onQuickAdd={hasRequiredGroups(item) ? undefined : quickAdd}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="band b-roast">
          <div className="container" style={{ textAlign: "center" }}>
            <p className="eyebrow">
              {itemCount} items · priced off the board
            </p>
            <h2 className="poster" style={{ margin: "12px 0 32px" }}>
              The whole board is here
            </h2>
            <Link href="/menu" className="btn btn-poster">
              See the full menu
            </Link>
          </div>
        </section>
      </main>

      <StorefrontFooter status={status} />

      <ItemModal item={selected} onClose={() => setSelected(null)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
      <CartBar onOpen={() => setCartOpen(true)} />
      <CartAnnouncer />
    </div>
  );
}
