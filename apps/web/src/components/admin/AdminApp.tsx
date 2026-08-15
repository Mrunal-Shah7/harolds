"use client";

// SPRINT-8: admin application shell and screens — role nav, dense tables, confirmation.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@harolds/pricing";
import { adminApi, AdminApiError } from "@/components/admin/admin-api";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { formatStoreDateTime } from "@/lib/admin-format";

type SessionUser = { id: string; email: string; displayName: string; role: string };

type Flash = { kind: "ok" | "err"; text: string } | null;

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

function money(cents: number): string {
  return formatCents(Math.max(0, cents));
}

export function AdminApp() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/Chicago");

  useEffect(() => {
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
  }, [router]);

  useEffect(() => {
    adminApi<{ config: { timezone: string } }>("/api/internal/admin/store")
      .then((d) => setTimezone(d.config.timezone))
      .catch(() => undefined);
  }, [user]);

  if (bootError) {
    return <div className="adm-main"><div className="adm-error">{bootError}</div></div>;
  }
  if (!user) {
    return <div className="adm-main"><p className="adm-muted">Loading…</p></div>;
  }

  const parts = pathname.split("/").filter(Boolean);
  const section = parts[1] ?? "";
  const id = parts[2];

  return (
    <div className="adm-app">
      <nav className="adm-nav">
        <p className="adm-brand">Harold&apos;s</p>
        <p className="adm-brand-sub">Oak Lawn back office</p>
        {NAV.filter((n) => !n.ownerOnly || user.role === "OWNER").map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href)) ? "is-active" : ""}
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
              className="adm-btn adm-btn-ghost"
              style={{ marginTop: "0.6rem", color: "#f3ead8", borderColor: "#f3ead8" }}
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
      <main className="adm-main">
        {section === "" && <DashboardView timezone={timezone} />}
        {section === "menu" && !id && <MenuView />}
        {section === "menu" && id === "curation" && <CurationView />}
        {section === "menu" && id && id !== "curation" && <ItemView id={id} />}
        {section === "modifiers" && !id && <ModifiersView />}
        {section === "modifiers" && id && <GroupView id={id} />}
        {section === "store" && <StoreView role={user.role} />}
        {section === "orders" && !id && <OrdersView timezone={timezone} />}
        {section === "orders" && id && <OrderDetailView id={id} timezone={timezone} />}
        {section === "reports" && <ReportsView />}
        {section === "jobs" && <JobsView />}
        {section === "staff" && user.role === "OWNER" && <StaffView />}
      </main>
    </div>
  );
}

function useFlash(): [Flash, (f: Flash) => void] {
  const [flash, setFlash] = useState<Flash>(null);
  return [flash, setFlash];
}

function FlashBar({ flash }: { flash: Flash }) {
  if (!flash) return null;
  return <div className={flash.kind === "ok" ? "adm-ok" : "adm-error"}>{flash.text}</div>;
}

function DashboardView({ timezone }: { timezone: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    adminApi<Record<string, unknown>>("/api/internal/admin/dashboard")
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);
  if (err) return <div className="adm-error">{err}</div>;
  if (!data) return <p className="adm-muted">Loading dashboard…</p>;
  const jobs = data.jobs as { deadCount: number; counts: Record<string, number>; oldestPendingAgeMs: number | null };
  const print = data.print as {
    counts: Record<string, number>;
    oldestQueuedAgeMs: number | null;
    printers: Array<{ serial: string; lastPolledAt: string | null; stale: boolean; ageMs: number | null }>;
  };
  const today = data.today as { countsByStatus: Record<string, number>; unacknowledgedPastThreshold: number; liveQueueCount: number };
  const store = data.store as { isOpen: boolean; acceptingOrders: boolean; prepMinutes: number; isBusy: boolean };
  const reconciliation = (data.reconciliation ?? {
    lastRunAt: null,
    lastFindingCount: null,
    overdue: true,
  }) as {
    lastRunAt: string | null;
    lastBusinessDate: string | null;
    lastFindingCount: number | null;
    overdue: boolean;
  };
  return (
    <>
      <h1 className="adm-h1">Operations</h1>
      <p className="adm-lead">Printer, jobs, today&apos;s orders, store state. Times in {timezone}.</p>
      <div className="adm-cards">
        <div className={jobs.deadCount > 0 ? "adm-card adm-dead" : "adm-card"}>
          <h2>Dead jobs</h2>
          <div className="adm-stat">{jobs.deadCount}</div>
          <p className="adm-muted">{jobs.deadCount > 0 ? "A customer or manager was not told. Open Jobs." : "None."}</p>
        </div>
        <div className="adm-card">
          <h2>Store</h2>
          <p>{store.isOpen ? "Open" : "Closed"} · {store.acceptingOrders ? "Accepting orders" : "Not accepting"}</p>
          <p>Prep {store.prepMinutes} min {store.isBusy ? "(busy)" : ""}</p>
        </div>
        <div className="adm-card">
          <h2>Live kitchen queue</h2>
          <div className="adm-stat">{today.liveQueueCount}</div>
          <p>Unacked past threshold: {today.unacknowledgedPastThreshold}</p>
        </div>
        <div className="adm-card">
          <h2>Print jobs</h2>
          <p>Queued {print.counts.QUEUED ?? 0} · Failed {print.counts.FAILED ?? 0}</p>
          <p>Oldest queued: {print.oldestQueuedAgeMs == null ? "—" : `${Math.round(print.oldestQueuedAgeMs / 1000)}s`}</p>
        </div>
        <div className={reconciliation.overdue || (reconciliation.lastFindingCount ?? 0) > 0 ? "adm-card adm-dead" : "adm-card"}>
          <h2>Reconciliation</h2>
          <p>
            {reconciliation.lastRunAt
              ? `Last run ${formatStoreDateTime(reconciliation.lastRunAt, timezone)} · ${reconciliation.lastFindingCount ?? 0} finding(s)`
              : "Has not run yet."}
          </p>
          <p className="adm-muted">
            {reconciliation.overdue
              ? "No pass in more than 26 hours — that is a problem."
              : reconciliation.lastFindingCount
                ? "A discrepancy is recorded. Open Jobs if an alert was raised."
                : "A run that finds nothing is information."}
          </p>
        </div>
      </div>
      <div className="adm-card" style={{ marginBottom: "0.75rem" }}>
        <h2>Printers</h2>
        {print.printers.map((p) => (
          <p key={p.serial}>
            <span className={p.stale ? "adm-badge adm-badge-hot" : "adm-badge adm-badge-ok"}>{p.stale ? "stale" : "polling"}</span>{" "}
            {p.serial} · last poll {p.lastPolledAt ? formatStoreDateTime(p.lastPolledAt, timezone) : "never"}
          </p>
        ))}
      </div>
      <div className="adm-card">
        <h2>Today by status</h2>
        <p>{Object.entries(today.countsByStatus).filter(([, n]) => n > 0).map(([s, n]) => `${s} ${n}`).join(" · ") || "No orders yet today."}</p>
      </div>
    </>
  );
}

function MenuView() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [filters, setFilters] = useState({ categoryId: "", isSoldOut: "", isUnverifiedPrice: "", q: "" });
  const [flash, setFlash] = useFlash();
  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (filters.categoryId) q.set("categoryId", filters.categoryId);
    if (filters.isSoldOut) q.set("isSoldOut", filters.isSoldOut);
    if (filters.isUnverifiedPrice) q.set("isUnverifiedPrice", filters.isUnverifiedPrice);
    if (filters.q) q.set("q", filters.q);
    adminApi<Array<Record<string, unknown>>>(`/api/internal/admin/menu/items?${q}`)
      .then(setItems)
      .catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  }, [filters, setFlash]);
  useEffect(() => {
    adminApi<Array<{ id: string; name: string; slug: string }>>("/api/internal/admin/menu/categories").then(setCategories).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <h1 className="adm-h1">Menu</h1>
      <p className="adm-lead">Sold-out is one tap. Price edits use dollars and store cents.</p>
      <FlashBar flash={flash} />
      <details>
        <summary>Categories</summary>
        <form
          className="adm-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              await adminApi("/api/internal/admin/menu/categories", {
                method: "POST",
                body: JSON.stringify({ name: form.get("name"), slug: form.get("slug") || undefined }),
              });
              setFlash({ kind: "ok", text: "Category created." });
              e.currentTarget.reset();
            } catch (err) {
              setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
            }
          }}
        >
          <label className="adm-field">Name<input name="name" required /></label>
          <label className="adm-field">Slug (optional)<input name="slug" /></label>
          <div className="adm-form-wide"><button className="adm-btn" type="submit">Create category</button></div>
        </form>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Name</th><th>Slug</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.slug}</td>
                  <td>
                    <button
                      type="button"
                      className="adm-btn adm-btn-ghost"
                      onClick={async () => {
                        try {
                          await adminApi(`/api/internal/admin/menu/categories/${c.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ isActive: false, confirmDeactivate: true }),
                          });
                          setFlash({ kind: "ok", text: "Category deactivated. Active items in it are hidden from the storefront." });
                        } catch (err) {
                          setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
                        }
                      }}
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="adm-toolbar">
        <label className="adm-field">
          Category
          <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          Sold out
          <select value={filters.isSoldOut} onChange={(e) => setFilters({ ...filters, isSoldOut: e.target.value })}>
            <option value="">All</option>
            <option value="true">Sold out</option>
            <option value="false">Available</option>
          </select>
        </label>
        <label className="adm-field">
          Price flag
          <select value={filters.isUnverifiedPrice} onChange={(e) => setFilters({ ...filters, isUnverifiedPrice: e.target.value })}>
            <option value="">All</option>
            <option value="true">Unverified</option>
          </select>
        </label>
        <label className="adm-field">
          Search
          <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </label>
        <button type="button" className="adm-btn adm-btn-ghost" onClick={load}>Refresh</button>
        <button
          type="button"
          className="adm-btn adm-btn-warn"
          onClick={async () => {
            try {
              const r = await adminApi<{ cleared: number }>("/api/internal/admin/menu/sold-out/clear", { method: "POST" });
              setFlash({ kind: "ok", text: `Cleared sold-out on ${r.cleared} item(s).` });
              load();
            } catch (e) {
              setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
            }
          }}
        >
          Clear all sold-out
        </button>
        <Link className="adm-btn" href="/admin/menu/curation">Curation</Link>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Price</th>
              <th>Flags</th>
              <th>Sold out</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={String(item.id)}>
                <td>
                  <Link className="adm-link" href={`/admin/menu/${item.id}`}>{String(item.name)}</Link>
                </td>
                <td>{String((item.category as { name?: string } | undefined)?.name ?? "")}</td>
                <td className="adm-money">{money(Number(item.basePriceCents))}</td>
                <td>
                  {item.isUnverifiedPrice ? <span className="adm-badge adm-badge-hot">unverified</span> : null}{" "}
                  {item.isActive ? null : <span className="adm-badge">inactive</span>}
                </td>
                <td>
                  <button
                    type="button"
                    className={item.isSoldOut ? "adm-btn adm-btn-danger" : "adm-btn adm-btn-ghost"}
                    onClick={async () => {
                      try {
                        await adminApi(`/api/internal/admin/menu/items/${item.id}/sold-out`, {
                          method: "POST",
                          body: JSON.stringify({ isSoldOut: !item.isSoldOut }),
                        });
                        load();
                      } catch (e) {
                        setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
                      }
                    }}
                  >
                    {item.isSoldOut ? "Sold out" : "Available"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CurationView() {
  const [items, setItems] = useState<Array<{ id: string; name: string }>>([]);
  const [featured, setFeatured] = useState<string[]>([]);
  const [most, setMost] = useState<string[]>([]);
  const [flash, setFlash] = useFlash();
  useEffect(() => {
    adminApi<Array<{ id: string; name: string }>>("/api/internal/admin/menu/items").then(setItems).catch(() => undefined);
    adminApi<{ featured: Array<{ id: string }>; mostOrdered: Array<{ id: string }> }>("/api/internal/admin/menu/curation")
      .then((d) => {
        setFeatured(d.featured.map((i) => i.id));
        setMost(d.mostOrdered.map((i) => i.id));
      })
      .catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  }, [setFlash]);
  async function save(kind: "featured" | "mostOrdered", ids: string[]) {
    try {
      await adminApi("/api/internal/admin/menu/curation", {
        method: "PUT",
        body: JSON.stringify({ kind, itemIds: ids }),
      });
      setFlash({ kind: "ok", text: `${kind} list saved.` });
    } catch (e) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : "Not saved." });
    }
  }
  return (
    <>
      <h1 className="adm-h1">Curation</h1>
      <p className="adm-lead">Featured and most-ordered are manual lists. Empty lists hide those storefront sections.</p>
      <FlashBar flash={flash} />
      <div className="adm-cards">
        <div className="adm-card">
          <h2>Featured (top to bottom)</h2>
          <select multiple size={8} value={featured} onChange={(e) => setFeatured([...e.target.selectedOptions].map((o) => o.value))} style={{ width: "100%", minHeight: "10rem" }}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button type="button" className="adm-btn" style={{ marginTop: "0.5rem" }} onClick={() => void save("featured", featured)}>Save featured</button>
        </div>
        <div className="adm-card">
          <h2>Most ordered</h2>
          <select multiple size={8} value={most} onChange={(e) => setMost([...e.target.selectedOptions].map((o) => o.value))} style={{ width: "100%", minHeight: "10rem" }}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button type="button" className="adm-btn" style={{ marginTop: "0.5rem" }} onClick={() => void save("mostOrdered", most)}>Save most ordered</button>
        </div>
      </div>
    </>
  );
}

function ItemView({ id }: { id: string }) {
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [flash, setFlash] = useFlash();
  const load = useCallback(() => {
    adminApi<Record<string, unknown>>(`/api/internal/admin/menu/items/${id}`).then(setItem).catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  }, [id, setFlash]);
  useEffect(() => {
    load();
    adminApi<Array<{ id: string; name: string }>>("/api/internal/admin/menu/categories").then(setCategories).catch(() => undefined);
    adminApi<Array<{ id: string; name: string }>>("/api/internal/admin/modifiers").then(setGroups).catch(() => undefined);
  }, [load]);
  if (!item) return <p className="adm-muted">Loading item…</p>;
  const cents = Number(item.basePriceCents);
  const dollars = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
  const bound = ((item.modifierGroups as Array<{ groupId: string; sortOrder: number }>) ?? []).map((b) => b.groupId);
  return (
    <>
      <h1 className="adm-h1">{String(item.name)}</h1>
      <FlashBar flash={flash} />
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            await adminApi(`/api/internal/admin/menu/items/${id}`, {
              method: "PATCH",
              body: JSON.stringify({
                name: form.get("name"),
                boardLabel: form.get("boardLabel") || null,
                description: form.get("description") || null,
                price: form.get("price"),
                categoryId: form.get("categoryId"),
                slug: form.get("slug"),
                sortOrder: Number(form.get("sortOrder")),
                isActive: form.get("isActive") === "on",
                isSoldOut: form.get("isSoldOut") === "on",
                isFeatured: form.get("isFeatured") === "on",
                isMostOrdered: form.get("isMostOrdered") === "on",
                imageUrl: form.get("imageUrl") || null,
              }),
            });
            setFlash({ kind: "ok", text: "Saved." });
            load();
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        <label className="adm-field">Name<input name="name" defaultValue={String(item.name)} required /></label>
        <label className="adm-field">Board label<input name="boardLabel" defaultValue={String(item.boardLabel ?? "")} /></label>
        <label className="adm-field">Price (USD)<input name="price" defaultValue={dollars} required /></label>
        <label className="adm-field">Slug<input name="slug" defaultValue={String(item.slug)} /></label>
        <label className="adm-field">
          Category
          <select name="categoryId" defaultValue={String(item.categoryId)}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="adm-field">Sort<input name="sortOrder" type="number" defaultValue={Number(item.sortOrder)} /></label>
        <label className="adm-field adm-form-wide">Description<textarea name="description" defaultValue={String(item.description ?? "")} /></label>
        <label className="adm-field adm-form-wide">Image URL<input name="imageUrl" defaultValue={String(item.imageUrl ?? "")} /></label>
        <label className="adm-field">Active<input type="checkbox" name="isActive" defaultChecked={Boolean(item.isActive)} /></label>
        <label className="adm-field">Sold out<input type="checkbox" name="isSoldOut" defaultChecked={Boolean(item.isSoldOut)} /></label>
        <label className="adm-field">Featured<input type="checkbox" name="isFeatured" defaultChecked={Boolean(item.isFeatured)} /></label>
        <label className="adm-field">Most ordered<input type="checkbox" name="isMostOrdered" defaultChecked={Boolean(item.isMostOrdered)} /></label>
        {item.isUnverifiedPrice ? <p className="adm-warn">Placeholder price. Saving a new price clears this flag.</p> : null}
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Save item</button></div>
      </form>
      <h2>Modifier groups on this item</h2>
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const selected = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input[name=group]:checked")].map((el, i) => ({
            groupId: el.value,
            sortOrder: i,
          }));
          try {
            await adminApi(`/api/internal/admin/menu/items/${id}/bindings`, {
              method: "PUT",
              body: JSON.stringify({ bindings: selected }),
            });
            setFlash({ kind: "ok", text: "Bindings saved." });
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        {groups.map((g) => (
          <label key={g.id} className="adm-field">
            {g.name}
            <input type="checkbox" name="group" value={g.id} defaultChecked={bound.includes(g.id)} />
          </label>
        ))}
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Save bindings</button></div>
      </form>
    </>
  );
}

function ModifiersView() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [flash, setFlash] = useFlash();
  const load = () => {
    adminApi<Array<Record<string, unknown>>>("/api/internal/admin/modifiers").then(setRows).catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount
  useEffect(load, []);

  return (
    <>
      <h1 className="adm-h1">Modifiers</h1>
      <FlashBar flash={flash} />
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            await adminApi("/api/internal/admin/modifiers", {
              method: "POST",
              body: JSON.stringify({
                name: form.get("name"),
                prompt: form.get("prompt"),
                minSelect: Number(form.get("minSelect")),
                maxSelect: Number(form.get("maxSelect")),
                isRequired: form.get("isRequired") === "on",
              }),
            });
            setFlash({ kind: "ok", text: "Group created." });
            e.currentTarget.reset();
            load();
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        <label className="adm-field">Internal name<input name="name" required /></label>
        <label className="adm-field">Customer prompt<input name="prompt" required /></label>
        <label className="adm-field">Min<input name="minSelect" type="number" defaultValue={0} /></label>
        <label className="adm-field">Max<input name="maxSelect" type="number" defaultValue={1} /></label>
        <label className="adm-field">Required<input type="checkbox" name="isRequired" /></label>
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Create group</button></div>
      </form>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Prompt</th><th>Select</th><th>Items</th><th></th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={String(g.id)}>
                <td><Link className="adm-link" href={`/admin/modifiers/${g.id}`}>{String(g.name)}</Link></td>
                <td>{String(g.prompt)}</td>
                <td>{String(g.minSelect)}–{String(g.maxSelect)}</td>
                <td>{String((g._count as { items?: number } | undefined)?.items ?? "")}</td>
                <td>{g.isProvisional ? <span className="adm-badge adm-badge-hot">provisional</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GroupView({ id }: { id: string }) {
  const [group, setGroup] = useState<Record<string, unknown> | null>(null);
  const [allItems, setAllItems] = useState<Array<{ id: string; name: string }>>([]);
  const [flash, setFlash] = useFlash();
  const load = useCallback(() => {
    adminApi<Record<string, unknown>>(`/api/internal/admin/modifiers/${id}`).then(setGroup).catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  }, [id, setFlash]);
  useEffect(() => {
    load();
    adminApi<Array<{ id: string; name: string }>>("/api/internal/admin/menu/items").then((rows) => setAllItems(rows as Array<{ id: string; name: string }>)).catch(() => undefined);
  }, [load]);
  if (!group) return <p className="adm-muted">Loading group…</p>;
  const options = (group.options as Array<Record<string, unknown>>) ?? [];
  const offering = ((group.items as Array<{ itemId: string }>) ?? []).map((b) => b.itemId);
  return (
    <>
      <h1 className="adm-h1">{String(group.name)}</h1>
      <FlashBar flash={flash} />
      {group.isProvisional ? <p className="adm-warn">Provisional group. Saving the prompt or selection counts clears this flag.</p> : null}
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            await adminApi(`/api/internal/admin/modifiers/${id}`, {
              method: "PATCH",
              body: JSON.stringify({
                name: form.get("name"),
                prompt: form.get("prompt"),
                minSelect: Number(form.get("minSelect")),
                maxSelect: Number(form.get("maxSelect")),
                isRequired: form.get("isRequired") === "on",
                isActive: form.get("isActive") === "on",
              }),
            });
            setFlash({ kind: "ok", text: "Saved." });
            load();
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        <label className="adm-field">Name<input name="name" defaultValue={String(group.name)} /></label>
        <label className="adm-field">Prompt<input name="prompt" defaultValue={String(group.prompt)} /></label>
        <label className="adm-field">Min<input name="minSelect" type="number" defaultValue={Number(group.minSelect)} /></label>
        <label className="adm-field">Max<input name="maxSelect" type="number" defaultValue={Number(group.maxSelect)} /></label>
        <label className="adm-field">Required<input type="checkbox" name="isRequired" defaultChecked={Boolean(group.isRequired)} /></label>
        <label className="adm-field">Active<input type="checkbox" name="isActive" defaultChecked={Boolean(group.isActive)} /></label>
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Save group</button></div>
      </form>
      <h2>Options</h2>
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            await adminApi(`/api/internal/admin/modifiers/${id}/options`, {
              method: "POST",
              body: JSON.stringify({ name: form.get("name"), price: form.get("price") || "0" }),
            });
            e.currentTarget.reset();
            load();
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        <label className="adm-field">Name<input name="name" required /></label>
        <label className="adm-field">Price delta<input name="price" defaultValue="0.00" /></label>
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Add option</button></div>
      </form>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Delta</th><th></th></tr></thead>
          <tbody>
            {options.map((o) => (
              <tr key={String(o.id)}>
                <td>{String(o.name)}</td>
                <td className="adm-money">{money(Number(o.priceDeltaCents))}</td>
                <td>
                  <button
                    type="button"
                    className="adm-btn adm-btn-ghost"
                    onClick={async () => {
                      await adminApi(`/api/internal/admin/modifiers/options/${o.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ isSoldOut: !o.isSoldOut }),
                      });
                      load();
                    }}
                  >
                    {o.isSoldOut ? "Sold out" : "Available"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Items offering this group</h2>
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const selected = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input[name=item]:checked")].map((el, i) => ({
            itemId: el.value,
            sortOrder: i,
          }));
          try {
            await adminApi(`/api/internal/admin/modifiers/${id}/bindings`, {
              method: "PUT",
              body: JSON.stringify({ bindings: selected }),
            });
            setFlash({ kind: "ok", text: "Item list saved." });
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        {allItems.slice(0, 87).map((it) => (
          <label key={it.id} className="adm-field">
            {it.name}
            <input type="checkbox" name="item" value={it.id} defaultChecked={offering.includes(it.id)} />
          </label>
        ))}
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Save offering items</button></div>
      </form>
    </>
  );
}

function StoreView({ role }: { role: string }) {
  const [data, setData] = useState<{
    config: Record<string, unknown>;
    hours: Array<Record<string, unknown>>;
    closures: Array<Record<string, unknown>>;
  } | null>(null);
  const [flash, setFlash] = useFlash();
  const owner = role === "OWNER";
  const load = () => {
    adminApi<{ config: Record<string, unknown>; hours: Array<Record<string, unknown>>; closures: Array<Record<string, unknown>> }>(
      "/api/internal/admin/store",
    ).then(setData).catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount
  useEffect(load, []);

  if (!data) return <p className="adm-muted">Loading store…</p>;
  const c = data.config;
  return (
    <>
      <h1 className="adm-h1">Store</h1>
      <FlashBar flash={flash} />
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const payload: Record<string, unknown> = {
            storeName: form.get("storeName"),
            addressLine1: form.get("addressLine1"),
            city: form.get("city"),
            state: form.get("state"),
            postalCode: form.get("postalCode"),
            contactPhone: form.get("contactPhone"),
            timezone: form.get("timezone"),
            orderNumberPrefix: form.get("orderNumberPrefix"),
            orderNumberResetHour: Number(form.get("orderNumberResetHour")),
            orderNumberPadWidth: Number(form.get("orderNumberPadWidth")),
            normalPrepMinutes: Number(form.get("normalPrepMinutes")),
            busyPrepMinutes: Number(form.get("busyPrepMinutes")),
            isBusy: form.get("isBusy") === "on",
            acceptingOrders: form.get("acceptingOrders") === "on",
            notAcceptingMessage: form.get("notAcceptingMessage") || null,
            managerAlertPhone: form.get("managerAlertPhone") || null,
            managerAlertEmail: form.get("managerAlertEmail") || null,
          };
          if (owner) {
            payload.taxRateBps = Number(form.get("taxRateBps"));
            payload.taxAppliedPreDiscount = form.get("taxAppliedPreDiscount") === "on";
            payload.tippingEnabled = form.get("tippingEnabled") === "on";
            payload.tipPresetsBps = String(form.get("tipPresetsBps") ?? "")
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n));
            payload.defaultTipPresetIndex = Number(form.get("defaultTipPresetIndex"));
          }
          try {
            await adminApi("/api/internal/admin/store", { method: "PATCH", body: JSON.stringify(payload) });
            setFlash({ kind: "ok", text: "Store saved. Storefront will use this on the next request." });
            load();
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        <label className="adm-field">Name<input name="storeName" defaultValue={String(c.storeName)} /></label>
        <label className="adm-field">Address<input name="addressLine1" defaultValue={String(c.addressLine1)} /></label>
        <label className="adm-field">City<input name="city" defaultValue={String(c.city)} /></label>
        <label className="adm-field">State<input name="state" defaultValue={String(c.state)} /></label>
        <label className="adm-field">Postal<input name="postalCode" defaultValue={String(c.postalCode)} /></label>
        <label className="adm-field">Contact phone<input name="contactPhone" defaultValue={String(c.contactPhone)} /></label>
        <label className="adm-field">Timezone<input name="timezone" defaultValue={String(c.timezone)} /></label>
        <label className="adm-field">Order prefix<input name="orderNumberPrefix" defaultValue={String(c.orderNumberPrefix)} /></label>
        <p className="adm-warn">Changing the prefix or reset hour changes what prints on the next paid ticket. Do not change mid-service unless you mean to.</p>
        <label className="adm-field">Reset hour<input name="orderNumberResetHour" type="number" defaultValue={Number(c.orderNumberResetHour)} /></label>
        <label className="adm-field">Pad width<input name="orderNumberPadWidth" type="number" defaultValue={Number(c.orderNumberPadWidth)} /></label>
        <label className="adm-field">Normal prep<input name="normalPrepMinutes" type="number" defaultValue={Number(c.normalPrepMinutes)} /></label>
        <label className="adm-field">Busy prep<input name="busyPrepMinutes" type="number" defaultValue={Number(c.busyPrepMinutes)} /></label>
        <label className="adm-field">Busy now<input type="checkbox" name="isBusy" defaultChecked={Boolean(c.isBusy)} /></label>
        <label className="adm-field">Accepting orders<input type="checkbox" name="acceptingOrders" defaultChecked={Boolean(c.acceptingOrders)} /></label>
        <label className="adm-field adm-form-wide">Not-accepting message<input name="notAcceptingMessage" defaultValue={String(c.notAcceptingMessage ?? "")} /></label>
        <label className="adm-field">Manager alert phone<input name="managerAlertPhone" defaultValue={String(c.managerAlertPhone ?? "")} /></label>
        <label className="adm-field">Manager alert email<input name="managerAlertEmail" defaultValue={String(c.managerAlertEmail ?? "")} /></label>
        {owner ? (
          <>
            <p className="adm-warn">Tax rate is in basis points (1010 = 10.10%). A mistyped rate charges every future customer until you notice. Historical orders keep the rate snapshotted at purchase.</p>
            <label className="adm-field">Tax bps<input name="taxRateBps" type="number" defaultValue={Number(c.taxRateBps)} /></label>
            <label className="adm-field">Tax pre-discount<input type="checkbox" name="taxAppliedPreDiscount" defaultChecked={Boolean(c.taxAppliedPreDiscount)} /></label>
            <label className="adm-field">Tipping on<input type="checkbox" name="tippingEnabled" defaultChecked={Boolean(c.tippingEnabled)} /></label>
            <label className="adm-field">Tip presets bps<input name="tipPresetsBps" defaultValue={(c.tipPresetsBps as number[]).join(", ")} /></label>
            <label className="adm-field">Default tip index<input name="defaultTipPresetIndex" type="number" defaultValue={Number(c.defaultTipPresetIndex)} /></label>
          </>
        ) : (
          <p className="adm-muted adm-form-wide">Tax and tip settings are owner-only.</p>
        )}
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Save store</button></div>
      </form>
      <h2>Weekly hours</h2>
      <HoursEditor hours={data.hours} onSaved={load} setFlash={setFlash} />
      <h2>Closure dates</h2>
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            await adminApi("/api/internal/admin/store/closures", {
              method: "POST",
              body: JSON.stringify({ date: form.get("date"), reason: form.get("reason") }),
            });
            load();
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        <label className="adm-field">Date<input name="date" type="date" required /></label>
        <label className="adm-field">Reason<input name="reason" /></label>
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Add closure</button></div>
      </form>
      <ul>
        {data.closures.map((cl) => (
          <li key={String(cl.id)}>
            {String(cl.date).slice(0, 10)} — {String(cl.reason ?? "")}{" "}
            <button
              type="button"
              className="adm-btn adm-btn-ghost"
              onClick={async () => {
                await adminApi(`/api/internal/admin/store/closures/${cl.id}`, { method: "DELETE" });
                load();
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function HoursEditor({
  hours,
  onSaved,
  setFlash,
}: {
  hours: Array<Record<string, unknown>>;
  onSaved: () => void;
  setFlash: (f: Flash) => void;
}) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <form
      className="adm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const rows = hours.map((h) => {
          const d = Number(h.dayOfWeek);
          const form = e.currentTarget;
          const closed = (form.elements.namedItem(`closed-${d}`) as HTMLInputElement).checked;
          return {
            dayOfWeek: d,
            isClosed: closed,
            openTime: (form.elements.namedItem(`open-${d}`) as HTMLInputElement).value || null,
            closeTime: (form.elements.namedItem(`close-${d}`) as HTMLInputElement).value || null,
          };
        });
        try {
          await adminApi("/api/internal/admin/store/hours", { method: "PUT", body: JSON.stringify({ rows }) });
          setFlash({ kind: "ok", text: "Hours saved." });
          onSaved();
        } catch (err) {
          setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
        }
      }}
    >
      {hours.map((h) => {
        const d = Number(h.dayOfWeek);
        return (
          <div key={d} className="adm-field">
            {days[d]}
            <input name={`open-${d}`} defaultValue={String(h.openTime ?? "11:00")} />
            <input name={`close-${d}`} defaultValue={String(h.closeTime ?? "21:00")} />
            <label>Closed <input type="checkbox" name={`closed-${d}`} defaultChecked={Boolean(h.isClosed)} /></label>
          </div>
        );
      })}
      <div className="adm-form-wide"><button className="adm-btn" type="submit">Save hours</button></div>
    </form>
  );
}

function OrdersView({ timezone }: { timezone: string }) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [flash, setFlash] = useFlash();
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    adminApi<{ orders: Array<Record<string, unknown>> }>(`/api/internal/admin/orders?${p}`)
      .then((d) => setRows(d.orders))
      .catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  }, [q, status, setFlash]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <>
      <h1 className="adm-h1">Orders</h1>
      <p className="adm-lead">Today in {timezone} by default. Phones are redacted here.</p>
      <FlashBar flash={flash} />
      <div className="adm-toolbar">
        <label className="adm-field">Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="number, name, phone" /></label>
        <label className="adm-field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {["PAID", "PRINTED", "IN_PROGRESS", "READY", "PICKED_UP", "CANCELLED", "REFUNDED", "AWAITING_PAYMENT"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="button" className="adm-btn" onClick={load}>Filter</button>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Status</th><th>Total</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={String(o.id)}>
                <td><Link className="adm-link" href={`/admin/orders/${String(o.id)}`}>{String(o.orderNumber ?? String(o.id).slice(0, 8))}</Link></td>
                <td>{String(o.customerFirstName)} {String(o.customerLastInitial)}.</td>
                <td>{String(o.customerPhoneRedacted)}</td>
                <td>{String(o.status)}</td>
                <td className="adm-money">{money(Number(o.totalCents))}</td>
                <td>{formatStoreDateTime(String(o.createdAt), timezone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OrderDetailView({ id, timezone }: { id: string; timezone: string }) {
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [flash, setFlash] = useFlash();
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    adminApi<Record<string, unknown>>(`/api/internal/admin/orders/${id}`).then(setOrder).catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  }, [id, setFlash]);
  useEffect(() => {
    load();
  }, [load]);
  if (!order) return <p className="adm-muted">Loading order…</p>;
  const remaining = Number(order.remainingRefundableCents);
  return (
    <>
      <h1 className="adm-h1">Order {String(order.orderNumber ?? id.slice(0, 8))}</h1>
      <FlashBar flash={flash} />
      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await confirm.run();
              setConfirm(null);
              setFlash({ kind: "ok", text: "Done. Reloaded." });
              load();
            } catch (e) {
              setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      <div className="adm-cards">
        <div className="adm-card">
          <h2>Customer</h2>
          <p>{String(order.customerFirstName)} {String(order.customerLastName)}</p>
          <p>{String(order.customerPhoneRedacted)}</p>
          <p>{String(order.customerEmailRedacted)}</p>
        </div>
        <div className="adm-card">
          <h2>Money</h2>
          <p>Subtotal {money(Number(order.subtotalCents))}</p>
          <p>Tax {money(Number(order.taxCents))} ({Number(order.taxRateBps)} bps)</p>
          <p>Tip {money(Number(order.tipCents))}</p>
          <p><strong>Total {money(Number(order.totalCents))}</strong></p>
          <p>Refunded {money(Number(order.refundedCents))} · remaining {money(remaining)}</p>
        </div>
        <div className="adm-card">
          <h2>Status</h2>
          <p>{String(order.status)} / {String(order.paymentStatus)}</p>
          <p>Paid {order.paidAtLocal ? String(order.paidAtLocal) : "—"}</p>
          <p>Payment {String(order.processorPaymentIdRedacted || "—")}</p>
        </div>
      </div>
      <div className="adm-toolbar">
        <button
          type="button"
          className="adm-btn adm-btn-danger"
          disabled={remaining <= 0}
          onClick={() =>
            setConfirm({
              title: "Full refund",
              body: `Refund ${money(remaining)} now? This talks to Square. The order will show pending until the refund is confirmed.`,
              run: () =>
                adminApi(`/api/internal/admin/orders/${id}/refund`, {
                  method: "POST",
                  body: JSON.stringify({ amountCents: "full", confirmed: true, clientIdempotencyKey: crypto.randomUUID() }),
                }),
            })
          }
        >
          Full refund {money(remaining)}
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-warn"
          onClick={() => {
            const raw = window.prompt("Partial refund amount in dollars (e.g. 5.00)");
            if (!raw) return;
            setConfirm({
              title: "Partial refund",
              body: `Refund $${raw}? Remaining refundable is ${money(remaining)}.`,
              run: () =>
                adminApi(`/api/internal/admin/orders/${id}/refund`, {
                  method: "POST",
                  body: JSON.stringify({
                    price: raw,
                    confirmed: true,
                    clientIdempotencyKey: crypto.randomUUID(),
                  }),
                }),
            });
          }}
        >
          Partial refund
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-ghost"
          onClick={() =>
            setConfirm({
              title: "Cancel order",
              body: "Unpaid orders cancel directly. Paid orders are a full refund plus cancellation.",
              run: () =>
                adminApi(`/api/internal/admin/orders/${id}/cancel`, {
                  method: "POST",
                  body: JSON.stringify({ confirmed: true, clientIdempotencyKey: crypto.randomUUID() }),
                }),
            })
          }
        >
          Cancel
        </button>
        <button
          type="button"
          className="adm-btn"
          onClick={() =>
            setConfirm({
              title: "Reprint kitchen ticket",
              body: "This re-queues the stored ticket with a reprint marker. Staff may cook it twice if they miss the marker.",
              run: () =>
                adminApi(`/api/internal/admin/orders/${id}/reprint`, {
                  method: "POST",
                  body: JSON.stringify({ target: "KITCHEN_TICKET", confirmed: true }),
                }),
            })
          }
        >
          Reprint kitchen
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-ghost"
          onClick={() =>
            setConfirm({
              title: "Reprint counter receipt",
              body: "Re-queues the stored counter receipt with a reprint marker.",
              run: () =>
                adminApi(`/api/internal/admin/orders/${id}/reprint`, {
                  method: "POST",
                  body: JSON.stringify({ target: "COUNTER_RECEIPT", confirmed: true }),
                }),
            })
          }
        >
          Reprint counter
        </button>
      </div>
      <h2>Lines</h2>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Qty</th><th>Item</th><th>Mods</th><th>Line</th></tr></thead>
          <tbody>
            {((order.lines as Array<Record<string, unknown>>) ?? []).map((line) => (
              <tr key={String(line.id)}>
                <td>{String(line.quantity)}</td>
                <td>{String(line.itemName)}{line.customerNote ? ` — ${String(line.customerNote)}` : ""}</td>
                <td>
                  {Array.isArray(line.selectedModifiers)
                    ? (line.selectedModifiers as Array<{ optionName?: string }>).map((m) => m.optionName).join(", ")
                    : ""}
                </td>
                <td className="adm-money">{money(Number(line.lineTotalCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Print jobs</h2>
      <ul>
        {((order.printJobs as Array<Record<string, unknown>>) ?? []).map((j) => (
          <li key={String(j.id)}>
            {String(j.target)} · {String(j.status)} {j.isReprint ? "(reprint)" : ""} · sent {j.sentAt ? formatStoreDateTime(String(j.sentAt), timezone) : "—"} · ack {j.acknowledgedAt ? formatStoreDateTime(String(j.acknowledgedAt), timezone) : "—"}
          </li>
        ))}
      </ul>
      <h2>Notification jobs</h2>
      <ul>
        {((order.notifyJobs as Array<Record<string, unknown>>) ?? []).map((j) => (
          <li key={String(j.id)}>{String(j.type)} · {String(j.status)} {j.lastError ? `— ${String(j.lastError)}` : ""}</li>
        ))}
      </ul>
      <h2>Refunds</h2>
      <ul>
        {((order.refunds as Array<Record<string, unknown>>) ?? []).map((r) => (
          <li key={String(r.id)}>
            {money(Number(r.amountCents))} · {String(r.status)} · {String((r.actedBy as { displayName?: string } | null)?.displayName ?? "unattributed")} · {String(r.createdAtLocal)}
          </li>
        ))}
      </ul>
      <h2>Status history</h2>
      <ul>
        {((order.statusEvents as Array<Record<string, unknown>>) ?? []).map((e) => (
          <li key={String(e.id)}>
            {String(e.fromStatus)} → {String(e.toStatus)} · {String(e.source)}
            {e.source === "ADMIN_CORRECTION" ? ` · ${String(e.reason ?? "")}` : ""} · {(e.user as { displayName?: string } | null)?.displayName ?? "automatic"} · {String(e.createdAtLocal)}
          </li>
        ))}
      </ul>
      <h2>Manual status correction</h2>
      <form
        className="adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const to = String(form.get("to"));
          const reason = String(form.get("reason"));
          setConfirm({
            title: "Correct status",
            body: `Move this order to ${to}? This is logged as a manager correction, not a kitchen tap.`,
            run: () =>
              adminApi(`/api/internal/admin/orders/${id}/status`, {
                method: "POST",
                body: JSON.stringify({ to, reason, confirmed: true }),
              }),
          });
        }}
      >
        <label className="adm-field">
          New status
          <select name="to" defaultValue={String(order.status)}>
            {["PAID", "PRINTED", "IN_PROGRESS", "READY", "PICKED_UP", "CANCELLED", "REFUNDED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="adm-field adm-form-wide">Reason<input name="reason" required minLength={3} /></label>
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Correct status</button></div>
      </form>
    </>
  );
}

function ReportsView() {
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [findings, setFindings] = useState<Array<Record<string, unknown>>>([]);
  const [flash, setFlash] = useFlash();
  const load = async () => {
    try {
      const r = await adminApi<Record<string, unknown>>(`/api/internal/admin/reports?from=${from}&to=${to}`);
      setReport(r);
      const rec = await adminApi<{ findings: Array<Record<string, unknown>> }>(`/api/internal/admin/reconcile?from=${from}T00:00:00.000Z&to=${to}T23:59:59.000Z`);
      setFindings(rec.findings);
    } catch (e) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" });
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial
  }, []);
  const totals = report?.totals as Record<string, number> | undefined;
  return (
    <>
      <h1 className="adm-h1">Reports</h1>
      <p className="adm-lead">Figures are the cents stored on each order. Tax is never recalculated.</p>
      <FlashBar flash={flash} />
      <div className="adm-toolbar">
        <label className="adm-field">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="adm-field">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" className="adm-btn" onClick={() => void load()}>Run</button>
        <a className="adm-btn adm-btn-ghost" href={`/api/internal/admin/reports/export?from=${from}&to=${to}`}>Export CSV</a>
      </div>
      {totals ? (
        <div className="adm-cards">
          <div className="adm-card"><h2>Orders</h2><div className="adm-stat">{totals.orderCount ?? 0}</div></div>
          <div className="adm-card"><h2>Gross</h2><div className="adm-stat adm-money">{money(Number(totals.grossSalesCents ?? 0))}</div></div>
          <div className="adm-card"><h2>Tax</h2><div className="adm-stat adm-money">{money(Number(totals.taxCollectedCents ?? 0))}</div></div>
          <div className="adm-card"><h2>Tips</h2><div className="adm-stat adm-money">{money(Number(totals.tipsCollectedCents ?? 0))}</div></div>
          <div className="adm-card"><h2>Refunds</h2><div className="adm-stat adm-money">{money(Number(totals.refundsIssuedCents ?? 0))}</div></div>
          <div className="adm-card"><h2>Net</h2><div className="adm-stat adm-money">{money(Number(totals.netCents ?? 0))}</div></div>
        </div>
      ) : null}
      <h2>By item</h2>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Line total</th></tr></thead>
          <tbody>
            {((report?.items as Array<Record<string, unknown>>) ?? []).map((i) => (
              <tr key={String(i.itemName)}>
                <td>{String(i.itemName)}</td>
                <td>{String(i.quantity)}</td>
                <td className="adm-money">{money(Number(i.lineTotalCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Reconciliation (read-only)</h2>
      {findings.length === 0 ? <p className="adm-muted">No findings in this range.</p> : (
        <ul>
          {findings.map((f, i) => (
            <li key={i}>{String(f.kind)} — {String(f.detail)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function JobsView() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [inspect, setInspect] = useState<Record<string, unknown> | null>(null);
  const [flash, setFlash] = useFlash();
  const load = () => {
    adminApi<Record<string, unknown>>("/api/internal/admin/jobs").then(setData).catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount
  useEffect(load, []);

  const dead = (data?.deadJobs as Array<Record<string, unknown>>) ?? [];
  return (
    <>
      <h1 className="adm-h1">Jobs & print</h1>
      <FlashBar flash={flash} />
      {data && Number((data as { deadCount?: number }).deadCount) > 0 ? (
        <div className="adm-card adm-dead"><h2>Dead jobs</h2><div className="adm-stat">{String((data as { deadCount: number }).deadCount)}</div></div>
      ) : null}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Type</th><th>Status</th><th>Error</th><th></th></tr></thead>
          <tbody>
            {dead.map((j) => (
              <tr key={String(j.id)}>
                <td>{String(j.type)}</td>
                <td>{String(j.status)}</td>
                <td>{String(j.lastError ?? "")}</td>
                <td>
                  <button
                    type="button"
                    className="adm-btn"
                    onClick={async () => {
                      await adminApi(`/api/internal/admin/jobs/${j.id}`, { method: "POST", body: JSON.stringify({ action: "retry" }) });
                      load();
                    }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-ghost"
                    onClick={async () => {
                      const job = await adminApi<Record<string, unknown>>(`/api/internal/admin/jobs/${j.id}`);
                      setInspect(job);
                    }}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="adm-toolbar">
        <button
          type="button"
          className="adm-btn adm-btn-warn"
          onClick={async () => {
            const type = window.prompt("Job type to bulk-retry (e.g. SMS_ORDER_READY)");
            if (!type) return;
            await adminApi(`/api/internal/admin/jobs`, { method: "POST", body: JSON.stringify({ action: "retryType", type }) });
            load();
          }}
        >
          Bulk retry type
        </button>
      </div>
      {inspect ? (
        <pre className="adm-card" style={{ overflow: "auto" }}>{JSON.stringify(inspect, null, 2)}</pre>
      ) : null}
    </>
  );
}

function StaffView() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [pinOnce, setPinOnce] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const load = () => {
    adminApi<Array<Record<string, unknown>>>("/api/internal/admin/staff").then(setRows).catch((e: unknown) => setFlash({ kind: "err", text: e instanceof Error ? e.message : "Failed" }));
    adminApi<Array<Record<string, unknown>>>("/api/internal/admin/audit").then(setAudit).catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount
  useEffect(load, []);

  return (
    <>
      <h1 className="adm-h1">Staff</h1>
      <p className="adm-lead">Owner only. PINs are shown once. Deactivate test accounts rather than deleting them.</p>
      <FlashBar flash={flash} />
      {pinOnce ? <div className="adm-ok">New PIN (write it down, it will not be shown again): <strong>{pinOnce}</strong></div> : null}
      <form
        className="adm-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          try {
            const created = await adminApi<{ user: { displayName: string }; pinOnce: string | null }>("/api/internal/admin/staff", {
              method: "POST",
              body: JSON.stringify({
                email: form.get("email"),
                displayName: form.get("displayName"),
                role: form.get("role"),
                password: form.get("password"),
                pin: form.get("pin") || undefined,
              }),
            });
            setPinOnce(created.pinOnce);
            setFlash({ kind: "ok", text: `Created ${created.user.displayName}.` });
            e.currentTarget.reset();
            load();
          } catch (err) {
            setFlash({ kind: "err", text: err instanceof Error ? err.message : "Not saved." });
          }
        }}
      >
        <label className="adm-field">Email<input name="email" type="email" required /></label>
        <label className="adm-field">Name<input name="displayName" required /></label>
        <label className="adm-field">
          Role
          <select name="role">
            <option>STAFF</option>
            <option>MANAGER</option>
            <option>OWNER</option>
          </select>
        </label>
        <label className="adm-field">Password<input name="password" type="password" required minLength={10} /></label>
        <label className="adm-field">PIN (optional)<input name="pin" pattern="[0-9]{4,8}" /></label>
        <div className="adm-form-wide"><button className="adm-btn" type="submit">Create account</button></div>
      </form>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={String(u.id)}>
                <td>{String(u.displayName)}</td>
                <td>{String(u.email)}</td>
                <td>{String(u.role)}</td>
                <td>{u.isActive ? "yes" : "no"}</td>
                <td>
                  <button
                    type="button"
                    className="adm-btn adm-btn-ghost"
                    onClick={async () => {
                      await adminApi(`/api/internal/admin/staff/${u.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ isActive: !u.isActive }),
                      });
                      load();
                    }}
                  >
                    {u.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn-danger"
                    onClick={async () => {
                      await adminApi(`/api/internal/admin/staff/${u.id}/sessions`, { method: "DELETE" });
                      setFlash({ kind: "ok", text: `Revoked sessions for ${String(u.displayName)}.` });
                    }}
                  >
                    Revoke sessions
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Audit</h2>
      <ul>
        {audit.slice(0, 40).map((a) => (
          <li key={String(a.id)}>
            {String(a.createdAt)} · {(a.user as { displayName?: string } | null)?.displayName ?? "system"} · {String(a.action)} — {String(a.summary)}
          </li>
        ))}
      </ul>
    </>
  );
}
