// Storefront route-group layout — provides cart state to every page in this group.
// SPRINT-14: `sf-root` scopes the design-system base rules (globals.css) to the storefront so
// they cannot reach admin or the kitchen display through the shared root layout.
import { CartProvider } from "@/lib/cart-context";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="sf-root min-h-dvh bg-paper text-ink">
      <CartProvider>{children}</CartProvider>
    </div>
  );
}
