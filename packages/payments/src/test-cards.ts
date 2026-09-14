// SPRINT-4 / SPRINT-17: NMI sandbox test values.
//
// These are NMI-documented fake card numbers — never real card data — safe to commit and
// reference from tests. Source: NMI support, "Test Cards", and the NMI testing guide.
// https://support.nmi.com/hc/en-gb/articles/115002375583-Test-Cards
//
// Unlike Square, NMI has no per-outcome payment nonce. The sandbox decides approval from the
// AMOUNT, not the card: any amount of $1.00 or more approves, and anything under $1.00 is
// declined. So there is no "declined card number" to export — use TEST_AMOUNT_DECLINE_CENTS.

/** Test card numbers (all pass a Luhn check; none are issued). */
export const TEST_CARD_VISA = "4111111111111111";
export const TEST_CARD_MASTERCARD = "5431111111111111";
export const TEST_CARD_DISCOVER = "6011601160116611";
export const TEST_CARD_AMEX = "341111111111111";

/** Expiry accepted by the sandbox for every test card, in MMYY form. */
export const TEST_CARD_EXPIRY = "1029";

/** CVV accepted by the sandbox. Amex test cards take a four-digit code. */
export const TEST_CARD_CVV = "999";
export const TEST_CARD_CVV_AMEX = "9997";

/** ACH sandbox values, for parity with the card set. */
export const TEST_ACH_ACCOUNT_NUMBER = "123123123";
export const TEST_ACH_ROUTING_NUMBER = "123123123";

/**
 * Amount triggers. The NMI sandbox approves any sale of $1.00 or more and declines anything
 * below it, which is how decline paths are exercised without a dedicated bad-card number.
 */
export const TEST_AMOUNT_APPROVE_CENTS = 100;
export const TEST_AMOUNT_DECLINE_CENTS = 99;

/** Billing postal code accepted by the sandbox when AVS is enabled on the account. */
export const TEST_BILLING_POSTAL_CODE = "60453";
