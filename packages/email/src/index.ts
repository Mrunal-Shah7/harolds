// SPRINT-7: public API of @harolds/email. This is the ONLY module that imports the Resend SDK.
export { sendEmail, isEmailConfigured, getEmailFromAddress } from "./client";
export { redactEmail } from "./redact";
export { isPlausibleEmail } from "./errors";
export type { EmailSendResult, SendEmailInput } from "./types";
