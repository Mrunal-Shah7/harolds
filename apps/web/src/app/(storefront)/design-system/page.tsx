"use client";

// SPRINT-14: the primitive showcase (Phase 3.3). Every primitive, every variant, every state,
// in both the light scope and the `.kds` dark scope, on one page.
//
// NOT LINKED FROM ANYWHERE and NOT REACHABLE IN PRODUCTION — the export below returns a 404 in
// production builds. It exists so that contrast, focus, loading and reduced-motion behaviour are
// verified once here rather than hunted across screens, and so Sprint 15 has something concrete
// to build the admin and KDS redesigns against.
import { notFound } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Label, Textarea } from "@/components/ui/field";
import {
  Alert,
  EmptyState,
  ErrorState,
  ItemCardSkeleton,
  OfflineBar,
  Separator,
  Skeleton,
  StaleNotice,
} from "@/components/ui/feedback";
import { Dialog } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { TicketChip } from "@/components/storefront/ticket-chip";

const TYPE_SCALE = [
  "t-display-xl",
  "t-display-lg",
  "t-display-md",
  "t-display-sm",
  "t-body-lg",
  "t-body",
  "t-body-sm",
  "t-label",
  "t-mono-lg",
  "t-mono",
];

const COLOUR_TOKENS = [
  "paper",
  "paper-sunk",
  "surface",
  "ink",
  "ink-muted",
  "ink-faint",
  "line",
  "line-strong",
  "brand",
  "brand-hover",
  "brand-tint",
  "gold",
  "open",
  "warn",
  "danger",
  "focus",
];

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Showcase />;
}

function Showcase() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto max-w-[1200px] space-y-16 px-4 py-10">
        <header>
          <h1 className="t-display-xl">Design system</h1>
          <p className="t-body-lg mt-2 text-ink-muted">
            Sprint 14 primitives. Not linked, not reachable in production.
          </p>
        </header>

        <Section title="Colour tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOUR_TOKENS.map((token) => (
              <div key={token} className="rounded-md border border-line bg-surface p-3">
                <div
                  className="h-12 w-full rounded-sm border border-line"
                  style={{ background: `var(--color-${token})` }}
                />
                <p className="t-body-sm mt-2 text-ink-muted">--color-{token}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div className="space-y-3">
            {TYPE_SCALE.map((cls) => (
              <div key={cls} className="flex flex-wrap items-baseline gap-4">
                <span className="t-body-sm w-32 shrink-0 text-ink-muted">{cls}</span>
                <span className={cls}>Half dark with mild sauce</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons — variants, sizes, states">
          <ButtonMatrix />
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge variant="soldOut">Sold out</Badge>
            <Badge variant="paid">Paid</Badge>
            <Badge variant="refunded">Refunded</Badge>
            <Badge variant="failed">Failed</Badge>
            <Badge variant="neu">New</Badge>
            <Badge variant="warn">Unverified price</Badge>
          </div>
        </Section>

        <Section title="Ticket chip — one component, two sizes">
          <div className="flex flex-wrap items-center gap-6">
            <TicketChip orderNumber="HC-042" size="lg" />
            <TicketChip orderNumber="HC-042" size="sm" />
          </div>
        </Section>

        <Section title="Forms">
          <div className="max-w-[560px] space-y-4">
            <Field label="Mobile number" htmlFor="ds-phone" hint="We text you when it's ready.">
              <Input id="ds-phone" placeholder="(708) 555-1234" />
            </Field>
            <Field label="Mobile number" htmlFor="ds-phone-err" error="Enter a 10-digit mobile number">
              <Input id="ds-phone-err" defaultValue="708" />
            </Field>
            <div>
              <Label htmlFor="ds-note" className="mb-1">
                Special instructions
              </Label>
              <Textarea id="ds-note" rows={2} placeholder="Optional, for example extra crispy" />
            </div>
            <div>
              <Label htmlFor="ds-disabled" className="mb-1">
                Disabled
              </Label>
              <Input id="ds-disabled" disabled placeholder="Disabled" />
            </div>
          </div>
        </Section>

        <Section title="States — §12">
          <div className="space-y-6">
            <OfflineBar />
            <StaleNotice ageLabel="4 minutes" />
            <Alert tone="danger" title="Payment not confirmed">
              We couldn&apos;t confirm that payment. Don&apos;t try again just yet — check your
              texts in a minute, or call the store.
            </Alert>
            <Alert tone="warn" title="Printer offline">
              Tickets are queued and will print when the printer reconnects.
            </Alert>
            <Alert tone="info">The store closes at 9:00 PM today.</Alert>
            <div className="rounded-md border border-line bg-surface">
              <EmptyState message="No items in this category yet." actionLabel="Browse the menu" onAction={() => undefined} />
            </div>
            <div className="rounded-md border border-line bg-surface">
              <ErrorState message="We couldn't load the menu. Try again." onRetry={() => undefined} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ItemCardSkeleton />
              <ItemCardSkeleton />
              <ItemCardSkeleton />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-[22px] w-full" />
              <Skeleton className="h-[22px] w-2/3" />
            </div>
            <Separator />
          </div>
        </Section>

        <Section title="Overlays">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
          </div>
          <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} labelledBy="ds-dialog-title">
            <div className="p-5">
              <h2 id="ds-dialog-title" className="t-display-md">
                Dialog
              </h2>
              <p className="t-body mt-2 text-ink-muted">
                Focus is trapped here and returns to the trigger on close.
              </p>
              <div className="mt-4 flex gap-3">
                <Button onClick={() => setDialogOpen(false)}>Add to cart · $14.99</Button>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Dialog>
          <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Your order">
            <div className="p-4">
              <p className="t-body text-ink-muted">Sheet body.</p>
            </div>
          </Sheet>
        </Section>

        {/* The same primitives under the .kds dark scope. Nothing consumes this scope on the
            live board yet — Sprint 15 does — but the tokens and the type step-up are proven
            here so the kitchen never sees light text on a light surface. */}
        <Section title="KDS dark scope">
          <div className="kds rounded-md bg-background p-6 text-foreground">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <TicketChip orderNumber="HC-042" size="lg" />
                <span className="t-mono text-foreground">12 min</span>
              </div>
              <div className="rounded-md border p-4" style={{ borderColor: "var(--color-kds-line-strong)", background: "var(--color-kds-card)" }}>
                <p className="t-display-md text-foreground">Half dark</p>
                <p className="t-body text-foreground">Mild sauce, extra bread</p>
                <p className="t-body-sm" style={{ color: "var(--color-kds-ink-muted)" }}>
                  Secondary card text
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <AgeBar token="--color-open-on-dark" label="0–5 min · fresh" />
                <AgeBar token="--color-gold" label="5–12 min · working" />
                <AgeBar token="--color-danger-on-dark" label="12+ min · late" />
              </div>
              <Button size="kds" className="w-full">
                Mark ready
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function ButtonMatrix() {
  const variants = ["primary", "secondary", "ghost", "danger"] as const;
  const sizes = ["sm", "base", "lg", "kds"] as const;
  return (
    <div className="space-y-8">
      {variants.map((variant) => (
        <div key={variant} className="space-y-3">
          <p className="t-label text-ink-muted">{variant}</p>
          <div className="flex flex-wrap items-center gap-3">
            {sizes.map((size) => (
              <Button key={size} variant={variant} size={size}>
                Pay $18.40
              </Button>
            ))}
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading loadingLabel="Paying…">
              Pay $18.40
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgeBar({ token, label }: { token: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-8 w-1.5 rounded-sm" style={{ background: `var(${token})` }} />
      <span className="t-body-sm text-foreground">{label}</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="t-display-lg mb-5">{title}</h2>
      {children}
    </section>
  );
}
