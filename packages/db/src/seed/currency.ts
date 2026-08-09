// SPRINT-1: dollar-to-cents conversion without floating-point rounding error
/**
 * Convert a USD amount (string or number from the workbook) to integer US cents.
 *
 * DO NOT multiply a float by 100 and round — values like 8.79 are not exactly
 * representable in binary floating point and produce off-by-one-cent errors.
 *
 * Strategy: parse as a decimal string, split on the point, and assemble cents
 * from whole dollars * 100 + fractional digits (padded/truncated to 2).
 */
export function dollarsToCents(value: string | number): number {
  const raw = typeof value === "number" ? value.toString() : value;
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");

  if (!cleaned || cleaned === "-") {
    throw new Error(`Cannot parse money value: "${value}"`);
  }

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;

  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    throw new Error(`Cannot parse money value: "${value}"`);
  }

  const [wholePart, fracPart = ""] = unsigned.split(".");
  const whole = Number.parseInt(wholePart ?? "0", 10);
  const frac = (fracPart + "00").slice(0, 2);
  const cents = whole * 100 + Number.parseInt(frac, 10);

  if (!Number.isFinite(cents)) {
    throw new Error(`Cannot parse money value: "${value}"`);
  }

  return negative ? -cents : cents;
}
