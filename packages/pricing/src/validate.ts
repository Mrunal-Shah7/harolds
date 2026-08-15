// SPRINT-3: Phase 4 modifier/item validation — report every problem; mark availability reasons.
import {
  AVAILABILITY_REASON_CODES,
  CartValidationReasonCode,
  type CartRequest,
  type CartValidationReason,
  type CartValidationReasonCode as ReasonCode,
} from "@harolds/types";
import type { MenuCatalog, ResolvedGroup, ResolvedItem, ResolvedOption } from "./menu-data";

function makeReason(
  code: ReasonCode,
  message: string,
  fields: {
    lineIndex: number | null;
    itemId: string | null;
    groupId?: string | null;
    optionId?: string | null;
  },
): CartValidationReason {
  return {
    code,
    message,
    lineIndex: fields.lineIndex,
    itemId: fields.itemId,
    groupId: fields.groupId ?? null,
    optionId: fields.optionId ?? null,
    isAvailability: AVAILABILITY_REASON_CODES.has(code),
  };
}

type OptionHit = {
  group: ResolvedGroup;
  option: ResolvedOption;
  itemId: string;
};

/** Search the whole catalog so we can distinguish not-found vs not-bound. */
function findOptionAnywhere(catalog: MenuCatalog, optionId: string): OptionHit | null {
  for (const item of catalog.itemsById.values()) {
    for (const group of item.groups) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) return { group, option, itemId: item.id };
    }
  }
  return null;
}

function findOptionOnItem(
  item: ResolvedItem,
  optionId: string,
): { group: ResolvedGroup; option: ResolvedOption } | null {
  for (const group of item.groups) {
    const option = group.options.find((o) => o.id === optionId);
    if (option) return { group, option };
  }
  return null;
}

/**
 * Validate every line against the catalog. Returns ALL problems (never stops at first).
 * Inactive items produce ITEM_NOT_FOUND identical to missing items (no existence leak).
 */
export function validateCart(cart: CartRequest, catalog: MenuCatalog): CartValidationReason[] {
  const reasons: CartValidationReason[] = [];

  cart.lines.forEach((line, lineIndex) => {
    const item = catalog.itemsById.get(line.itemId);

    // Inactive ≡ missing — do not leak existence.
    if (!item || !item.isActive) {
      reasons.push(
        makeReason(CartValidationReasonCode.ITEM_NOT_FOUND, "Item not found", {
          lineIndex,
          itemId: line.itemId,
        }),
      );
      return;
    }

    if (item.isSoldOut) {
      reasons.push(
        makeReason(CartValidationReasonCode.ITEM_SOLD_OUT, "Item is sold out", {
          lineIndex,
          itemId: item.id,
        }),
      );
    }

    const seenOptionIds = new Set<string>();
    /** Selections counted toward each group (by group id), including bad options that mapped. */
    const countByGroup = new Map<string, number>();

    for (const optionId of line.selectedOptionIds) {
      if (seenOptionIds.has(optionId)) {
        reasons.push(
          makeReason(CartValidationReasonCode.DUPLICATE_OPTION, "Duplicate option selection", {
            lineIndex,
            itemId: item.id,
            optionId,
          }),
        );
        continue;
      }
      seenOptionIds.add(optionId);

      const onItem = findOptionOnItem(item, optionId);
      if (!onItem) {
        const elsewhere = findOptionAnywhere(catalog, optionId);
        if (elsewhere) {
          reasons.push(
            makeReason(
              CartValidationReasonCode.OPTION_NOT_BOUND,
              "Option is not bound to this item",
              { lineIndex, itemId: item.id, optionId, groupId: elsewhere.group.id },
            ),
          );
        } else {
          reasons.push(
            makeReason(CartValidationReasonCode.OPTION_NOT_FOUND, "Option not found", {
              lineIndex,
              itemId: item.id,
              optionId,
            }),
          );
        }
        continue;
      }

      const { group, option } = onItem;
      countByGroup.set(group.id, (countByGroup.get(group.id) ?? 0) + 1);

      if (!group.isActive) {
        reasons.push(
          makeReason(CartValidationReasonCode.GROUP_INACTIVE, "Modifier group is inactive", {
            lineIndex,
            itemId: item.id,
            groupId: group.id,
            optionId,
          }),
        );
      }

      if (!option.isActive) {
        reasons.push(
          makeReason(CartValidationReasonCode.OPTION_INACTIVE, "Option is inactive", {
            lineIndex,
            itemId: item.id,
            groupId: group.id,
            optionId,
          }),
        );
      }

      if (option.isSoldOut) {
        reasons.push(
          makeReason(CartValidationReasonCode.OPTION_SOLD_OUT, "Option is sold out", {
            lineIndex,
            itemId: item.id,
            groupId: group.id,
            optionId,
          }),
        );
      }
    }

    // Min/max: inactive groups are not customer-selectable on the public menu; skip mins
    // when the group is inactive (availability), but still enforce max if somehow selected.
    for (const group of item.groups) {
      const count = countByGroup.get(group.id) ?? 0;

      if (count > group.maxSelect) {
        reasons.push(
          makeReason(
            CartValidationReasonCode.ABOVE_MAX_SELECT,
            `Too many selections for group (max ${group.maxSelect})`,
            { lineIndex, itemId: item.id, groupId: group.id },
          ),
        );
      }

      if (!group.isActive) continue;

      const belowMin = count < group.minSelect;
      if (!belowMin) continue;

      if (group.isRequired) {
        reasons.push(
          makeReason(
            CartValidationReasonCode.BELOW_MIN_SELECT,
            `Required group needs at least ${group.minSelect} selection(s)`,
            { lineIndex, itemId: item.id, groupId: group.id },
          ),
        );
      } else if (count >= 1) {
        // Optional group started but not finished (e.g. min 2, chose 1).
        reasons.push(
          makeReason(
            CartValidationReasonCode.BELOW_MIN_SELECT,
            `Group needs at least ${group.minSelect} selection(s) once started`,
            { lineIndex, itemId: item.id, groupId: group.id },
          ),
        );
      }
    }
  });

  return reasons;
}
