// Storefront route-group layout — provides cart state to every page in this group.
// `sf-root` scopes the storefront's own rules and its dark scheme (globals.css) so they cannot
// reach admin or the kitchen display through the shared root layout.
import Script from "next/script";
import { GOOGLE_TAG_ID, GOOGLE_TAG_JS_URL } from "@harolds/config";
import { CartProvider } from "@/lib/cart-context";

export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="sf-root">
      {/* Google Ads tag (gtag.js). Storefront only — admin and the kitchen display are not
          customer traffic. Its hosts are allowed in the CSP from the same config (google-tag.ts). */}
      <Script src={GOOGLE_TAG_JS_URL} strategy="afterInteractive" />
      <Script id="google-tag" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_TAG_ID}');`}
      </Script>
      <CartProvider>{children}</CartProvider>
    </div>
  );
}
