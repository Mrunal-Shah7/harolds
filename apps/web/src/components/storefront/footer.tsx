// SPRINT-14: the footer (design.md §9.1). Hours, address, phone. Nothing else.
// The address links to maps; the phone is a tel: link.
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

  return (
    <footer className="mt-10 border-t border-line bg-paper-sunk md:mt-16">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:grid-cols-3 md:py-16">
        <div>
          <h2 className="t-label mb-3 text-ink-muted">Hours</h2>
          <ul>
            {[...status.hours]
              .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
              .map((row) => (
                <li key={row.dayOfWeek} className="t-body flex justify-between gap-4 text-ink">
                  <span>{DAYS[row.dayOfWeek]}</span>
                  <span className="t-nums text-ink-muted">
                    {row.isClosed || !row.openTime || !row.closeTime
                      ? "Closed"
                      : `${row.openTime} – ${row.closeTime}`}
                  </span>
                </li>
              ))}
          </ul>
        </div>

        <div>
          <h2 className="t-label mb-3 text-ink-muted">Address</h2>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(`${status.storeName}, ${address}`)}`}
            target="_blank"
            rel="noreferrer"
            className="t-body text-ink underline underline-offset-4"
          >
            {address}
          </a>
          <p className="t-body-sm mt-2 text-ink-muted">Oak Lawn · Pickup only</p>
        </div>

        <div>
          <h2 className="t-label mb-3 text-ink-muted">Phone</h2>
          <a
            href={`tel:${status.contactPhone.replace(/[^\d+]/g, "")}`}
            className="t-body t-nums text-ink underline underline-offset-4"
          >
            {status.contactPhone}
          </a>
        </div>
      </div>
    </footer>
  );
}
