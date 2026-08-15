// SPRINT-7: redacted identifiers for logs — never a full customer email address.
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const lastDot = domain.lastIndexOf(".");
  const tld = lastDot >= 0 ? domain.slice(lastDot + 1) : "tld";
  const localLead = local.charAt(0);
  return `${localLead}***@***.${tld}`;
}
