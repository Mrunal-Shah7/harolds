// SPRINT-4: Square Sandbox test payment source IDs for the Payments API.
// These are Square-documented fake values — never real card data — safe to
// commit and reference from tests. Source: Square Developer docs,
// "Sandbox Payments" / "Test in the Sandbox" (Payments API source_id values).
// https://developer.squareup.com/docs/devtools/sandbox/payments

/** Successful outcomes. */
export const SANDBOX_SOURCE_ID_CARD_OK = "cnon:card-nonce-ok";
export const SANDBOX_SOURCE_ID_GIFT_CARD_OK = "cnon:gift-card-nonce-ok";
export const SANDBOX_SOURCE_ID_CASH = "CASH";
export const SANDBOX_SOURCE_ID_EXTERNAL = "EXTERNAL";
export const SANDBOX_SOURCE_ID_BANK_OK = "bnon:bank-nonce-ok";

/** Card-payment failure outcomes. */
export const SANDBOX_SOURCE_ID_CARD_DECLINED = "cnon:card-nonce-declined";
export const SANDBOX_SOURCE_ID_CARD_REJECTED_CVV = "cnon:card-nonce-rejected-cvv";
export const SANDBOX_SOURCE_ID_CARD_REJECTED_POSTAL_CODE = "cnon:card-nonce-rejected-postalcode";
export const SANDBOX_SOURCE_ID_CARD_REJECTED_EXPIRATION = "cnon:card-nonce-rejected-expiration";
export const SANDBOX_SOURCE_ID_CARD_ALREADY_USED = "cnon:card-nonce-already-used";

/** Gift-card failure outcomes. */
export const SANDBOX_SOURCE_ID_GIFT_CARD_INSUFFICIENT_FUNDS =
  "cnon:gift-card-nonce-insufficient-funds";
export const SANDBOX_SOURCE_ID_GIFT_CARD_INSUFFICIENT_PERMISSION =
  "cnon:gift-card-nonce-insufficient-permission";

/** Bank-payment failure outcomes. */
export const SANDBOX_SOURCE_ID_BANK_FAILURE = "bnon:bank-nonce-failure";
export const SANDBOX_SOURCE_ID_BANK_ACCOUNT_UNUSABLE = "bnon:bank-nonce-account-unusable";
export const SANDBOX_SOURCE_ID_BANK_INSUFFICIENT_FUNDS = "bnon:bank-nonce-insufficient-funds";
export const SANDBOX_SOURCE_ID_BANK_INVALID_ACCOUNT = "bnon:bank-nonce-invalid-account";
export const SANDBOX_SOURCE_ID_BANK_BUYER_REFUSED = "bnon:bank-nonce-buyer-refused-payment";

/**
 * Required billing postal code when using a Sandbox card test token with an
 * endpoint that validates `billing_address.postal_code` (e.g. CreateCard).
 */
export const SANDBOX_BILLING_POSTAL_CODE = "94103";
