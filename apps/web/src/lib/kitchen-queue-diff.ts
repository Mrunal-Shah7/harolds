// SPRINT-6: client-side change detection — a new ticket vs an already-shown one.
export function appearedOrderIds(previousIds: readonly string[], nextIds: readonly string[]): string[] {
  const seen = new Set(previousIds);
  return nextIds.filter((id) => !seen.has(id));
}

export function disappearedOrderIds(previousIds: readonly string[], nextIds: readonly string[]): string[] {
  const next = new Set(nextIds);
  return previousIds.filter((id) => !next.has(id));
}
