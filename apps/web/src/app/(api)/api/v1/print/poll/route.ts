// SPRINT-5: POST /api/v1/print/poll — Epson Server Direct Print device endpoint (not storefront)
import { handleServerDirectPrint } from "@/lib/sdp-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleServerDirectPrint(request);
}

/** Digest handshake / health: empty body after auth, 401 challenge otherwise. */
export async function GET(request: Request): Promise<Response> {
  return handleServerDirectPrint(request);
}
