// SPRINT-3: money primitives — all arithmetic is integer cents; one half-up rounding rule.
/**
 * Rounding rule: **half-up to the nearest cent**.
 * For positive values: floor(n + 0.5). Chosen because it matches hand-calculator /
 * register expectation on a single receipt (unlike banker's rounding).
 * Implemented without floating point: given dividend D and divisor V (>0),
 * half-up quotient = floor((D + floor(V/2)) / V) for non-negative D.
 */

/** Absolute upper bound on any single monetary value (cents). ~$100,000. */
export const MAX_MONEY_CENTS = 10_000_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of cents, got ${value}`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} must be non-negative, got ${value}`);
  }
}

function assertWithinBound(value: number, label: string): void {
  if (value > MAX_MONEY_CENTS) {
    throw new MoneyError(
      `${label} ${value} exceeds maximum allowed monetary value ${MAX_MONEY_CENTS} cents`,
    );
  }
}

/**
 * Half-up division of non-negative integers: round(dividend / divisor).
 * No floating point.
 */
export function halfUpDivide(dividend: number, divisor: number): number {
  assertNonNegativeInt(dividend, "dividend");
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new MoneyError(`divisor must be a positive integer, got ${divisor}`);
  }
  // floor((dividend + floor(divisor/2)) / divisor)
  return Math.floor((dividend + Math.floor(divisor / 2)) / divisor);
}

/**
 * Apply a basis-point rate to an amount in cents.
 * rateBps = 1010 means 10.10%. Result = round_half_up(amount * rateBps / 10000).
 */
export function applyBasisPoints(amountCents: number, rateBps: number): number {
  assertNonNegativeInt(amountCents, "amountCents");
  assertWithinBound(amountCents, "amountCents");
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new MoneyError(`rateBps must be a non-negative integer, got ${rateBps}`);
  }
  if (amountCents === 0 || rateBps === 0) return 0;

  // amount * rateBps may be large — use BigInt for the product, then half-up divide by 10000
  const product = BigInt(amountCents) * BigInt(rateBps);
  const divisor = 10000n;
  const half = divisor / 2n;
  const result = Number((product + half) / divisor);
  assertWithinBound(result, "applyBasisPoints result");
  return result;
}

/** Sum a list of cent amounts. Order-independent. */
export function sumCents(amounts: readonly number[]): number {
  let total = 0;
  for (const a of amounts) {
    assertNonNegativeInt(a, "summand");
    total += a;
    assertWithinBound(total, "sumCents running total");
  }
  return total;
}

/** Multiply unit price by quantity. Exact; no rounding. */
export function multiplyCents(unitCents: number, quantity: number): number {
  assertNonNegativeInt(unitCents, "unitCents");
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`quantity must be a non-negative integer, got ${quantity}`);
  }
  assertWithinBound(unitCents, "unitCents");
  const product = unitCents * quantity;
  if (!Number.isSafeInteger(product)) {
    throw new MoneyError(`multiplyCents overflow: ${unitCents} × ${quantity}`);
  }
  assertWithinBound(product, "multiplyCents result");
  return product;
}

/** Format cents for display (tickets/admin). API always returns the integer. */
export function formatCents(cents: number): string {
  assertNonNegativeInt(cents, "cents");
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  return `$${dollars}.${rem.toString().padStart(2, "0")}`;
}
