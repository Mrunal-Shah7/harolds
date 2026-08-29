// SPRINT-12: public Square identifiers for the Web Payments SDK — build-time and start-time checks.
/**
 * Application ID and Location ID are not secrets (the access token is). The browser SDK still
 * needs them inlined at build time via NEXT_PUBLIC_*. A runtime-only server env produces a
 * bundle that renders "Payments are not configured yet" forever.
 */

export type PublicSquareEnv = {
  NEXT_PUBLIC_SQUARE_APPLICATION_ID?: string;
  NEXT_PUBLIC_SQUARE_LOCATION_ID?: string;
  NEXT_PUBLIC_SQUARE_ENVIRONMENT?: string;
  [key: string]: string | undefined;
};

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/** Names every missing public Square identifier. Empty when all three are set. */
export function missingPublicSquareIdentifiers(env: PublicSquareEnv): string[] {
  const missing: string[] = [];
  if (!present(env.NEXT_PUBLIC_SQUARE_APPLICATION_ID)) {
    missing.push(
      "NEXT_PUBLIC_SQUARE_APPLICATION_ID: required at build time for the Square Web Payments SDK",
    );
  }
  if (!present(env.NEXT_PUBLIC_SQUARE_LOCATION_ID)) {
    missing.push(
      "NEXT_PUBLIC_SQUARE_LOCATION_ID: required at build time for the Square Web Payments SDK",
    );
  }
  if (!present(env.NEXT_PUBLIC_SQUARE_ENVIRONMENT)) {
    missing.push(
      "NEXT_PUBLIC_SQUARE_ENVIRONMENT: required at build time (sandbox | production)",
    );
  } else {
    const envName = env.NEXT_PUBLIC_SQUARE_ENVIRONMENT!.trim();
    if (envName !== "sandbox" && envName !== "production") {
      missing.push(
        `NEXT_PUBLIC_SQUARE_ENVIRONMENT: must be sandbox or production (got "${envName}")`,
      );
    }
  }
  return missing;
}

/** Throws with a build-failing message that names every absent public Square variable. */
export function assertPublicSquareIdentifiersForBuild(env: PublicSquareEnv): void {
  const missing = missingPublicSquareIdentifiers(env);
  if (missing.length === 0) return;
  throw new Error(
    [
      "Build refused: Square Web Payments SDK public identifiers are missing or invalid.",
      "Set these in the root .env (or CI env) before building — they are inlined into the client bundle.",
      ...missing.map((line) => `  - ${line}`),
      "",
      "See .env.example (NEXT_PUBLIC_SQUARE_*). Keep them equal to SQUARE_APPLICATION_ID / SQUARE_LOCATION_ID / SQUARE_ENVIRONMENT.",
    ].join("\n"),
  );
}

export function publicSquareIdsPresentAtBuild(env: PublicSquareEnv = process.env): boolean {
  return missingPublicSquareIdentifiers(env).length === 0;
}
