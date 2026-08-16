import type { StoreStatus } from "@harolds/types";

export function StoreStatusBanner({ status }: { status: StoreStatus }) {
  if (status.isOpen && status.acceptingOrders) {
    return (
      <div className="bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground">
        Open now &middot; Ready in about {status.prepMinutes} min &middot; Pickup only
      </div>
    );
  }

  if (!status.isOpen) {
    return (
      <div className="bg-destructive/10 px-4 py-2 text-center text-sm font-semibold text-destructive">
        We&apos;re closed right now. You can browse the menu, but ordering is unavailable.
      </div>
    );
  }

  return (
    <div className="bg-destructive/10 px-4 py-2 text-center text-sm font-semibold text-destructive">
      {status.notAcceptingMessage ?? "We're not accepting orders right now."}
    </div>
  );
}
