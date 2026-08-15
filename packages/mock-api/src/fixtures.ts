// SPRINT-2: load committed JSON fixtures — no DATABASE_URL / .env required
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CategoriesPayload,
  CuratedItemsPayload,
  FullMenu,
  MenuItemDetail,
  StoreStatus,
} from "@harolds/types";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function readJson<T>(fileName: string): T {
  const raw = readFileSync(path.join(fixturesDir, fileName), "utf8");
  return JSON.parse(raw) as T;
}

export type FixtureMeta = {
  generatedAt: string;
  notes: string[];
  edgeCases: Record<string, unknown>;
};

export const menuFixture: FullMenu = readJson("menu.json");
export const storeStatusFixture: StoreStatus = readJson("store-status.json");
export const categoriesFixture: CategoriesPayload = readJson("categories.json");
export const featuredFixture: CuratedItemsPayload = readJson("featured.json");
export const mostOrderedFixture: CuratedItemsPayload = readJson("most-ordered.json");
export const metaFixture: FixtureMeta = readJson("meta.json");
/** SPRINT-3: id → boardLabel for quote snapshots (not on public menu payloads). */
export const boardLabelsFixture: Record<string, string | null> = readJson("board-labels.json");
/** SPRINT-4: id → internal modifier group name for snapshots (not on public menu payloads). */
export const groupNamesFixture: Record<string, string> = readJson("group-names.json");

export function findItemById(id: string): MenuItemDetail | null {
  for (const category of menuFixture.categories) {
    const item = category.items.find((i) => i.id === id);
    if (item) {
      return {
        ...item,
        categoryId: category.id,
        categorySlug: category.slug,
      };
    }
  }
  return null;
}

export function findItemBySlugs(
  categorySlug: string,
  itemSlug: string,
): MenuItemDetail | null {
  const category = menuFixture.categories.find((c) => c.slug === categorySlug);
  if (!category) return null;
  const item = category.items.find((i) => i.slug === itemSlug);
  if (!item) return null;
  return {
    ...item,
    categoryId: category.id,
    categorySlug: category.slug,
  };
}

/** Deep-clone store status so per-request forceStore mutations stay isolated. */
export function cloneStoreStatus(): StoreStatus {
  return structuredClone(storeStatusFixture);
}
