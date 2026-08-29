// SPRINT-17: storefront route-level skeletons (design.md §12).
//
// Home and menu are server components that await the menu and store-status fetches, so before
// this there was no loading state at all — the route simply did not render. These are consumed by
// Next `loading.tsx` files, which stream the skeleton immediately and swap in the page when the
// data lands.
//
// §16.7: a skeleton's dimensions must match the loaded content. Each block below mirrors the real
// component it stands in for — the header's 64/72 height and its sub-row, the hero's 4:3 panel,
// the category rail's 96px tiles, the item grid's breakpoints — so nothing shifts on arrival.
import { ItemCardSkeleton, Skeleton } from "@/components/ui/feedback";

/** The sticky header, at its real height. The wordmark is static so it renders for real. */
function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-sticky-header bg-surface">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:h-18">
        <span className="t-display-md shrink-0 text-brand">
          <span className="uppercase tracking-[-0.02em]">Harold&apos;s</span>
        </span>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <Skeleton className="h-11 w-64 rounded-pill" />
        </div>
        <Skeleton className="hidden h-11 w-28 rounded-pill md:block" />
        <Skeleton className="h-11 w-11 rounded-pill" />
      </div>
      <div className="flex items-center justify-center gap-2 px-4 pb-2 md:hidden">
        <Skeleton className="h-11 w-56 rounded-pill" />
        <Skeleton className="h-11 w-24 rounded-pill" />
      </div>
    </header>
  );
}

/** Matches StorefrontFooter's three-column grid. */
function FooterSkeleton() {
  return (
    <div className="mt-10 border-t border-line bg-paper-sunk md:mt-16">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 md:grid-cols-3 md:py-16">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-3 h-4 w-20" />
            <Skeleton className="mb-2 h-[22px] w-full" />
            <Skeleton className="h-[22px] w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** design.md §9.1 — hero, category rail, most-ordered. */
export function HomeSkeleton() {
  return (
    <div className="min-h-dvh pb-24 md:pb-0" role="status" aria-label="Loading the menu">
      <HeaderSkeleton />
      <main className="mx-auto max-w-[1200px] px-4">
        <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-10 md:py-16">
          <div className="order-2 md:order-1">
            <Skeleton className="h-[38px] w-4/5 md:h-[46px]" />
            <Skeleton className="mt-2 h-[38px] w-3/5 md:h-[46px]" />
            <Skeleton className="mt-3 h-[26px] w-1/2" />
            <Skeleton className="mt-6 h-13 w-40 rounded-pill" />
          </div>
          <div className="order-1 md:order-2">
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          </div>
        </section>

        <section className="py-10 md:py-16">
          <Skeleton className="mb-5 h-[30px] w-48 md:h-[36px]" />
          <div className="flex gap-3 overflow-hidden md:gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex w-24 shrink-0 flex-col items-center gap-2">
                <Skeleton className="h-24 w-24 rounded-pill" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </section>

        <section className="py-10 md:py-16">
          <Skeleton className="mb-5 h-[30px] w-56 md:h-[36px]" />
          <div className="grid gap-3 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <ItemCardSkeleton key={i} />
            ))}
          </div>
        </section>
      </main>
      <FooterSkeleton />
    </div>
  );
}

/** design.md §9.2 — sticky tabs then one section per category. */
export function MenuSkeleton() {
  return (
    <div className="min-h-dvh pb-24 md:pb-0" role="status" aria-label="Loading the menu">
      <HeaderSkeleton />
      <main className="mx-auto max-w-[1200px] px-4">
        <div className="-mx-4 border-b border-line px-4">
          <div className="flex h-12 items-center gap-6 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[22px] w-24 shrink-0" />
            ))}
          </div>
        </div>
        {Array.from({ length: 2 }).map((_, section) => (
          <section key={section} className="py-10 md:py-16">
            <Skeleton className="h-[30px] w-64 md:h-[36px]" />
            <Skeleton className="mt-1 h-[22px] w-80" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ItemCardSkeleton key={i} />
              ))}
            </div>
          </section>
        ))}
      </main>
      <FooterSkeleton />
    </div>
  );
}

/** design.md §9.3 — single column, max 560. */
export function CheckoutSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-[560px] px-4 pb-16" role="status" aria-label="Loading checkout">
      <div className="py-4">
        <Skeleton className="h-[22px] w-20" />
      </div>
      <Skeleton className="mb-6 h-[30px] w-48 md:h-[36px]" />
      <div className="mb-6 rounded-md border border-line bg-surface">
        <div className="space-y-3 px-4 py-3">
          <Skeleton className="h-[22px] w-3/4" />
          <Skeleton className="h-[22px] w-2/3" />
        </div>
        <div className="space-y-2 border-t border-line bg-paper-sunk px-4 py-3">
          <Skeleton className="h-[22px] w-full" />
          <Skeleton className="h-[22px] w-full" />
          <Skeleton className="h-[22px] w-full" />
        </div>
      </div>
      <Skeleton className="mb-2 h-4 w-24" />
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-20 rounded-pill" />
        ))}
      </div>
      <div className="mb-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-1 h-4 w-28" />
            <Skeleton className="h-11 w-full rounded-sm" />
          </div>
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-sm" />
      <Skeleton className="mt-6 h-13 w-full rounded-pill" />
    </div>
  );
}

/** design.md §9.4 — ticket chip, then the order. */
export function OrderSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-[560px] px-4 pb-16" role="status" aria-label="Loading your order">
      <div className="flex flex-col items-center gap-4 py-10">
        <Skeleton className="h-[46px] w-40 rounded-sm" />
        <Skeleton className="h-[30px] w-64 md:h-[36px]" />
        <Skeleton className="h-6 w-28 rounded-sm" />
        <Skeleton className="h-[26px] w-48" />
      </div>
      <Skeleton className="mb-6 h-24 w-full rounded-md" />
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}
