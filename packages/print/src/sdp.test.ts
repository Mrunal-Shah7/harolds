// SPRINT-5: SDP form-body + completion XML parsing
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyPrinterCode, formatLastError, parsePrintCompletion, parseSdpFormBody } from "./sdp";

describe("parseSdpFormBody", () => {
  it("reads a GetRequest poll", () => {
    const parsed = parseSdpFormBody("ConnectionType=GetRequest&ID=XBVN044247");
    assert.equal(parsed.connectionType, "GetRequest");
    assert.equal(parsed.printerId, "XBVN044247");
    assert.equal(parsed.responseXml, null);
  });

  it("reads TM-m30III Name= when ID is empty", () => {
    const parsed = parseSdpFormBody("ConnectionType=GetRequest&ID=&Name=XBVN044247");
    assert.equal(parsed.connectionType, "GetRequest");
    assert.equal(parsed.printerId, "XBVN044247");
  });

  it("reads a SetResponse with ResponseFile", () => {
    const xml = `<PrintResponseInfo Version="2.00"><ePOSPrint><Parameter><printjobid>job1</printjobid></Parameter><PrintResponse><response success="true" code="" status="0"/></PrintResponse></ePOSPrint></PrintResponseInfo>`;
    const parsed = parseSdpFormBody(
      `ConnectionType=SetResponse&ID=XBVN044247&ResponseFile=${encodeURIComponent(xml)}`,
    );
    assert.equal(parsed.connectionType, "SetResponse");
    assert.ok(parsed.responseXml?.includes("job1"));
  });
});

describe("parsePrintCompletion", () => {
  it("reads success", () => {
    const xml = `<PrintResponseInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><printjobid>abc</printjobid></Parameter><PrintResponse><response success="true" code="" status="1" battery="0"/></PrintResponse></ePOSPrint></PrintResponseInfo>`;
    const r = parsePrintCompletion(xml);
    assert.equal(r.printJobId, "abc");
    assert.equal(r.success, true);
  });

  it("reads a cover-open failure verbatim", () => {
    const xml = `<response success="false" code="EPTR_COVER_OPEN" status="1"/>`;
    const r = parsePrintCompletion(xml);
    assert.equal(r.success, false);
    assert.equal(r.code, "EPTR_COVER_OPEN");
    assert.equal(classifyPrinterCode(r.code), "cover open");
    assert.match(formatLastError(r.code), /cover open \[EPTR_COVER_OPEN\]/);
  });

  it("classifies out of paper and mechanical errors", () => {
    assert.equal(classifyPrinterCode("EPTR_REC_EMPTY"), "out of paper");
    assert.equal(classifyPrinterCode("EPTR_MECHANICAL"), "mechanical error");
    assert.equal(classifyPrinterCode("EX_TIMEOUT"), "printer offline");
  });
});
