"use client";

// SPRINT-8: email/password sign-in for the back office.
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
        <p className="adm-brand-sub" style={{ color: "#9b1c1c" }}>Harold&apos;s Chicken Oak Lawn</p>
        <h1 className="adm-h1">Back office</h1>
        <p className="adm-lead">Managers and owners only. Kitchen staff use the kitchen display.</p>
        {error ? <div className="adm-error">{error}</div> : null}
        <label className="adm-field">
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="adm-field" style={{ marginTop: "0.6rem" }}>
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
