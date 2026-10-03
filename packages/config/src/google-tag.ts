// Google tag (gtag.js) for the Google Ads account: the tag ID and every origin it needs in the CSP.
// Stated once, here — the storefront layout loads the tag and security.ts allows its hosts from
// the same values, so the two cannot drift apart.

export const GOOGLE_TAG_ID = "AW-18474666315";

export const GOOGLE_TAG_JS_URL = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`;

/**
 * The sources Google's CSP guide lists for a Google Ads tag (conversions and remarketing), per
 * directive. img-src needs nothing: the policy already allows any https: image, which covers the
 * tag's pixel requests.
 */
export const GOOGLE_TAG_CSP = {
  "script-src": [
    "https://www.googletagmanager.com",
    "https://www.googleadservices.com",
    "https://www.google.com",
    "https://googleads.g.doubleclick.net",
    "https://pagead2.googlesyndication.com",
  ],
  "frame-src": [
    "https://www.googletagmanager.com",
    "https://bid.g.doubleclick.net",
    "https://td.doubleclick.net",
  ],
  "connect-src": [
    "https://www.googletagmanager.com",
    "https://www.googleadservices.com",
    "https://www.google.com",
    "https://google.com",
    "https://googleads.g.doubleclick.net",
    "https://pagead2.googlesyndication.com",
  ],
} as const;
