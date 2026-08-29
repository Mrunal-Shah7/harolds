// SPRINT-14: the one place a menu photograph is rendered (design.md §8).
//
// DERIVATIVE RECONCILIATION (Phase 1.6 / design.md §17 item 3). The Sprint 12 pipeline
// (apps/web/src/lib/media/storage.ts) emits ONE width per derivative — thumb 128, modal 640,
// preview 320 — using `fit: "inside", withoutEnlargement: true`, which preserves the source
// aspect ratio and never centre-crops. There are no 2x emissions, so a 1x/2x `srcset` cannot be
// written against derivatives that do not exist.
//
// Consequences, all recorded in design.md §8.2:
//   - The card image is full-width 4:3 (~358 CSS px at a 390 viewport). `thumb` at 128 is a
//     leftover from the pre-Sprint-14 64x64 card and is far too small for it. `modal` (640) is
//     the only derivative large enough, so the card and the modal both use `modal`.
//   - `preview` (320) is for admin and the KDS. The storefront uses neither it nor `thumb`.
//   - The 4:3 is reserved by the LAYOUT and filled with object-cover. The pipeline does not
//     produce 4:3 bytes and never did.
import type { MenuItemSummary } from "@harolds/types";

type ImageSource = MenuItemSummary["imageDerivatives"];

export function MenuImage({
  name,
  derivatives,
  imageUrl,
  priority = false,
  className,
}: {
  name: string;
  derivatives: ImageSource;
  imageUrl?: string | null;
  /** Hero and above-the-fold images only. Everything else lazy-loads. */
  priority?: boolean;
  className?: string;
}) {
  const webp = derivatives?.modal.webp ?? null;
  const fallback = derivatives?.modal.fallback ?? imageUrl ?? null;

  // §8.4: no photograph renders a paper-sunk tile at the correct ratio with the item's initial.
  // Not a camera icon, not a stock photo, not a broken frame.
  if (!webp && !fallback) {
    return (
      <div
        className={`flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-paper-sunk ${className ?? ""}`}
        aria-hidden="true"
      >
        <span className="t-display-xl text-ink-faint opacity-40">{name.trim().charAt(0)}</span>
      </div>
    );
  }

  return (
    <picture>
      {webp ? <source srcSet={webp} type="image/webp" /> : null}
      <img
        src={fallback ?? webp ?? ""}
        alt={name}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding={priority ? "sync" : "async"}
        className={`aspect-[4/3] w-full rounded-md object-cover ${className ?? ""}`}
      />
    </picture>
  );
}
