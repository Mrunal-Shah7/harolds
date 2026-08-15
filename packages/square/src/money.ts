// SPRINT-4: money boundary — this module is the only place integer cents are
// converted to/from Square's `Money` (bigint amount + currency) shape.

export class SquareMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SquareMoneyError";
  }
}

function assertPositiveIntegerCents(amountCents: number, label: string): void {
  if (!Number.isInteger(amountCents)) {
    throw new SquareMoneyError(`${label} must be an integer number of cents, got ${amountCents}`);
  }
  if (amountCents <= 0) {
    throw new SquareMoneyError(`${label} must be a positive number of cents, got ${amountCents}`);
  }
}

/** Convert validated integer cents into the Square SDK's Money shape (USD only). */
export function toSquareMoney(amountCents: number, label = "amountCents"): { amount: bigint; currency: "USD" } {
  assertPositiveIntegerCents(amountCents, label);
  return { amount: BigInt(amountCents), currency: "USD" };
}

/** Convert a Square Money value back to integer cents. Missing/negative amounts are rejected. */
export function fromSquareMoney(money: { amount?: bigint | null; currency?: string } | undefined): number {
  if (!money || money.amount === undefined || money.amount === null) {
    throw new SquareMoneyError("Square response is missing a money amount");
  }
  if (money.currency && money.currency !== "USD") {
    throw new SquareMoneyError(`unexpected currency in Square response: ${money.currency}`);
  }
  const cents = Number(money.amount);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new SquareMoneyError(`Square money amount out of range: ${money.amount}`);
  }
  return cents;
}
