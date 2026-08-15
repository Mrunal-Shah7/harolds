// SPRINT-5: POST /api/v1/print/complete — printer acknowledgement (same SDP body as poll SetResponse)
import { handleServerDirectPrint } from "@/lib/sdp-handler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleServerDirectPrint(request);
}
