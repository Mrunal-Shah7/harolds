// Admin route-group layout.
// Design v1.1: all three surfaces share the same four self-hosted faces, loaded once on <html>
// by the root layout. The admin-only Google faces are gone — no external font origin is
// contacted and the CSP is untouched.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./admin.css";
// The shell (session + sidebar) lives in the LAYOUT so a route change inside the group never
// unmounts it. Only <main> swaps.
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Back office — Harold's Chicken Burnham",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f0e1",
  width: "device-width",
  initialScale: 1,
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="adm-root">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
