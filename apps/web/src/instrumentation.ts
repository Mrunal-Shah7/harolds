// SPRINT-5 / SPRINT-6 / SPRINT-7 / SPRINT-9: start sweepers and the job worker on the Node runtime only.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE) return;
  const { registerNode } = await import("./instrumentation.node");
  await registerNode();
}
