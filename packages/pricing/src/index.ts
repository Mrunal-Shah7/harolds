// SPRINT-3: public API of the pure pricing engine.
export {
  MAX_MONEY_CENTS,
  MoneyError,
  applyBasisPoints,
  formatCents,
  halfUpDivide,
  multiplyCents,
  sumCents,
} from "./money";

export type {
  MenuCatalog,
  ResolvedGroup,
  ResolvedItem,
  ResolvedOption,
} from "./menu-data";

export { parseCartRequest } from "./parse-cart";
export { validateCart } from "./validate";
export { priceLines } from "./price-lines";
export { computeTotals } from "./totals";
export type { TotalsConfig, TotalsFailure, TotalsSuccess } from "./totals";
export { evaluateOrderability } from "./orderability";
export type { OrderabilityInput, OrderabilityResult } from "./orderability";
export { quoteCart } from "./quote";
export type { QuoteInput, QuoteOk, QuoteErr, QuoteStoreContext } from "./quote";
export { toMenuCatalog } from "./catalog-builder";
