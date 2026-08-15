// SPRINT-5: @harolds/print — ticket model, layout, ePOS-Print XML, Server Direct Print envelope
export type {
  TicketAlign,
  TicketWeight,
  TicketSize,
  TicketRole,
  TicketLine,
  TicketKind,
  TicketModel,
  TicketModifierInput,
  TicketLineInput,
  TicketOrderInput,
} from "./ticket-model";
export { TICKET_COLUMNS } from "./ticket-model";

export { foldToPrintableAscii, escapeXml, preparePrintText } from "./encoding";
export { buildKitchenTicket, buildCounterReceipt, renderPlainText } from "./layout";
export { renderEposPrintXml, withReprintBanner, documentHasCut } from "./epos-xml";
export {
  wrapPrintRequest,
  parseSdpFormBody,
  parsePrintCompletion,
  classifyPrinterCode,
  formatLastError,
} from "./sdp";
export type { SdpIncoming, SdpConnectionType, PrintCompletionReport } from "./sdp";
