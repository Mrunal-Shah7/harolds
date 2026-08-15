// SPRINT-7: POST /api/v1/webhooks/twilio — provider inbound SMS; not a storefront surface.
import { env, BODY_LIMITS } from "@harolds/config";
import { processTwilioInbound } from "@harolds/notify";
import { verifyTwilioSignature } from "@harolds/sms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function webhookUrl(): string {
  const override = env.TWILIO_WEBHOOK_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/v1/webhooks/twilio`;
}

function twimlEmpty(): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_LIMITS.webhookBytes) {
    return new Response("Request body is too large.", { status: 400 });
  }
  const signature = request.headers.get("x-twilio-signature") ?? request.headers.get("X-Twilio-Signature");
  const raw = await request.text();
  if (raw.length > BODY_LIMITS.webhookBytes) {
    return new Response("Request body is too large.", { status: 400 });
  }
  const params: Record<string, string> = {};
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const [k, v] = pair.split("=");
    if (!k) continue;
    params[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent((v ?? "").replace(/\+/g, " "));
  }

  const valid = verifyTwilioSignature({
    url: webhookUrl(),
    params,
    signature,
  });
  if (!valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const from = params.From ?? "";
  const body = params.Body ?? "";
  const sid = params.MessageSid ?? params.SmsSid ?? "";
  if (!from || !sid) {
    return twimlEmpty();
  }

  await processTwilioInbound({ providerEventId: sid, fromPhone: from, body });
  return twimlEmpty();
}
