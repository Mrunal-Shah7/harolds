// SPRINT-12: sweep unreferenced menu images after the retention grace period.
import { emitLog } from "@harolds/config";
import { prisma } from "@harolds/db";
import { sweepUnreferencedImages, hashFromImageUrl } from "@/lib/media/storage";

const INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export function startImageSweeper(): void {
  const tick = async () => {
    try {
      const items = await prisma.menuItem.findMany({
        where: { imageUrl: { not: null } },
        select: { imageUrl: true },
      });
      const referenced = new Set<string>();
      for (const item of items) {
        const h = hashFromImageUrl(item.imageUrl);
        if (h) referenced.add(h);
      }
      const removed = await sweepUnreferencedImages(referenced);
      if (removed > 0) {
        emitLog("info", "media.sweep", { removed }, { scope: "media" });
      }
    } catch (err) {
      emitLog(
        "warn",
        "media.sweep_failed",
        { error: err instanceof Error ? err.message : "unknown" },
        { scope: "media" },
      );
    }
  };
  void tick();
  setInterval(() => void tick(), INTERVAL_MS);
  emitLog("info", "media.sweeper_started", {}, { scope: "media" });
}
