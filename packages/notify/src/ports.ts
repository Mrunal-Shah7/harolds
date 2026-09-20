// SPRINT-7 / SPRINT-17: injected send ports so tests never need live provider credentials.
//
// SMS was removed in Sprint 17 (Twilio dropped entirely), so email is the only channel. The
// object shape is kept rather than collapsing to a bare function: adding a second channel back
// should not mean rewriting every handler signature again.
import type { EmailSendResult, SendEmailInput } from "@harolds/email";

export type EmailPort = (input: SendEmailInput) => Promise<EmailSendResult>;

export type NotifyPorts = {
  sendEmail: EmailPort;
};
