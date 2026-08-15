// SPRINT-5: Server Direct Print HTTP handler — poll + completion on the device endpoint
import { BODY_LIMITS, emitLog, getPrinterConfig, isKnownPrinterSerial } from "@harolds/config";
import {
  claimNextPrintJob,
  recordPrintCompletion,
  touchPrinterHeartbeat,
} from "@harolds/db";
import {
  parsePrintCompletion,
  parseSdpFormBody,
  withReprintBanner,
  wrapPrintRequest,
} from "@harolds/print";
import { digestUnauthorizedHeaders, isSdpAuthenticated } from "./sdp-auth";
import { bindRequestId } from "./request-context";

const NO_CACHE: HeadersInit = {
  "Content-Type": "text/xml; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

function emptyXml(): Response {
  return new Response("", { status: 200, headers: { ...NO_CACHE, "Content-Length": "0" } });
}

function xmlBody(body: string): Response {
  return new Response(body, { status: 200, headers: NO_CACHE });
}

function unauthorized(): Response {
  return new Response("", { status: 401, headers: digestUnauthorizedHeaders() });
}

/**
 * Epson posts GetRequest (poll) and SetResponse (completion) to the same URL as
 * application/x-www-form-urlencoded. A dedicated /complete route shares this handler.
 */
export async function handleServerDirectPrint(request: Request): Promise<Response> {
  bindRequestId(request);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_LIMITS.printBytes) {
    return unauthorized();
  }
  const raw = await request.text();
  if (raw.length > BODY_LIMITS.printBytes) {
    return unauthorized();
  }
  const parsed = parseSdpFormBody(raw);
  const serial = parsed.printerId.trim();

  if (!isSdpAuthenticated(request)) {
    emitLog("warn", "print.unauthenticated", { connectionType: parsed.connectionType }, { scope: "print" });
    return unauthorized();
  }

  if (parsed.connectionType === "SetResponse" || parsed.responseXml) {
    return handleCompletion(parsed.responseXml ?? "");
  }

  if (!serial) {
    emitLog("debug", "print.poll_empty_id", {}, { scope: "print" });
    return emptyXml();
  }

  if (!isKnownPrinterSerial(serial)) {
    emitLog("debug", "print.poll_unknown_serial", {}, { scope: "print" });
    return emptyXml();
  }

  await touchPrinterHeartbeat(serial);
  const job = await claimNextPrintJob(serial);
  if (!job) {
    emitLog("debug", "print.poll_idle", {}, { scope: "print" });
    return emptyXml();
  }

  const payload = job.isReprint ? withReprintBanner(job.payload) : job.payload;
  const body = wrapPrintRequest({ printJobId: job.id, eposXml: payload });
  emitLog(
    "info",
    "print.dispatched",
    { jobId: job.id, target: job.target, reprint: job.isReprint },
    { scope: "print" },
  );
  return xmlBody(body);
}

async function handleCompletion(responseXml: string): Promise<Response> {
  const report = parsePrintCompletion(responseXml);
  if (!report.printJobId) {
    emitLog("warn", "print.completion_missing_id", {}, { scope: "print" });
    return emptyXml();
  }
  const result = await recordPrintCompletion({
    printJobId: report.printJobId,
    success: report.success,
    code: report.code,
  });
  emitLog(
    "info",
    "print.completion",
    { jobId: report.printJobId, outcome: result.outcome, success: report.success, code: report.code || "none" },
    { scope: "print" },
  );
  return emptyXml();
}

export function sdpPollIntervalNote(): string {
  const cfg = getPrinterConfig();
  return `SDP kitchen=${cfg.kitchenSerial} counter=${cfg.counterSerial}`;
}
