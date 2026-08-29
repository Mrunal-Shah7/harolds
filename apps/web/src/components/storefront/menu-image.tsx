// The one place a menu photograph is rendered.
//
// DERIVATIVE RECONCILIATION. The media pipeline (apps/web/src/lib/media/storage.ts) emits ONE
// width per derivative — thumb 128, modal 640, preview 320 — using `fit: "inside",
// withoutEnlargement: true`, which preserves the source aspect ratio and never centre-crops.
// There are no 2x emissions, so a 1x/2x `srcset` cannot be written against derivatives that do
// not exist.
//
// Consequences:
//   - The card image is full-width 4:3. `thumb` at 128 is far too small for it; `modal` (640)
//     is the only derivative large enough, so the card and the modal both use `modal`.
//   - `preview` (320) is for admin and the KDS. The storefront uses neither it nor `thumb`.
//   - The 4:3 is reserved by the `.img` frame in globals.css and filled with object-cover. The
//     pipeline does not produce 4:3 bytes and never did.
//
// Design v1.1: with no photograph the frame is a paper-sunk tile carrying the item's initial in
// the poster face — the placeholder standing in for photography that does not exist yet. This
// component renders the CONTENTS of the `.img` frame; the frame itself belongs to the card or
// the modal.
import type { MenuItemSummary } from "@harolds/types";

type ImageSource = MenuItemSummary["imageDerivatives"];

export function MenuImage({
  name,
  derivatives,
  imageUrl,
  priority = false,
}: {
  name: string;
  derivatives: ImageSource;
  imageUrl?: string | null;
  /** Hero and above-the-fold images only. Everything else lazy-loads. */
  priority?: boolean;
}) {
  const webp = derivatives?.modal.webp ?? null;
  const fallback = derivatives?.modal.fallback ?? imageUrl ?? null;

  if (!webp && !fallback) {
    return (
      <span className="init" aria-hidden="true">
        {name.trim().charAt(0)}
      </span>
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
      />
    </picture>
  );
}
