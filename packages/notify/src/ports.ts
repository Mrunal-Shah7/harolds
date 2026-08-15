// SPRINT-7: injected send ports so tests never need live Twilio or Resend credentials.
import type { EmailSendResult, SendEmailInput } from "@harolds/email";
import type { SendSmsInput, SmsSendResult } from "@harolds/sms";

export type SmsPort = (input: SendSmsInput) => Promise<SmsSendResult>;
export type EmailPort = (input: SendEmailInput) => Promise<EmailSendResult>;

export type NotifyPorts = {
  sendSms: SmsPort;
  sendEmail: EmailPort;
};
