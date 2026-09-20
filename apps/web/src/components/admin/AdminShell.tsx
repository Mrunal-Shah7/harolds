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
import { SAVEBAR_HOST_ID } from "@/components/admin/SaveBar";

export type SessionUser = { id: string; email: string; displayName: string; role: string };

// Design v1.1 numbers the rail. The mockup draws four entries; this back office has eight, so
// the numbering simply continues — no new visual language, just more of the same rows.
const NAV = [
  { href: "/admin", label: "Dashboard", ownerOnly: false },
  { href: "/admin/orders", label: "Orders", ownerOnly: false },
  { href: "/admin/menu", label: "Menu", ownerOnly: false },
  { href: "/admin/categories", label: "Categories", ownerOnly: false },
  { href: "/admin/modifiers", label: "Modifiers", ownerOnly: false },
  { href: "/admin/store", label: "Store", ownerOnly: false },
  { href: "/admin/reports", label: "Reports", ownerOnly: false },
  { href: "/admin/jobs", label: "Jobs", ownerOnly: false },
  { href: "/admin/staff", label: "Staff", ownerOnly: true },
  // SPRINT-18: what search engines publish about the business — owner only.
  { href: "/admin/seo", label: "SEO", ownerOnly: true },
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
      <div className="adm-frame">
        <div className="adm-shell">
          <main className="adm-main" style={{ gridColumn: "1 / -1" }}>
            <div className="adm-error">{bootError}</div>
          </main>
        </div>
      </div>
    );
  }

  // §12: the shell renders its own skeleton rather than collapsing to a line of text, so the
  // layout the operator is about to use is already in place while the session resolves.
  if (!user) {
    return (
      <div className="adm-frame">
        <div className="adm-shell">
          <AdminNavSkeleton />
          <main className="adm-main">
            <AdminViewSkeleton />
          </main>
        </div>
      </div>
    );
  }

  return (
    <AdminSessionContext.Provider value={{ user, timezone }}>
      <div className="adm-frame">
        <div className="adm-shell">
          <aside className="adm-side">
            <div className="wordmark">
              Harold&apos;s<small>Back office</small>
            </div>
            <nav className="adm-nav" aria-label="Admin">
              {NAV.filter((n) => !n.ownerOnly || user.role === "OWNER").map((n, i) => {
                const active =
                  pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={active ? "active" : ""}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="ic">{String(i + 1).padStart(2, "0")}</span>
                    <span className="tx">{n.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="adm-nav-user">
              <strong>{user.displayName}</strong>
              {user.role.toLowerCase()}
              <div>
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={async () => {
                    await adminApi("/api/internal/admin/auth/signout", { method: "POST" });
                    router.replace("/admin/signin");
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </aside>

          {/* Only this swaps on navigation. The rail above is owned by the layout and never
              unmounts. */}
          <main className="adm-main">{children}</main>
        </div>
      </div>

      {/* One host for every floating save bar on the page, so a screen with several forms
          stacks them in a column instead of piling them at the same fixed offset. */}
      <div id={SAVEBAR_HOST_ID} className="adm-savebar" />
    </AdminSessionContext.Provider>
  );
}
