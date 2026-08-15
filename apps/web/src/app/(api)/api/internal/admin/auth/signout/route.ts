// SPRINT-8: POST /api/internal/admin/auth/signout — revoke the cookie session.
import { revokeAdminSession } from "@harolds/db";
import { adminOk, clearAdminCookie, readAdminToken } from "@/lib/admin-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const token = readAdminToken(request);
  if (token) {
    try {
      await revokeAdminSession(token);
    } catch {
      // already invalid — still clear the cookie
    }
  }
  const response = adminOk({ ok: true });
  clearAdminCookie(response);
  return response;
}
