// SPRINT-7: handler failure classes — permanent vs transient, mapped onto dead vs retry.
export class PermanentJobError extends Error {
  readonly permanent = true as const;
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export class TransientJobError extends Error {
  readonly permanent = false as const;
  constructor(message: string) {
    super(message);
    this.name = "TransientJobError";
  }
}

export function isPermanentJobError(err: unknown): err is PermanentJobError {
  return err instanceof PermanentJobError;
}
