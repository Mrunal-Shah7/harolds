// SPRINT-5: encoding helpers — XML escape + ASCII fold so markup never leaves the renderer malformed
/**
 * TM-m30III ePOS-Print documents are UTF-8 XML. Characters outside printable ASCII are
 * folded (NFKD, strip combining marks) so an accented name degrades to a readable ASCII
 * form instead of corrupting the document or printing as a code-page blob.
 */
export function foldToPrintableAscii(input: string): string {
  const decomposed = input.normalize("NFKD").replace(/\p{M}+/gu, "");
  let out = "";
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || ch === "\r" || ch === "\t") {
      out += " ";
      continue;
    }
    if (code >= 32 && code <= 126) {
      out += ch;
      continue;
    }
    // Common punctuation that NFKD does not fold
    if (ch === "–" || ch === "—" || ch === "−") {
      out += "-";
      continue;
    }
    if (ch === "‘" || ch === "’" || ch === "‚") {
      out += "'";
      continue;
    }
    if (ch === "“" || ch === "”" || ch === "„") {
      out += '"';
      continue;
    }
    if (ch === "…") {
      out += "...";
      continue;
    }
    if (ch === "€") {
      out += "EUR";
      continue;
    }
    out += "?";
  }
  return out;
}

/** Escape XML markup-significant characters. Call after folding. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function preparePrintText(input: string): string {
  return escapeXml(foldToPrintableAscii(input));
}
