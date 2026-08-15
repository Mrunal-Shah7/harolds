// SPRINT-8: redacted contact and payment identifiers for the admin surface and logs.
export function redactPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

export function redactEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const lastDot = domain.lastIndexOf(".");
  const tld = lastDot >= 0 ? domain.slice(lastDot + 1) : "tld";
  return `${local.charAt(0)}***@***.${tld}`;
}

export function redactPaymentId(id: string | null | undefined): string {
  if (!id) return "";
  if (id.length <= 6) return "***";
  return `…${id.slice(-6)}`;
}

export function maskName(first: string, last: string): { firstName: string; lastInitial: string } {
  return {
    firstName: first.trim(),
    lastInitial: last.trim().charAt(0).toUpperCase(),
  };
}
