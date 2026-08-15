// SPRINT-7: Resend email client — the ONLY module in this repo permitted to import `resend`.
import { emitLog, env } from "@harolds/config";
import { Resend } from "resend";
import { classifyResendError, isPlausibleEmail } from "./errors";
import { redactEmail } from "./redact";
import type { SendEmailInput, EmailSendResult } from "./types";

let cached: Resend | undefined;

function getClient(): Resend {
  const key = env.EMAIL_API_KEY?.trim();
  if (!key) {
    throw new Error("EMAIL_API_KEY is not configured.");
  }
  if (!cached) cached = new Resend(key);
  return cached;
}

export function isEmailConfigured(): boolean {
  const from = env.EMAIL_FROM_ADDRESS?.trim();
  return Boolean(env.EMAIL_API_KEY?.trim() && from && isPlausibleEmail(from));
}

export function getEmailFromAddress(): string {
  const from = env.EMAIL_FROM_ADDRESS?.trim();
  if (!from || !isPlausibleEmail(from)) {
    throw new Error("EMAIL_FROM_ADDRESS is not configured.");
  }
  return from;
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  if (!isEmailConfigured()) {
    return { kind: "rejected", code: "not_configured", message: "Email credentials are not configured." };
  }
  if (!isPlausibleEmail(input.to)) {
    return { kind: "rejected", code: "invalid_to", message: "Stored email address is not sendable." };
  }

  emitLog("info", "email.attempt", { toMasked: redactEmail(input.to) }, { scope: "email" });

  try {
    const { data, error } = await getClient().emails.send({
      from: getEmailFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      const classified = classifyResendError(error);
      emitLog(
        "warn",
        "email.failed",
        { toMasked: redactEmail(input.to), kind: classified.kind, code: classified.code },
        { scope: "email" },
      );
      if (classified.kind === "rejected") {
        return { kind: "rejected", code: classified.code, message: classified.message };
      }
      return { kind: "transport_failure", message: classified.message };
    }
    const id = data?.id ?? "";
    if (!id) {
      return { kind: "transport_failure", message: "Resend returned no email id." };
    }
    emitLog(
      "info",
      "email.sent",
      { toMasked: redactEmail(input.to), providerMessageId: id },
      { scope: "email" },
    );
    return { kind: "sent", providerMessageId: id };
  } catch (err) {
    const classified = classifyResendError(err);
    emitLog(
      "warn",
      "email.failed",
      { toMasked: redactEmail(input.to), kind: classified.kind, code: classified.code },
      { scope: "email" },
    );
    if (classified.kind === "rejected") {
      return { kind: "rejected", code: classified.code, message: classified.message };
    }
    return { kind: "transport_failure", message: classified.message };
  }
}
