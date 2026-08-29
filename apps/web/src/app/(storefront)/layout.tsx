// Storefront route-group layout — provides cart state to every page in this group.
// `sf-root` scopes the storefront's own rules and its dark scheme (globals.css) so they cannot
// reach admin or the kitchen display through the shared root layout.
import { CartProvider } from "@/lib/cart-context";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="sf-root">
      <CartProvider>{children}</CartProvider>
    </div>
  );
}
