// SPRINT-7: Twilio inbound opt-out / opt-in — verified by the HTTP layer, processed idempotently here.
import {
  recordSmsInboundEvent,
  setSmsSuppression,
  type RecordSmsInboundResult,
  type SmsInboundKind,
} from "@harolds/db";

const OPT_OUT = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const OPT_IN = new Set(["START", "YES", "UNSTOP"]);

export function classifySmsKeyword(body: string): SmsInboundKind {
  const word = body.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (OPT_OUT.has(word)) return "opt_out";
  if (OPT_IN.has(word)) return "opt_in";
  return "ignored";
}

export async function processTwilioInbound(args: {
  providerEventId: string;
  fromPhone: string;
  body: string;
}): Promise<RecordSmsInboundResult> {
  const kind = classifySmsKeyword(args.body);
  const recorded = await recordSmsInboundEvent({
    providerEventId: args.providerEventId,
    fromPhone: args.fromPhone,
    body: args.body,
    kind,
  });
  if (recorded.outcome === "duplicate") {
    return recorded;
  }
  if (kind === "opt_out") {
    await setSmsSuppression({ phoneE164: args.fromPhone, suppressed: true });
  } else if (kind === "opt_in") {
    await setSmsSuppression({ phoneE164: args.fromPhone, suppressed: false });
  }
  return recorded;
}
