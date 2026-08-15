// SPRINT-8: menu mutations for the back office — every write invalidates the Sprint 2 cache.
import { randomBytes } from "node:crypto";
import { prisma } from "./client";
import { invalidateMenuCache } from "./menu-cache";
import { dollarsToCents } from "./seed/currency";
import { recordAdminAudit } from "./admin-audit";

export class AdminValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminValidationError";
  }
}

export function parseCurrencyInput(raw: string): number {
  const cents = dollarsToCents(raw);
  if (cents < 0) {
    throw new AdminValidationError("Price cannot be negative.");
  }
  return cents;
}

function slugify(displayName: string): string {
  return displayName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function newWorkbookId(prefix: string): string {
  return `admin_${prefix}_${randomBytes(6).toString("hex")}`;
}

async function uniqueSlug(categoryId: string, base: string, exceptItemId?: string): Promise<string> {
  let slug = base || "item";
  let n = 2;
  for (;;) {
    const existing = await prisma.menuItem.findFirst({
      where: {
        categoryId,
        slug,
        ...(exceptItemId ? { id: { not: exceptItemId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${n}`;
    n += 1;
  }
}

async function uniqueCategorySlug(base: string, exceptId?: string): Promise<string> {
  let slug = base || "category";
  let n = 2;
  for (;;) {
    const existing = await prisma.category.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${n}`;
    n += 1;
  }
}

export async function listAdminCategories() {
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: true } } },
  });
}

export async function getCategoryWithActiveItemCount(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { items: { where: { isActive: true } } } } },
  });
  if (!category) return null;
  return { ...category, activeItemCount: category._count.items };
}

export async function createCategory(args: {
  name: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
  userId: string;
}) {
  const name = args.name.trim();
  if (!name) throw new AdminValidationError("Name is required.");
  const slug = await uniqueCategorySlug(args.slug?.trim() ? slugify(args.slug) : slugify(name));
  const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.category.create({
    data: {
      workbookId: newWorkbookId("cat"),
      name,
      slug,
      description: args.description?.trim() || null,
      sortOrder: args.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 10,
      isActive: true,
    },
  });
  invalidateMenuCache();
  await recordAdminAudit({
    userId: args.userId,
    action: "CATEGORY_CREATE",
    entityType: "Category",
    entityId: row.id,
    summary: `Created category ${name}`,
  });
  return row;
}

export async function updateCategory(
  id: string,
  patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    confirmDeactivate?: boolean;
  },
  userId: string,
) {
  const current = await getCategoryWithActiveItemCount(id);
  if (!current) throw new AdminValidationError("Category not found.");

  if (patch.isActive === false && current.isActive && current.activeItemCount > 0 && !patch.confirmDeactivate) {
    throw new AdminValidationError(
      `This category has ${current.activeItemCount} active item(s). Confirm deactivation to hide them from the storefront.`,
    );
  }

  const data: {
    name?: string;
    slug?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new AdminValidationError("Name is required.");
    data.name = name;
  }
  if (patch.slug !== undefined) {
    const slug = await uniqueCategorySlug(slugify(patch.slug.trim()), id);
    data.slug = slug;
  }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;

  const row = await prisma.category.update({ where: { id }, data });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "CATEGORY_UPDATE",
    entityType: "Category",
    entityId: id,
    summary: `Updated category ${row.name}`,
  });
  return row;
}

export type AdminItemFilters = {
  categoryId?: string;
  isActive?: boolean;
  isSoldOut?: boolean;
  isUnverifiedPrice?: boolean;
  q?: string;
};

export async function listAdminItems(filters: AdminItemFilters = {}) {
  return prisma.menuItem.findMany({
    where: {
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
      ...(filters.isSoldOut === undefined ? {} : { isSoldOut: filters.isSoldOut }),
      ...(filters.isUnverifiedPrice === undefined ? {} : { isUnverifiedPrice: filters.isUnverifiedPrice }),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { boardLabel: { contains: filters.q, mode: "insensitive" } },
              { slug: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    include: { category: { select: { id: true, name: true, slug: true } } },
  });
}

export async function getAdminItem(id: string) {
  return prisma.menuItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      modifierGroups: {
        orderBy: { sortOrder: "asc" },
        include: { group: { select: { id: true, name: true, prompt: true, isProvisional: true } } },
      },
    },
  });
}

export async function createItem(
  args: {
    name: string;
    categoryId: string;
    basePriceCents: number;
    boardLabel?: string | null;
    description?: string | null;
    slug?: string;
    sortOrder?: number;
    imageUrl?: string | null;
  },
  userId: string,
) {
  const name = args.name.trim();
  if (!name) throw new AdminValidationError("Name is required.");
  if (!Number.isInteger(args.basePriceCents) || args.basePriceCents <= 0) {
    throw new AdminValidationError("Price must be a positive amount.");
  }
  const slug = await uniqueSlug(args.categoryId, args.slug?.trim() ? slugify(args.slug) : slugify(name));
  const maxSort = await prisma.menuItem.aggregate({
    where: { categoryId: args.categoryId },
    _max: { sortOrder: true },
  });
  const row = await prisma.menuItem.create({
    data: {
      workbookId: newWorkbookId("itm"),
      categoryId: args.categoryId,
      name,
      slug,
      boardLabel: args.boardLabel?.trim() || null,
      description: args.description?.trim() || null,
      basePriceCents: args.basePriceCents,
      imageUrl: args.imageUrl?.trim() || null,
      sortOrder: args.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 10,
      isActive: true,
    },
  });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "ITEM_CREATE",
    entityType: "MenuItem",
    entityId: row.id,
    summary: `Created item ${name} at ${args.basePriceCents} cents`,
  });
  return row;
}

export async function updateItem(
  id: string,
  patch: {
    name?: string;
    boardLabel?: string | null;
    description?: string | null;
    basePriceCents?: number;
    categoryId?: string;
    slug?: string;
    sortOrder?: number;
    isActive?: boolean;
    isSoldOut?: boolean;
    isFeatured?: boolean;
    featuredSortOrder?: number | null;
    isMostOrdered?: boolean;
    mostOrderedSortOrder?: number | null;
    imageUrl?: string | null;
  },
  userId: string,
) {
  const current = await prisma.menuItem.findUnique({ where: { id } });
  if (!current) throw new AdminValidationError("Item not found.");

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new AdminValidationError("Name is required.");
    data.name = name;
  }
  if (patch.boardLabel !== undefined) data.boardLabel = patch.boardLabel?.trim() || null;
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.basePriceCents !== undefined) {
    if (!Number.isInteger(patch.basePriceCents) || patch.basePriceCents <= 0) {
      throw new AdminValidationError("Price must be a positive amount.");
    }
    data.basePriceCents = patch.basePriceCents;
    if (patch.basePriceCents !== current.basePriceCents && current.isUnverifiedPrice) {
      data.isUnverifiedPrice = false;
    }
  }
  const nextCategory = patch.categoryId ?? current.categoryId;
  if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
  if (patch.slug !== undefined || patch.categoryId !== undefined) {
    const base = patch.slug?.trim() ? slugify(patch.slug) : current.slug;
    data.slug = await uniqueSlug(nextCategory, base, id);
  }
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.isSoldOut !== undefined) data.isSoldOut = patch.isSoldOut;
  if (patch.isFeatured !== undefined) data.isFeatured = patch.isFeatured;
  if (patch.featuredSortOrder !== undefined) data.featuredSortOrder = patch.featuredSortOrder;
  if (patch.isMostOrdered !== undefined) data.isMostOrdered = patch.isMostOrdered;
  if (patch.mostOrderedSortOrder !== undefined) data.mostOrderedSortOrder = patch.mostOrderedSortOrder;
  if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl?.trim() || null;

  const row = await prisma.menuItem.update({ where: { id }, data });
  invalidateMenuCache();
  if (patch.basePriceCents !== undefined && patch.basePriceCents !== current.basePriceCents) {
    await recordAdminAudit({
      userId,
      action: "ITEM_PRICE_CHANGE",
      entityType: "MenuItem",
      entityId: id,
      summary: `Price ${current.basePriceCents} → ${patch.basePriceCents} cents on ${row.name}`,
    });
  } else {
    await recordAdminAudit({
      userId,
      action: "ITEM_UPDATE",
      entityType: "MenuItem",
      entityId: id,
      summary: `Updated item ${row.name}`,
    });
  }
  return row;
}

export async function setItemSoldOut(id: string, isSoldOut: boolean, userId: string) {
  const row = await prisma.menuItem.update({ where: { id }, data: { isSoldOut } });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: isSoldOut ? "ITEM_SOLD_OUT" : "ITEM_AVAILABLE",
    entityType: "MenuItem",
    entityId: id,
    summary: `${row.name} ${isSoldOut ? "marked sold out" : "marked available"}`,
  });
  return row;
}

/** Clears every sold-out flag and invalidates the menu cache once. */
export async function clearAllSoldOut(userId: string): Promise<number> {
  const result = await prisma.menuItem.updateMany({
    where: { isSoldOut: true },
    data: { isSoldOut: false },
  });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "ITEM_CLEAR_SOLD_OUT",
    entityType: "MenuItem",
    entityId: null,
    summary: `Cleared sold-out on ${result.count} item(s)`,
  });
  return result.count;
}

export async function setCuration(
  kind: "featured" | "mostOrdered",
  itemIds: string[],
  userId: string,
) {
  const unique = [...new Set(itemIds)];
  if (kind === "featured") {
    await prisma.$transaction(async (tx) => {
      await tx.menuItem.updateMany({ data: { isFeatured: false, featuredSortOrder: null } });
      for (let i = 0; i < unique.length; i += 1) {
        await tx.menuItem.update({
          where: { id: unique[i] },
          data: { isFeatured: true, featuredSortOrder: i },
        });
      }
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.menuItem.updateMany({ data: { isMostOrdered: false, mostOrderedSortOrder: null } });
      for (let i = 0; i < unique.length; i += 1) {
        await tx.menuItem.update({
          where: { id: unique[i] },
          data: { isMostOrdered: true, mostOrderedSortOrder: i },
        });
      }
    });
  }
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: kind === "featured" ? "CURATION_FEATURED" : "CURATION_MOST_ORDERED",
    entityType: "MenuItem",
    entityId: null,
    summary: `Set ${kind} list (${unique.length} item(s))`,
  });
}

export async function listAdminModifierGroups() {
  return prisma.modifierGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { options: true, items: true } },
      options: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function getAdminModifierGroup(id: string) {
  return prisma.modifierGroup.findUnique({
    where: { id },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: { item: { select: { id: true, name: true, boardLabel: true, isActive: true } } },
      },
    },
  });
}

function assertSelectCounts(minSelect: number, maxSelect: number) {
  if (!Number.isInteger(minSelect) || !Number.isInteger(maxSelect) || minSelect < 0 || maxSelect < 0) {
    throw new AdminValidationError("Selection counts must be non-negative integers.");
  }
  if (minSelect > maxSelect) {
    throw new AdminValidationError("Minimum selections cannot be greater than maximum selections.");
  }
}

export async function createModifierGroup(
  args: {
    name: string;
    prompt: string;
    isRequired?: boolean;
    minSelect: number;
    maxSelect: number;
    sortOrder?: number;
  },
  userId: string,
) {
  const name = args.name.trim();
  const prompt = args.prompt.trim();
  if (!name || !prompt) throw new AdminValidationError("Name and customer prompt are required.");
  assertSelectCounts(args.minSelect, args.maxSelect);
  const maxSort = await prisma.modifierGroup.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.modifierGroup.create({
    data: {
      workbookId: newWorkbookId("mg"),
      name,
      prompt,
      isRequired: args.isRequired ?? args.minSelect > 0,
      minSelect: args.minSelect,
      maxSelect: args.maxSelect,
      sortOrder: args.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 10,
      isActive: true,
      isProvisional: false,
    },
  });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "MODIFIER_GROUP_CREATE",
    entityType: "ModifierGroup",
    entityId: row.id,
    summary: `Created modifier group ${name}`,
  });
  return row;
}

export async function updateModifierGroup(
  id: string,
  patch: {
    name?: string;
    prompt?: string;
    isRequired?: boolean;
    minSelect?: number;
    maxSelect?: number;
    sortOrder?: number;
    isActive?: boolean;
  },
  userId: string,
) {
  const current = await prisma.modifierGroup.findUnique({ where: { id } });
  if (!current) throw new AdminValidationError("Modifier group not found.");
  const minSelect = patch.minSelect ?? current.minSelect;
  const maxSelect = patch.maxSelect ?? current.maxSelect;
  assertSelectCounts(minSelect, maxSelect);

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new AdminValidationError("Name is required.");
    data.name = name;
  }
  if (patch.prompt !== undefined) {
    const prompt = patch.prompt.trim();
    if (!prompt) throw new AdminValidationError("Customer prompt is required.");
    data.prompt = prompt;
  }
  if (patch.isRequired !== undefined) data.isRequired = patch.isRequired;
  if (patch.minSelect !== undefined) data.minSelect = patch.minSelect;
  if (patch.maxSelect !== undefined) data.maxSelect = patch.maxSelect;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;

  const corrects =
    patch.name !== undefined ||
    patch.prompt !== undefined ||
    patch.minSelect !== undefined ||
    patch.maxSelect !== undefined ||
    patch.isRequired !== undefined;
  if (corrects && current.isProvisional) {
    data.isProvisional = false;
  }

  const row = await prisma.modifierGroup.update({ where: { id }, data });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "MODIFIER_GROUP_UPDATE",
    entityType: "ModifierGroup",
    entityId: id,
    summary: `Updated modifier group ${row.name}`,
  });
  return row;
}

export async function createModifierOption(
  groupId: string,
  args: {
    name: string;
    priceDeltaCents: number;
    sortOrder?: number;
    isDefaultSelected?: boolean;
  },
  userId: string,
) {
  const name = args.name.trim();
  if (!name) throw new AdminValidationError("Option name is required.");
  if (!Number.isInteger(args.priceDeltaCents) || args.priceDeltaCents < 0) {
    throw new AdminValidationError("Price delta must be zero or a positive amount.");
  }
  const maxSort = await prisma.modifierOption.aggregate({
    where: { groupId },
    _max: { sortOrder: true },
  });
  const row = await prisma.modifierOption.create({
    data: {
      workbookId: newWorkbookId("mo"),
      groupId,
      name,
      priceDeltaCents: args.priceDeltaCents,
      sortOrder: args.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 10,
      isDefaultSelected: args.isDefaultSelected ?? false,
    },
  });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "MODIFIER_OPTION_CREATE",
    entityType: "ModifierOption",
    entityId: row.id,
    summary: `Created option ${name} on group ${groupId}`,
  });
  return row;
}

export async function updateModifierOption(
  id: string,
  patch: {
    name?: string;
    priceDeltaCents?: number;
    sortOrder?: number;
    isActive?: boolean;
    isSoldOut?: boolean;
    isDefaultSelected?: boolean;
  },
  userId: string,
) {
  if (patch.priceDeltaCents !== undefined) {
    if (!Number.isInteger(patch.priceDeltaCents) || patch.priceDeltaCents < 0) {
      throw new AdminValidationError("Price delta must be zero or a positive amount.");
    }
  }
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new AdminValidationError("Option name is required.");
    data.name = name;
  }
  if (patch.priceDeltaCents !== undefined) data.priceDeltaCents = patch.priceDeltaCents;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.isSoldOut !== undefined) data.isSoldOut = patch.isSoldOut;
  if (patch.isDefaultSelected !== undefined) data.isDefaultSelected = patch.isDefaultSelected;
  const row = await prisma.modifierOption.update({ where: { id }, data });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "MODIFIER_OPTION_UPDATE",
    entityType: "ModifierOption",
    entityId: id,
    summary: `Updated option ${row.name}`,
  });
  return row;
}

export async function replaceItemBindings(
  itemId: string,
  bindings: Array<{ groupId: string; sortOrder: number }>,
  userId: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.itemModifierGroup.deleteMany({ where: { itemId } });
    if (bindings.length > 0) {
      await tx.itemModifierGroup.createMany({
        data: bindings.map((b) => ({
          itemId,
          groupId: b.groupId,
          sortOrder: b.sortOrder,
        })),
      });
    }
  });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "ITEM_BINDINGS",
    entityType: "MenuItem",
    entityId: itemId,
    summary: `Set ${bindings.length} modifier group(s) on item`,
  });
}

export async function replaceGroupBindings(
  groupId: string,
  bindings: Array<{ itemId: string; sortOrder: number }>,
  userId: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.itemModifierGroup.deleteMany({ where: { groupId } });
    if (bindings.length > 0) {
      await tx.itemModifierGroup.createMany({
        data: bindings.map((b) => ({
          groupId,
          itemId: b.itemId,
          sortOrder: b.sortOrder,
        })),
      });
    }
  });
  invalidateMenuCache();
  await recordAdminAudit({
    userId,
    action: "GROUP_BINDINGS",
    entityType: "ModifierGroup",
    entityId: groupId,
    summary: `Set ${bindings.length} item(s) offering this group`,
  });
}
