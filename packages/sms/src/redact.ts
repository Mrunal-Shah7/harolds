// SPRINT-7: redacted identifiers for logs — never a full phone number.
export function redactPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}
