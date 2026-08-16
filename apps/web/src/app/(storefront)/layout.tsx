// Storefront route-group layout — provides cart state to every page in this group.
import { CartProvider } from "@/lib/cart-context";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <CartProvider>{children}</CartProvider>;
}
