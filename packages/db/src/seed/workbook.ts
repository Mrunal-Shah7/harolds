// SPRINT-1: reconciliation workbook reader — sheets/columns by name, not position
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dollarsToCents } from "./currency";

const require = createRequire(import.meta.url);
// xlsx is CommonJS; createRequire avoids broken ESM named/default interop.
const XLSX = require("xlsx") as typeof import("xlsx");
type WorkBook = import("xlsx").WorkBook;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default workbook path: repo root `harolds-menu-reconciliation.xlsx` */
export function defaultWorkbookPath(): string {
  return path.resolve(__dirname, "../../../../harolds-menu-reconciliation.xlsx");
}

export type CategoryRow = {
  category_id: string;
  display_name: string;
  sort_order: number;
  active: boolean;
  flag: string | null;
  notes: string | null;
};

export type ItemRow = {
  item_id: string;
  category_id: string;
  board_label: string | null;
  display_name: string;
  price_cents: number;
  flag: string | null;
  notes: string | null;
};

export type ModifierGroupRow = {
  group_id: string;
  customer_prompt: string;
  internal_name: string;
  required: boolean;
  min_select: number;
  max_select: number;
  sort_order: number;
  flag: string | null;
  notes: string | null;
};

export type ModifierOptionRow = {
  option_id: string;
  group_id: string;
  option_name: string;
  price_delta_cents: number;
  sort_order: number;
  default_selected: boolean;
  flag: string | null;
  notes: string | null;
};

export type ItemModifierGroupRow = {
  item_id: string;
  group_id: string;
  sort_order: number;
  flag: string | null;
  notes: string | null;
};

export type WorkbookData = {
  categories: CategoryRow[];
  items: ItemRow[];
  modifier_groups: ModifierGroupRow[];
  modifier_options: ModifierOptionRow[];
  item_modifier_groups: ItemModifierGroupRow[];
};

function cell(row: Record<string, unknown>, column: string, sheet: string, index: number): unknown {
  if (!(column in row)) {
    throw new Error(`[${sheet}] row ${index + 2}: missing column "${column}"`);
  }
  return row[column];
}

function requireString(
  row: Record<string, unknown>,
  column: string,
  sheet: string,
  index: number,
): string {
  const value = cell(row, column, sheet, index);
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error(`[${sheet}] row ${index + 2}: required cell "${column}" is empty`);
  }
  return String(value).trim();
}

function optionalString(row: Record<string, unknown>, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value).trim();
}

function parseBool(value: unknown, column: string, sheet: string, index: number): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "TRUE" || s === "1" || s === "YES") return true;
  if (s === "FALSE" || s === "0" || s === "NO" || s === "") return false;
  throw new Error(`[${sheet}] row ${index + 2}: column "${column}" is not a boolean: "${value}"`);
}

function parseIntField(
  value: unknown,
  column: string,
  sheet: string,
  index: number,
): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const s = String(value ?? "").trim();
  if (!/^-?\d+$/.test(s)) {
    throw new Error(`[${sheet}] row ${index + 2}: column "${column}" is not an integer: "${value}"`);
  }
  return Number.parseInt(s, 10);
}

function parseMoney(
  value: unknown,
  column: string,
  sheet: string,
  index: number,
): number {
  try {
    return dollarsToCents(value as string | number);
  } catch {
    throw new Error(
      `[${sheet}] row ${index + 2}: column "${column}" cannot be parsed as money: "${value}"`,
    );
  }
}

function assertUnique(
  ids: string[],
  sheet: string,
  column: string,
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`[${sheet}]: duplicate ${column} "${id}"`);
    }
    seen.add(id);
  }
}

function sheetRows(workbook: WorkBook, name: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Workbook is missing required sheet "${name}"`);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });
  // Stop at last row containing an identifier-like first key value; skip trailing blanks
  return rows.filter((row) => {
    const values = Object.values(row);
    return values.some((v) => v !== null && String(v).trim() !== "");
  });
}

export function readWorkbook(filePath: string = defaultWorkbookPath()): WorkbookData {
  const workbook = XLSX.readFile(filePath);

  // --- categories ---
  const rawCategories = sheetRows(workbook, "categories");
  const categories: CategoryRow[] = rawCategories.map((row, i) => ({
    category_id: requireString(row, "category_id", "categories", i),
    display_name: requireString(row, "display_name", "categories", i),
    sort_order: parseIntField(cell(row, "sort_order", "categories", i), "sort_order", "categories", i),
    active: parseBool(cell(row, "active", "categories", i), "active", "categories", i),
    flag: optionalString(row, "flag"),
    notes: optionalString(row, "notes"),
  }));
  assertUnique(
    categories.map((c) => c.category_id),
    "categories",
    "category_id",
  );

  // --- modifier_groups ---
  const rawGroups = sheetRows(workbook, "modifier_groups");
  const modifier_groups: ModifierGroupRow[] = rawGroups.map((row, i) => {
    const min = parseIntField(cell(row, "min_select", "modifier_groups", i), "min_select", "modifier_groups", i);
    const max = parseIntField(cell(row, "max_select", "modifier_groups", i), "max_select", "modifier_groups", i);
    if (min > max) {
      throw new Error(
        `[modifier_groups] row ${i + 2}: min_select (${min}) exceeds max_select (${max})`,
      );
    }
    return {
      group_id: requireString(row, "group_id", "modifier_groups", i),
      customer_prompt: requireString(row, "customer_prompt", "modifier_groups", i),
      internal_name: requireString(row, "internal_name", "modifier_groups", i),
      required: parseBool(cell(row, "required", "modifier_groups", i), "required", "modifier_groups", i),
      min_select: min,
      max_select: max,
      sort_order: parseIntField(cell(row, "sort_order", "modifier_groups", i), "sort_order", "modifier_groups", i),
      flag: optionalString(row, "flag"),
      notes: optionalString(row, "notes"),
    };
  });
  assertUnique(
    modifier_groups.map((g) => g.group_id),
    "modifier_groups",
    "group_id",
  );

  // --- modifier_options ---
  const groupIds = new Set(modifier_groups.map((g) => g.group_id));
  const rawOptions = sheetRows(workbook, "modifier_options");
  const modifier_options: ModifierOptionRow[] = rawOptions.map((row, i) => {
    const groupId = requireString(row, "group_id", "modifier_options", i);
    if (!groupIds.has(groupId)) {
      throw new Error(
        `[modifier_options] row ${i + 2}: group_id "${groupId}" does not exist in modifier_groups`,
      );
    }
    return {
      option_id: requireString(row, "option_id", "modifier_options", i),
      group_id: groupId,
      option_name: requireString(row, "option_name", "modifier_options", i),
      price_delta_cents: parseMoney(
        cell(row, "price_delta_usd", "modifier_options", i),
        "price_delta_usd",
        "modifier_options",
        i,
      ),
      sort_order: parseIntField(cell(row, "sort_order", "modifier_options", i), "sort_order", "modifier_options", i),
      default_selected: parseBool(
        cell(row, "default_selected", "modifier_options", i),
        "default_selected",
        "modifier_options",
        i,
      ),
      flag: optionalString(row, "flag"),
      notes: optionalString(row, "notes"),
    };
  });
  assertUnique(
    modifier_options.map((o) => o.option_id),
    "modifier_options",
    "option_id",
  );

  // --- items ---
  const categoryIds = new Set(categories.map((c) => c.category_id));
  const rawItems = sheetRows(workbook, "items");
  const items: ItemRow[] = rawItems.map((row, i) => {
    const categoryId = requireString(row, "category_id", "items", i);
    if (!categoryIds.has(categoryId)) {
      throw new Error(`[items] row ${i + 2}: category_id "${categoryId}" does not exist in categories`);
    }
    const board = optionalString(row, "board_label");
    return {
      item_id: requireString(row, "item_id", "items", i),
      category_id: categoryId,
      board_label: board === "-" ? null : board,
      display_name: requireString(row, "display_name", "items", i),
      price_cents: parseMoney(cell(row, "price_usd", "items", i), "price_usd", "items", i),
      flag: optionalString(row, "flag"),
      notes: optionalString(row, "notes"),
    };
  });
  assertUnique(
    items.map((it) => it.item_id),
    "items",
    "item_id",
  );

  // --- item_modifier_groups ---
  const itemIds = new Set(items.map((it) => it.item_id));
  const rawBindings = sheetRows(workbook, "item_modifier_groups");
  const item_modifier_groups: ItemModifierGroupRow[] = rawBindings.map((row, i) => {
    const itemId = requireString(row, "item_id", "item_modifier_groups", i);
    const groupId = requireString(row, "group_id", "item_modifier_groups", i);
    if (!itemIds.has(itemId)) {
      throw new Error(
        `[item_modifier_groups] row ${i + 2}: item_id "${itemId}" does not exist in items`,
      );
    }
    if (!groupIds.has(groupId)) {
      throw new Error(
        `[item_modifier_groups] row ${i + 2}: group_id "${groupId}" does not exist in modifier_groups`,
      );
    }
    return {
      item_id: itemId,
      group_id: groupId,
      sort_order: parseIntField(
        cell(row, "sort_order", "item_modifier_groups", i),
        "sort_order",
        "item_modifier_groups",
        i,
      ),
      flag: optionalString(row, "flag"),
      notes: optionalString(row, "notes"),
    };
  });

  return { categories, items, modifier_groups, modifier_options, item_modifier_groups };
}

/** Deterministic URL-safe slug from a display name. */
export function slugify(displayName: string): string {
  return displayName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
