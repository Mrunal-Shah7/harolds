// SPRINT-7: normalised SMS send outcomes — callers never import Twilio types.
export type SmsSendResult =
  | { kind: "sent"; providerMessageId: string }
  | { kind: "rejected"; code: string; message: string }
  | { kind: "transport_failure"; message: string };

export type SendSmsInput = {
  toE164: string;
  body: string;
};
