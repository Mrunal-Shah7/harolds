// SPRINT-6: Web Audio beeps — unlocked by a deliberate tap (Android Chrome autoplay).
let ctx: AudioContext | null = null;

export function isAudioUnlocked(): boolean {
  return ctx !== null && ctx.state === "running";
}

export async function unlockKitchenAudio(): Promise<boolean> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  const buffer = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start(0);
  return ctx.state === "running";
}

function tone(freq: number, durationMs: number, gain = 0.12): void {
  if (!ctx || ctx.state !== "running") return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ctx.destination);
  const now = ctx.currentTime;
  osc.start(now);
  g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.stop(now + durationMs / 1000);
}

export function playNewTicketChime(): void {
  tone(880, 120, 0.08);
}

export function playUnackedAlert(): void {
  tone(660, 180, 0.14);
  window.setTimeout(() => tone(520, 220, 0.14), 200);
}
