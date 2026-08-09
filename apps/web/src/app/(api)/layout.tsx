// SPRINT-1: API route-group layout.
// Sprint ownership: API route handlers begin in Sprint 2 (menu API + contract).
export default function ApiLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
