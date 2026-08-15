// SPRINT-7: Twilio SMS client — the ONLY module in this repo permitted to import `twilio`.
import { emitLog, env } from "@harolds/config";
import twilio from "twilio";
import { classifyTwilioError } from "./errors";
import { redactPhone } from "./redact";
import type { SendSmsInput, SmsSendResult } from "./types";

let cached: ReturnType<typeof twilio> | undefined;

function getClient(): ReturnType<typeof twilio> {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  }
  if (!cached) cached = twilio(sid, token);
  return cached;
}

export function isTwilioConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim() && env.TWILIO_FROM_NUMBER?.trim());
}

export function getTwilioFromNumber(): string {
  const from = env.TWILIO_FROM_NUMBER?.trim();
  if (!from) throw new Error("TWILIO_FROM_NUMBER is not configured.");
  return from;
}

export async function sendSms(input: SendSmsInput): Promise<SmsSendResult> {
  if (!isTwilioConfigured()) {
    return { kind: "rejected", code: "not_configured", message: "Twilio credentials are not configured." };
  }
  if (!/^\+[1-9]\d{7,14}$/.test(input.toE164)) {
    return { kind: "rejected", code: "invalid_to", message: "Stored phone number is not sendable E.164." };
  }

  emitLog("info", "sms.attempt", { toMasked: redactPhone(input.toE164) }, { scope: "sms" });

  try {
    const msg = await getClient().messages.create({
      to: input.toE164,
      from: getTwilioFromNumber(),
      body: input.body,
    });
    const id = msg.sid ?? "";
    if (!id) {
      return { kind: "transport_failure", message: "Twilio returned no message sid." };
    }
    emitLog(
      "info",
      "sms.sent",
      { toMasked: redactPhone(input.toE164), providerMessageId: id },
      { scope: "sms" },
    );
    return { kind: "sent", providerMessageId: id };
  } catch (err) {
    const classified = classifyTwilioError(err);
    emitLog(
      "warn",
      "sms.failed",
      { toMasked: redactPhone(input.toE164), kind: classified.kind, code: classified.code },
      { scope: "sms" },
    );
    if (classified.kind === "rejected") {
      return { kind: "rejected", code: classified.code, message: classified.message };
    }
    return { kind: "transport_failure", message: classified.message };
  }
}

export function verifyTwilioSignature(args: {
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): boolean {
  if (!args.signature) return false;
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) return false;
  return twilio.validateRequest(token, args.signature, args.url, args.params);
}
