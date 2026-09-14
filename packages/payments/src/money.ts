// SPRINT-4 / SPRINT-17: money boundary — this module is the only place integer cents are
// converted to/from NMI's decimal-dollar wire format ("x.xx").
//
// The conversion is deliberately string-based in BOTH directions. `cents / 100` and
// `parseFloat(dollars) * 100` both route the value through a binary float, where values like
// 20.15 are not representable and round the wrong way often enough to matter on a money path.

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertPositiveIntegerCents(amountCents: number, label: string): void {
  if (!Number.isInteger(amountCents)) {
    throw new MoneyError(`${label} must be an integer number of cents, got ${amountCents}`);
  }
  if (amountCents <= 0) {
    throw new MoneyError(`${label} must be a positive number of cents, got ${amountCents}`);
  }
}

/**
 * Convert validated integer cents into NMI's `amount` format: dollars with exactly two
 * decimal places. USD only — the gateway account is single-currency.
 */
export function toGatewayAmount(amountCents: number, label = "amountCents"): string {
  assertPositiveIntegerCents(amountCents, label);
  const dollars = Math.trunc(amountCents / 100);
  const remainder = amountCents % 100;
  return `${dollars}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Convert an NMI decimal-dollar amount back to integer cents. Missing, malformed, or
 * sub-cent values are rejected rather than silently rounded.
 *
 * The MAGNITUDE is returned. NMI reports a reversal's action amount as a negative number
 * ("-12.34") because it is signed relative to the merchant's balance, but every amount our
 * callers hold — `refundedCents`, `totalCents` — is an unsigned quantity, and the direction
 * is already carried by the operation. Returning the sign here would land a negative refund
 * total in the database.
 */
export function fromGatewayAmount(amount: string | undefined | null): number {
  if (amount === undefined || amount === null || amount.trim() === "") {
    throw new MoneyError("Gateway response is missing a money amount");
  }
  const raw = amount.trim();
  const match = /^-?(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) {
    throw new MoneyError(`Gateway money amount is not a valid USD amount: ${raw}`);
  }
  const dollars = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = dollars * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new MoneyError(`Gateway money amount out of range: ${raw}`);
  }
  return cents;
}
