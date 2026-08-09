// SPRINT-1: storefront route-group layout.
// Sprint ownership: storefront UI is owned by the other developer; API contract arrives in Sprint 2.
export default function StorefrontLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
