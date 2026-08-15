// SPRINT-7: normalised email send outcomes — callers never import Resend types.
export type EmailSendResult =
  | { kind: "sent"; providerMessageId: string }
  | { kind: "rejected"; code: string; message: string }
  | { kind: "transport_failure"; message: string };

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
