// SPRINT-5: Epson Server Direct Print envelope — wrap stored ePOS-Print XML for a poll response
const LOCAL_DEVICE_ID = "local_printer";
const PRINT_TIMEOUT_MS = 10_000;

function xmlText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1] ?? null;
}

function xmlAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = xml.match(re);
  return m?.[1] ?? null;
}

/**
 * Wrap a stored ePOS-Print document in PrintRequestInfo Version="2.00" so the TM-m30III
 * can match the completion report to printjobid (1–30 alphanumeric / _ / - / .).
 */
export function wrapPrintRequest(args: { printJobId: string; eposXml: string }): string {
  const inner = args.eposXml.replace(/^<\?xml[^?]*\?>/, "").trim();
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<PrintRequestInfo Version="2.00">` +
    `<ePOSPrint>` +
    `<Parameter>` +
    `<devid>${LOCAL_DEVICE_ID}</devid>` +
    `<timeout>${PRINT_TIMEOUT_MS}</timeout>` +
    `<printjobid>${args.printJobId}</printjobid>` +
    `</Parameter>` +
    `<PrintData>${inner}</PrintData>` +
    `</ePOSPrint>` +
    `</PrintRequestInfo>`
  );
}

export type SdpConnectionType = "GetRequest" | "SetResponse" | "unknown";

export type SdpIncoming = {
  connectionType: SdpConnectionType;
  printerId: string;
  responseXml: string | null;
};

/** Parse the printer's application/x-www-form-urlencoded POST body. */
export function parseSdpFormBody(raw: string): SdpIncoming {
  const params = new URLSearchParams(raw);
  const typeRaw = params.get("ConnectionType") ?? "";
  const connectionType: SdpConnectionType =
    typeRaw === "GetRequest" || typeRaw === "SetResponse" ? typeRaw : "unknown";
  const printerId = (params.get("ID") || params.get("Name") || "").trim();
  const responseXml = params.get("ResponseFile");
  return { connectionType, printerId, responseXml };
}

export type PrintCompletionReport = {
  printJobId: string | null;
  success: boolean;
  code: string;
  status: string | null;
};

/**
 * Parse the ResponseFile XML from a SetResponse. Codes are kept verbatim for lastError.
 */
export function parsePrintCompletion(xml: string): PrintCompletionReport {
  const printJobId = xmlText(xml, "printjobid")?.trim() || null;
  const successAttr = xmlAttr(xml, "response", "success");
  const codeAttr = xmlAttr(xml, "response", "code") ?? "";
  const statusAttr = xmlAttr(xml, "response", "status");
  const success = successAttr?.toLowerCase() === "true";
  return {
    printJobId,
    success,
    code: codeAttr,
    status: statusAttr,
  };
}

/** Human-readable classification of Epson device codes; the raw code is always preserved. */
export function classifyPrinterCode(code: string): string {
  const c = code.toUpperCase();
  if (!c) return "printer reported failure with no code";
  if (c.includes("REC_EMPTY") || c === "EPTR_REC_EMPTY") return "out of paper";
  if (c.includes("COVER_OPEN") || c === "EPTR_COVER_OPEN") return "cover open";
  if (c.includes("CUTTER") || c === "EPTR_CUTTER") return "cutter error";
  if (c.includes("MECHANICAL") || c.includes("AUTOMATICAL") || c === "EPTR_MECHANICAL") {
    return "mechanical error";
  }
  if (c.includes("TIMEOUT") || c.includes("BADPORT") || c.includes("OFFLINE")) return "printer offline";
  if (c === "EX_SPOOLER") return "spooler full";
  return `device code ${code}`;
}

export function formatLastError(code: string): string {
  return `${classifyPrinterCode(code)} [${code || "none"}]`;
}
