// SPRINT-6: persist the raw session token across kiosk reloads; never the PIN.
const TOKEN_KEY = "harolds.kitchen.sessionToken";
const AUDIO_KEY = "harolds.kitchen.audioUnlocked";

export function readSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeSessionToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export function readAudioUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(AUDIO_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAudioUnlocked(): void {
  try {
    window.sessionStorage.setItem(AUDIO_KEY, "1");
  } catch {
    /* private mode */
  }
}
