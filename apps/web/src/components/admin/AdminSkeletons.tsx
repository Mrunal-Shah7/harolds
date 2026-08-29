// SPRINT-17: admin loading skeletons (design.md §12).
//
// These replace the bare "Loading dashboard…" / "Loading item…" text lines. §16.7 requires a
// skeleton's dimensions to match the loaded content, so each block below mirrors the real view's
// box model — the stat-card grid, the toolbar-plus-table, the two-column form — rather than being
// a generic grey rectangle.
//
// Admin styling still lives in admin.css and is still hardcoded hex; retokenising it is Sprint 15's
// job. These use the admin class namespace so they stay consistent with the screens around them.

function Bar({ w, h = 14 }: { w: string; h?: number }) {
  return <span className="adm-skel" style={{ width: w, height: h }} aria-hidden="true" />;
}

/** The sidebar, while the session resolves. Same width and row rhythm as the real nav. */
export function AdminNavSkeleton() {
  return (
    <nav className="adm-nav" aria-hidden="true">
      <p className="adm-brand">Harold&apos;s</p>
      <p className="adm-brand-sub">Oak Lawn back office</p>
      {Array.from({ length: 7 }).map((_, i) => (
        <span key={i} className="adm-skel-navrow">
          <Bar w={`${60 + ((i * 13) % 40)}%`} />
        </span>
      ))}
    </nav>
  );
}

/** Generic panel skeleton — a heading, a lead line, and a block. */
export function AdminViewSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <Bar w="18rem" h={26} />
      <div style={{ height: 8 }} />
      <Bar w="24rem" h={14} />
      <div style={{ height: 20 }} />
      <div className="adm-skel-block" />
    </div>
  );
}

/** Dashboard: the stat-card grid then a table. */
export function AdminDashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <Bar w="14rem" h={26} />
      <div style={{ height: 16 }} />
      <div className="adm-cards">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="adm-card">
            <Bar w="7rem" h={11} />
            <div style={{ height: 10 }} />
            <Bar w="5rem" h={26} />
          </div>
        ))}
      </div>
      <AdminTableSkeleton rows={6} cols={5} />
    </div>
  );
}

/** A toolbar plus a table, at the real table's row height. */
export function AdminTableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i}>
                  <Bar w="4rem" h={10} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: cols }).map((_, c) => (
                  <td key={c}>
                    <Bar w={c === 0 ? "9rem" : "5rem"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** An edit form: the same auto-fit grid the real forms use. */
export function AdminFormSkeleton({ fields = 8 }: { fields?: number }) {
  return (
    <div role="status" aria-label="Loading">
      <Bar w="16rem" h={26} />
      <div style={{ height: 16 }} />
      <div className="adm-form">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <Bar w="6rem" h={10} />
            <div style={{ height: 6 }} />
            <Bar w="100%" h={30} />
          </div>
        ))}
      </div>
    </div>
  );
}
