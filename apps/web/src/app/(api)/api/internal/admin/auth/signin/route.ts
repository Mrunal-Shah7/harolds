// SPRINT-8: POST /api/internal/admin/auth/signin — email/password, httpOnly cookie.
import { getAdminConfig, emitLog } from "@harolds/config";
import { signInWithPassword } from "@harolds/db";
import { AdminErrorCode } from "@harolds/types";
import { adminAuthError, adminFail, adminOk, attachAdminCookie } from "@/lib/admin-http";
import { enforceRateLimit } from "@/lib/enforce-rate-limit";
import { BODY_LIMITS, readBoundedJson } from "@/lib/read-json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "adminSignin");
    if (limited) return limited;
    const parsed = await readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonAdminBytes, kind: "admin" });
    if (!parsed.ok) return parsed.response;
    const body = parsed.value as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Email and password are required.");
    }
    const cfg = getAdminConfig();
    const issued = await signInWithPassword(
      email,
      password,
      {
        maxFailures: cfg.maxPasswordFailures,
        lockoutMs: cfg.passwordLockoutMs,
        sessionTtlMs: cfg.sessionTtlMs,
      },
      {
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      },
    );
    const response = adminOk({
      expiresAt: issued.expiresAt.toISOString(),
      user: issued.user,
    });
    attachAdminCookie(response, issued.token, Math.floor(cfg.sessionTtlMs / 1000));
    return response;
  } catch (err) {
    try {
      return adminAuthError(err);
    } catch {
      emitLog("error", "admin.signin_failed", {}, { scope: "admin" });
      return adminFail(AdminErrorCode.VALIDATION_ERROR, "Sign-in failed.");
    }
  }
}
