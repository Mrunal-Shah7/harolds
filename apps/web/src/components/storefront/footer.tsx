// Design v1.1 — the footer. A roast band carrying the wordmark, the store facts and the
// ordering links, over a roast-deep strip. Hours, address, phone. Nothing else.
// The address links to maps; the phone is a tel: link.
import Link from "next/link";
import type { StoreStatus } from "@harolds/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function StorefrontFooter({ status }: { status: StoreStatus }) {
  const address = [
    status.addressLine1,
    status.addressLine2,
    `${status.city}, ${status.state} ${status.postalCode}`,
  ]
    .filter(Boolean)
    .join(", ");

  const hours = [...status.hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  return (
    <footer className="sf-footer">
      <div className="band b-roast" style={{ paddingBottom: 48 }}>
        <div className="container cols">
          <div>
            <div className="wordmark" style={{ color: "var(--ink-on-roast)" }}>
              Harold&apos;s
              <small style={{ color: "var(--ink-on-roast-muted)" }}>Chicken · Burnham</small>
            </div>
            <p style={{ marginTop: 16, maxWidth: 320, color: "var(--ink-on-roast-muted)" }}>
              One location. One street.
            </p>
          </div>

          <div>
            <h4>Find us</h4>
            <ul>
              <li>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(`${status.storeName}, ${address}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {address}
                </a>
              </li>
              <li>
                <a href={`tel:${status.contactPhone.replace(/[^\d+]/g, "")}`}>
                  {status.contactPhone}
                </a>
              </li>
              {hours.map((row) => (
                <li key={row.dayOfWeek} className="t-nums">
                  {DAYS[row.dayOfWeek]}{" "}
                  {row.isClosed || !row.openTime || !row.closeTime
                    ? "Closed"
                    : `${row.openTime} – ${row.closeTime}`}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Ordering</h4>
            <ul>
              <li>
                <Link href="/menu">Menu</Link>
              </li>
              <li>
                <Link href="/checkout">Checkout</Link>
              </li>
              <li>Pickup only</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="footer-deep">
        <div className="container">
          <span>
            © {new Date().getFullYear()} {status.storeName}
          </span>
        </div>
      </div>
    </footer>
  );
}
