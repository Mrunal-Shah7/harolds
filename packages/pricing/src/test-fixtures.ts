// SPRINT-3: shared fake catalog with Harold's real board prices for engine tests.
import type { MenuCatalog, ResolvedItem } from "./menu-data";

/** 6pc Wings — $8.79 */
export const ITEM_WINGS = "item-wings-6pc";
/** Half Chicken — $11.49 */
export const ITEM_HALF_CHICKEN = "item-half-chicken";
/** Cheapest snack — $1.99 (small-end rounding) */
export const ITEM_CHEAP = "item-cheap-199";
/** Catering tray — $64.99 */
export const ITEM_CATERING = "item-catering-6499";
/** Inactive item (must report as ITEM_NOT_FOUND) */
export const ITEM_INACTIVE = "item-inactive";
/** Sold-out item */
export const ITEM_SOLD_OUT = "item-sold-out";
/** Item with no modifier groups */
export const ITEM_PLAIN = "item-plain-879";

export const GROUP_SAUCE = "group-sauce";
export const GROUP_SIDES = "group-sides";
export const GROUP_EXTRA = "group-extra";
export const GROUP_OPTIONAL_MIN2 = "group-optional-min2";
export const GROUP_INACTIVE = "group-inactive";
export const GROUP_OTHER_ITEM = "group-other-only";

export const OPT_MILD = "opt-mild";
export const OPT_HOT = "opt-hot";
export const OPT_FRIES = "opt-add-fries"; // +449
export const OPT_CHEESE = "opt-add-cheese"; // +119
export const OPT_ZERO_A = "opt-zero-a";
export const OPT_ZERO_B = "opt-zero-b";
export const OPT_INACTIVE = "opt-inactive";
export const OPT_SOLD_OUT = "opt-sold-out";
export const OPT_OTHER_ITEM = "opt-bound-elsewhere"; // bound only to ITEM_CHEAP
export const OPT_PAIR_1 = "opt-pair-1";
export const OPT_PAIR_2 = "opt-pair-2";
export const OPT_ON_INACTIVE_GROUP = "opt-on-inactive-group";

function wings(): ResolvedItem {
  return {
    id: ITEM_WINGS,
    name: "6 Piece Wings",
    boardLabel: "6pc Wings",
    basePriceCents: 879,
    isActive: true,
    isSoldOut: false,
    sortOrder: 1,
    groups: [
      {
        id: GROUP_SAUCE,
        name: "sauce",
        prompt: "Choose your sauce",
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        isActive: true,
        sortOrder: 0,
        options: [
          {
            id: OPT_MILD,
            name: "Mild",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 0,
          },
          {
            id: OPT_HOT,
            name: "Hot",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 1,
          },
          {
            id: OPT_INACTIVE,
            name: "Retired Sauce",
            priceDeltaCents: 0,
            isActive: false,
            isSoldOut: false,
            sortOrder: 2,
          },
          {
            id: OPT_SOLD_OUT,
            name: "Sold Out Sauce",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: true,
            sortOrder: 3,
          },
        ],
      },
      {
        id: GROUP_SIDES,
        name: "sides",
        prompt: "Add a side?",
        isRequired: false,
        minSelect: 0,
        maxSelect: 2,
        isActive: true,
        sortOrder: 1,
        options: [
          {
            id: OPT_FRIES,
            name: "Add Fries",
            priceDeltaCents: 449,
            isActive: true,
            isSoldOut: false,
            sortOrder: 0,
          },
          {
            id: OPT_CHEESE,
            name: "Add Cheese",
            priceDeltaCents: 119,
            isActive: true,
            isSoldOut: false,
            sortOrder: 1,
          },
          {
            id: OPT_ZERO_A,
            name: "No Ranch",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 2,
          },
          {
            id: OPT_ZERO_B,
            name: "Extra Napkins",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 3,
          },
        ],
      },
      {
        id: GROUP_INACTIVE,
        name: "inactive_group",
        prompt: "Retired group",
        isRequired: false,
        minSelect: 0,
        maxSelect: 1,
        isActive: false,
        sortOrder: 2,
        options: [
          {
            id: OPT_ON_INACTIVE_GROUP,
            name: "Ghost Option",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 0,
          },
        ],
      },
    ],
  };
}

function halfChicken(): ResolvedItem {
  return {
    id: ITEM_HALF_CHICKEN,
    name: "Half Chicken",
    boardLabel: "1/2 Chicken",
    basePriceCents: 1149,
    isActive: true,
    isSoldOut: false,
    sortOrder: 2,
    groups: [
      {
        id: GROUP_EXTRA,
        name: "extras",
        prompt: "Extras",
        isRequired: false,
        minSelect: 0,
        maxSelect: 3,
        isActive: true,
        sortOrder: 0,
        options: [
          {
            id: OPT_FRIES,
            name: "Add Fries",
            priceDeltaCents: 449,
            isActive: true,
            isSoldOut: false,
            sortOrder: 1,
          },
          {
            id: OPT_CHEESE,
            name: "Add Cheese",
            priceDeltaCents: 119,
            isActive: true,
            isSoldOut: false,
            sortOrder: 0,
          },
        ],
      },
    ],
  };
}

function cheap(): ResolvedItem {
  return {
    id: ITEM_CHEAP,
    name: "Small Drink",
    boardLabel: null,
    basePriceCents: 199,
    isActive: true,
    isSoldOut: false,
    sortOrder: 3,
    groups: [
      {
        id: GROUP_OTHER_ITEM,
        name: "drink_mod",
        prompt: "Ice?",
        isRequired: false,
        minSelect: 0,
        maxSelect: 1,
        isActive: true,
        sortOrder: 0,
        options: [
          {
            id: OPT_OTHER_ITEM,
            name: "No Ice",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 0,
          },
        ],
      },
      {
        id: GROUP_OPTIONAL_MIN2,
        name: "pair_pick",
        prompt: "Pick two toppings",
        isRequired: false,
        minSelect: 2,
        maxSelect: 2,
        isActive: true,
        sortOrder: 1,
        options: [
          {
            id: OPT_PAIR_1,
            name: "Topping A",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 0,
          },
          {
            id: OPT_PAIR_2,
            name: "Topping B",
            priceDeltaCents: 0,
            isActive: true,
            isSoldOut: false,
            sortOrder: 1,
          },
        ],
      },
    ],
  };
}

function catering(): ResolvedItem {
  return {
    id: ITEM_CATERING,
    name: "Catering Tray",
    boardLabel: "CATERING",
    basePriceCents: 6499,
    isActive: true,
    isSoldOut: false,
    sortOrder: 4,
    groups: [],
  };
}

function plain(): ResolvedItem {
  return {
    id: ITEM_PLAIN,
    name: "Plain Wings",
    boardLabel: "Wings",
    basePriceCents: 879,
    isActive: true,
    isSoldOut: false,
    sortOrder: 5,
    groups: [],
  };
}

function inactive(): ResolvedItem {
  return {
    id: ITEM_INACTIVE,
    name: "Ghost Item",
    boardLabel: null,
    basePriceCents: 500,
    isActive: false,
    isSoldOut: false,
    sortOrder: 99,
    groups: [],
  };
}

function soldOut(): ResolvedItem {
  return {
    id: ITEM_SOLD_OUT,
    name: "Sold Out Special",
    boardLabel: null,
    basePriceCents: 999,
    isActive: true,
    isSoldOut: true,
    sortOrder: 98,
    groups: [],
  };
}

export function buildTestCatalog(): MenuCatalog {
  const items = [
    wings(),
    halfChicken(),
    cheap(),
    catering(),
    plain(),
    inactive(),
    soldOut(),
  ];
  return { itemsById: new Map(items.map((i) => [i.id, i])) };
}

export const DEFAULT_STORE = {
  taxRateBps: 1010,
  taxAppliedPreDiscount: true,
  tippingEnabled: true,
  tipPresetsBps: [1500, 1800, 2000, 2500],
  isOpen: true,
  acceptingOrders: true,
  prepMinutes: 20,
  now: new Date("2026-08-09T18:00:00.000Z"),
};
