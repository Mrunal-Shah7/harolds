"use client";

// Email/password sign-in for the back office.
// Not drawn in the mockup: built from the design's own parts — paper ground, surface card,
// the poster wordmark, the one field, the one button.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminApi, AdminApiError } from "@/components/admin/admin-api";

export default function AdminSignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="adm-signin">
      <form
        className="adm-signin-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const form = new FormData(e.currentTarget);
          try {
            await adminApi("/api/internal/admin/auth/signin", {
              method: "POST",
              body: JSON.stringify({
                email: form.get("email"),
                password: form.get("password"),
              }),
            });
            router.replace("/admin");
          } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Sign-in failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="wordmark">
          Harold&apos;s<small>Back office</small>
        </div>
        <h1>Sign in</h1>
        <p>Managers and owners only. Kitchen staff use the kitchen display.</p>
        {error ? <div className="adm-error">{error}</div> : null}
        <label className="adm-field" style={{ display: "block" }}>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="adm-field" style={{ marginTop: "1rem", display: "block" }}>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="adm-btn" type="submit" disabled={busy} style={{ marginTop: "1rem", width: "100%" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
