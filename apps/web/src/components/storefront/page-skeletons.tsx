// Storefront route-level skeletons.
//
// Home and menu are server components that await the menu and store-status fetches, so without
// these there is no loading state at all — the route simply does not render. They are consumed by
// Next `loading.tsx` files, which stream the skeleton immediately and swap in the page when the
// data lands.
//
// A skeleton's dimensions must match the loaded content. Each block below mirrors the design v1.1
// component it stands in for — the header's 64px row, the hero's poster
// lines, the category rail's 88px circles, the product grid's breakpoints — so nothing shifts on
// arrival. Every block is a `.skel` on sunk paper; no new shapes are introduced here.
import { ItemCardSkeleton } from "@/components/ui/feedback";

function Bar({ style }: { style?: React.CSSProperties }) {
  return <div className="skel" style={style} aria-hidden="true" />;
}

/** The sticky header, at its real height. The wordmark is static so it renders for real. */
function HeaderSkeleton() {
  return (
    <header className="sf-header">
      <div className="container">
        <div className="wordmark">
          <img src="/logo.png" alt="" width={1314} height={580} />
        </div>
        <Bar style={{ height: 32, width: 72, borderRadius: 999 }} />
        <Bar style={{ height: 44, width: 110, borderRadius: 999, marginLeft: "auto" }} />
      </div>
    </header>
  );
}

/** Matches StorefrontFooter's roast band and its three columns. */
function FooterSkeleton() {
  return (
    <footer className="sf-footer">
      <div className="band b-roast" style={{ paddingBottom: 48 }}>
        <div className="container cols">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Bar style={{ height: 16, width: 96, marginBottom: 12, opacity: 0.25 }} />
              <Bar style={{ height: 22, marginBottom: 8, opacity: 0.25 }} />
              <Bar style={{ height: 22, width: "66%", opacity: 0.25 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="footer-deep">
        <div className="container">
          <span>Loading…</span>
        </div>
      </div>
    </footer>
  );
}

/** Home — hero, category rail, most-ordered, roast call to action. */
export function HomeSkeleton() {
  return (
    <div className="sf-page" role="status" aria-label="Loading the menu">
      <HeaderSkeleton />
      <main>
        <section className="band b-paper textured hero">
          <div className="container">
            <Bar style={{ height: 16, width: 200, marginBottom: 20 }} />
            <Bar style={{ height: 56, width: "70%", marginBottom: 10 }} />
            <Bar style={{ height: 56, width: "55%", marginBottom: 10 }} />
            <Bar style={{ height: 56, width: "62%" }} />
            <Bar style={{ height: 26, width: "45%", margin: "24px 0 32px" }} />
            <div className="hero-actions">
              <Bar style={{ height: 52, borderRadius: 999 }} />
              <Bar style={{ height: 52, borderRadius: 999 }} />
            </div>
          </div>
        </section>

        <section className="band b-sunk textured" style={{ paddingTop: 40, paddingBottom: 40 }}>
          <div className="container">
            <Bar style={{ height: 16, width: 180, marginBottom: 16 }} />
            <div className="cat-rail">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="cat-tile">
                  <Bar style={{ height: 88, width: 88, borderRadius: "50%", margin: "0 auto 10px" }} />
                  <Bar style={{ height: 14, width: 64, margin: "0 auto" }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band b-paper textured">
          <div className="container">
            <Bar style={{ height: 36, width: 280 }} />
            <div className="item-rail">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} role="listitem">
                  <ItemCardSkeleton />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <FooterSkeleton />
    </div>
  );
}

/** Menu — sticky tabs then one section per category. */
export function MenuSkeleton() {
  return (
    <div className="sf-page" role="status" aria-label="Loading the menu">
      <HeaderSkeleton />
      <main>
        <div className="sticky-tabs">
          <div className="row">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: "14px 16px" }}>
                <Bar style={{ height: 22, width: 88 }} />
              </div>
            ))}
          </div>
        </div>

        <div className="band b-paper textured" style={{ paddingTop: 32, paddingBottom: 24 }}>
          <div className="container">
            <Bar style={{ height: 40, width: 260, marginBottom: 12 }} />
            <Bar style={{ height: 22, width: "60%" }} />
          </div>
        </div>

        {Array.from({ length: 2 }).map((_, section) => (
          <section key={section} className="menu-section">
            <div className="container">
              <Bar style={{ height: 30, width: 200, marginBottom: 8 }} />
              <Bar style={{ height: 22, width: 320 }} />
              <div className="grid-products">
                {Array.from({ length: 6 }).map((_, i) => (
                  <ItemCardSkeleton key={i} />
                ))}
              </div>
            </div>
          </section>
        ))}
      </main>
      <FooterSkeleton />
    </div>
  );
}

/** Checkout — the two-column grid, at its real shape. */
export function CheckoutSkeleton() {
  return (
    <div className="sf-page" role="status" aria-label="Loading checkout">
      <HeaderSkeleton />
      <main>
        <div className="band b-paper textured" style={{ paddingTop: 40 }}>
          <div className="container">
            <Bar style={{ height: 40, width: 240, marginBottom: 32 }} />
            <div className="co-grid">
              <div>
                <div className="co-card card" style={{ marginBottom: 24 }}>
                  <Bar style={{ height: 26, width: 200, marginBottom: 20 }} />
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ marginBottom: 16 }}>
                      <Bar style={{ height: 14, width: 110, marginBottom: 6 }} />
                      <Bar style={{ height: 44 }} />
                    </div>
                  ))}
                </div>
                <div className="co-card card">
                  <Bar style={{ height: 26, width: 180, marginBottom: 16 }} />
                  <div className="tips">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Bar key={i} style={{ height: 44, width: 84, borderRadius: 999 }} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="co-card card">
                <Bar style={{ height: 26, width: 160, marginBottom: 16 }} />
                <Bar style={{ height: 22, marginBottom: 8 }} />
                <Bar style={{ height: 22, width: "70%", marginBottom: 16 }} />
                <div className="totals">
                  <Bar style={{ height: 22, marginBottom: 10 }} />
                  <Bar style={{ height: 22, marginBottom: 10 }} />
                  <Bar style={{ height: 30 }} />
                </div>
                <Bar style={{ height: 52, borderRadius: 999, marginTop: 24 }} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Confirmation — the chip, the timeline, then the order. */
export function OrderSkeleton() {
  return (
    <div className="sf-page" role="status" aria-label="Loading your order">
      <HeaderSkeleton />
      <main>
        <div className="band b-paper textured">
          <div className="container confirm-wrap">
            <Bar style={{ height: 16, width: 160, margin: "0 auto 16px" }} />
            <Bar style={{ height: 44, width: 280, margin: "0 auto 32px" }} />
            <Bar style={{ height: 60, width: 200, margin: "0 auto" }} />
            <Bar style={{ height: 40, margin: "40px 0 8px" }} />
            <Bar style={{ height: 26, width: "70%", margin: "24px auto 0" }} />
          </div>
        </div>
        <div className="band b-paper" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 640 }}>
            <Bar style={{ height: 240, borderRadius: "var(--r-md)" }} />
          </div>
        </div>
      </main>
    </div>
  );
}
