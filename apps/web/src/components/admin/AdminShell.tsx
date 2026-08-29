"use client";

// SPRINT-17: the admin shell, hoisted out of AdminApp into the route-group layout.
//
// THE BUG THIS FIXES. The session lived in `AdminApp`, the same component that rendered the
// sidebar, and while `user` was null that component returned a bare "Loading…" block with NO
// <nav> at all. Every sidebar click changes the `[[...slug]]` route segment, which remounts the
// page component, resets `user` to null, and takes the sidebar with it until the session refetch
// lands — so the nav visibly vanished and came back on every navigation.
//
// A Next route-group layout is NOT remounted when a route inside it changes. Holding the session
// and the sidebar here means only <main> swaps, which is what a sidebar is for.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { adminApi, AdminApiError } from "@/components/admin/admin-api";
import { AdminNavSkeleton, AdminViewSkeleton } from "@/components/admin/AdminSkeletons";

export type SessionUser = { id: string; email: string; displayName: string; role: string };

const NAV = [
  { href: "/admin", label: "Dashboard", ownerOnly: false },
  { href: "/admin/menu", label: "Menu", ownerOnly: false },
  { href: "/admin/modifiers", label: "Modifiers", ownerOnly: false },
  { href: "/admin/store", label: "Store", ownerOnly: false },
  { href: "/admin/orders", label: "Orders", ownerOnly: false },
  { href: "/admin/reports", label: "Reports", ownerOnly: false },
  { href: "/admin/jobs", label: "Jobs", ownerOnly: false },
  { href: "/admin/staff", label: "Staff", ownerOnly: true },
];

type AdminSession = { user: SessionUser; timezone: string };

const AdminSessionContext = createContext<AdminSession | null>(null);

/** Screens read the signed-in user and the store timezone from here rather than refetching. */
export function useAdminSession(): AdminSession {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession must be used within AdminShell");
  return ctx;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/Chicago");

  // The sign-in screen lives in this route group but has no shell.
  const isSignin = pathname === "/admin/signin";

  useEffect(() => {
    if (isSignin) return;
    let cancelled = false;
    adminApi<{ user: SessionUser; expiresAt: string }>("/api/internal/admin/auth/session")
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/admin/signin");
          return;
        }
        setBootError(err instanceof Error ? err.message : "Could not load session.");
      });
    return () => {
      cancelled = true;
    };
  }, [router, isSignin]);

  useEffect(() => {
    if (!user) return;
    adminApi<{ config: { timezone: string } }>("/api/internal/admin/store")
      .then((d) => setTimezone(d.config.timezone))
      .catch(() => undefined);
  }, [user]);

  if (isSignin) return <>{children}</>;

  if (bootError) {
    return (
      <div className="adm-main">
        <div className="adm-error">{bootError}</div>
      </div>
    );
  }

  // §12: the shell renders its own skeleton rather than collapsing to a line of text, so the
  // layout the operator is about to use is already in place while the session resolves.
  if (!user) {
    return (
      <div className="adm-app">
        <AdminNavSkeleton />
        <main className="adm-main">
          <AdminViewSkeleton />
        </main>
      </div>
    );
  }

  return (
    <AdminSessionContext.Provider value={{ user, timezone }}>
      <div className="adm-app">
        <nav className="adm-nav">
          <p className="adm-brand">Harold&apos;s</p>
          <p className="adm-brand-sub">Oak Lawn back office</p>
          {NAV.filter((n) => !n.ownerOnly || user.role === "OWNER").map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={
                pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href))
                  ? "is-active"
                  : ""
              }
            >
              {n.label}
            </Link>
          ))}
          <div className="adm-nav-user">
            <strong>{user.displayName}</strong>
            {user.role.toLowerCase()}
            <div>
              <button
                type="button"
                className="adm-btn adm-btn-ghost adm-btn-onDark"
                onClick={async () => {
                  await adminApi("/api/internal/admin/auth/signout", { method: "POST" });
                  router.replace("/admin/signin");
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </nav>

        {/* Only this swaps on navigation. The nav above is owned by the layout and never
            unmounts. */}
        <main className="adm-main">{children}</main>
      </div>
    </AdminSessionContext.Provider>
  );
}
