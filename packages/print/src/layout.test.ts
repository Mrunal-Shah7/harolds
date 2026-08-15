// SPRINT-5: layout snapshots + edge cases — no printer, no protocol
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCounterReceipt, buildKitchenTicket, renderPlainText } from "./layout";
import type { TicketOrderInput } from "./ticket-model";

const PAID_AT = new Date("2026-08-09T18:59:34.836Z");

function sampleOrder(overrides: Partial<TicketOrderInput> = {}): TicketOrderInput {
  return {
    orderNumber: "HC-003",
    paidAt: PAID_AT,
    timeZone: "America/Chicago",
    storeName: "Harold's Chicken Oak Lawn",
    customerFirstName: "Jamal",
    customerLastName: "Wright",
    paymentStatus: "CAPTURED",
    cardLast4: "1111",
    subtotalCents: 2265,
    taxCents: 229,
    tipCents: 0,
    totalCents: 2494,
    lines: [
      {
        quantity: 1,
        itemName: "Half Chicken",
        boardLabel: "1/2 CHICKEN",
        customerNote: "Extra crispy if possible",
        selectedModifiers: [{ optionName: "Mild" }, { optionName: "Add Fries" }],
      },
      {
        quantity: 2,
        itemName: "Mayo Packet",
        boardLabel: "MAYO PACKETS",
        customerNote: null,
        selectedModifiers: [],
      },
    ],
    ...overrides,
  };
}

describe("kitchen ticket layout", () => {
  it("matches the in-store structure with online deltas and no prices", () => {
    const preview = renderPlainText(buildKitchenTicket(sampleOrder()));
    assert.match(preview, /HC-003/);
    assert.match(preview, /ONLINE PICKUP/);
    assert.match(preview, /\*\* PAID \*\*/);
    assert.match(preview, /Jamal W\./);
    assert.match(preview, /ONLINE/);
    assert.match(preview, /1\/2 CHICKEN/);
    assert.match(preview, / {2}MILD/);
    assert.match(preview, / {2}ADD FRIES/);
    assert.match(preview, /NOTE: Extra crispy if possible/);
    assert.match(preview, /2 X MAYO PACKETS/);
    assert.match(preview, /Harold's Chicken Oak Lawn/);
    assert.doesNotMatch(preview, /\$/);
    assert.doesNotMatch(preview, /SUBTOTAL/);
    assert.doesNotMatch(preview, /TAX/);
    assert.doesNotMatch(preview, /2\.49|22\.65|2494/);
    // Order number at top and foot
    const occurrences = preview.split("HC-003").length - 1;
    assert.ok(occurrences >= 2, "order number must repeat at the foot");
    // Store-local time for the known instant (CDT = UTC-5 → 1:59 PM)
    assert.match(preview, /08\/09\/26/);
    assert.match(preview, /1:59 PM/);
  });

  it("renders a stable realistic preview", () => {
    const preview = renderPlainText(buildKitchenTicket(sampleOrder()));
    const expected = [
      "                  HC-003",
      "------------------------------------------",
      "08/09/26  1:59 PM",
      "ONLINE",
      "Jamal W.",
      "                ** PAID **",
      "              ONLINE PICKUP",
      "------------------------------------------",
      "1/2 CHICKEN",
      "  MILD",
      "  ADD FRIES",
      "  NOTE: Extra crispy if possible",
      "2 X MAYO PACKETS",
      "------------------------------------------",
      "                  HC-003",
      "        Harold's Chicken Oak Lawn",
    ].join("\n");
    assert.equal(preview, expected);
  });

  it("wraps a long item name without breaking modifier indentation", () => {
    const preview = renderPlainText(
      buildKitchenTicket(
        sampleOrder({
          lines: [
            {
              quantity: 1,
              itemName: "Super Extra Long Catering Package Name That Exceeds The Paper Width Easily",
              boardLabel: "SUPER EXTRA LONG CATERING PACKAGE NAME THAT EXCEEDS THE PAPER WIDTH EASILY",
              customerNote: null,
              selectedModifiers: [{ optionName: "Mild" }],
            },
          ],
        }),
      ),
    );
    const lines = preview.split("\n");
    const itemIdx = lines.findIndex((l) => l.startsWith("SUPER EXTRA LONG"));
    assert.ok(itemIdx >= 0);
    const continuation = lines[itemIdx + 1];
    assert.ok(continuation?.startsWith("  "), "wrapped item name hangs indent");
    const mod = lines.find((l) => l.includes("MILD"));
    assert.equal(mod?.startsWith("  "), true);
    assert.ok(!preview.includes("SUPER EXTRA LONG CATERING PACKAGE NAME THAT EXCEEDS THE PAPER WIDTH EASILY"));
  });

  it("renders eight or more modifiers", () => {
    const mods = ["Mild", "Hot", "Lemon Pepper", "BBQ", "Garlic", "Cajun", "No Salt", "Extra Sauce"];
    const preview = renderPlainText(
      buildKitchenTicket(
        sampleOrder({
          lines: [
            {
              quantity: 1,
              itemName: "Wings",
              boardLabel: "WINGS",
              customerNote: null,
              selectedModifiers: mods.map((optionName) => ({ optionName })),
            },
          ],
        }),
      ),
    );
    for (const m of mods) {
      assert.match(preview, new RegExp(` {2}${m.toUpperCase()}`));
    }
  });

  it("renders a long customer note", () => {
    const note =
      "Please make sure the chicken is well done, extra crispy, sauce on the side, no pickles, and call when ready at the side door.";
    const preview = renderPlainText(
      buildKitchenTicket(
        sampleOrder({
          lines: [
            {
              quantity: 1,
              itemName: "Half Chicken",
              boardLabel: "1/2 CHICKEN",
              customerNote: note,
              selectedModifiers: [],
            },
          ],
        }),
      ),
    );
    assert.match(preview, /NOTE:/);
    assert.ok(preview.includes("well done"));
    assert.ok(preview.split("\n").some((l) => l.startsWith("  NOTE:") || l.startsWith("  ")));
  });

  it("renders twenty or more lines without truncation", () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({
      quantity: 1,
      itemName: `Item ${i + 1}`,
      boardLabel: `ITEM ${i + 1}`,
      customerNote: null,
      selectedModifiers: [] as { optionName: string }[],
    }));
    const preview = renderPlainText(buildKitchenTicket(sampleOrder({ lines })));
    for (let i = 1; i <= 20; i++) {
      assert.match(preview, new RegExp(`ITEM ${i}`));
    }
  });

  it("keeps ampersands in the model text (escaping is the XML renderer's job)", () => {
    const preview = renderPlainText(
      buildKitchenTicket(
        sampleOrder({
          lines: [
            {
              quantity: 1,
              itemName: "Fish & Chips",
              boardLabel: "FISH & CHIPS",
              customerNote: null,
              selectedModifiers: [],
            },
          ],
        }),
      ),
    );
    assert.match(preview, /FISH & CHIPS/);
    assert.doesNotMatch(preview, /&amp;/);
  });

  it("shows a double-digit quantity prefix", () => {
    const preview = renderPlainText(
      buildKitchenTicket(
        sampleOrder({
          lines: [
            {
              quantity: 12,
              itemName: "Mayo Packet",
              boardLabel: "MAYO PACKETS",
              customerNote: null,
              selectedModifiers: [],
            },
          ],
        }),
      ),
    );
    assert.match(preview, /12 X MAYO PACKETS/);
  });
});

describe("counter receipt layout", () => {
  it("prints stored money figures exactly and optional card last four", () => {
    const preview = renderPlainText(buildCounterReceipt(sampleOrder()));
    assert.match(preview, /SUBTOTAL\s+\$22\.65/);
    assert.match(preview, /TAX\s+\$2\.29/);
    assert.match(preview, /TIP\s+\$0\.00/);
    assert.match(preview, /TOTAL\s+\$24\.94/);
    assert.match(preview, /PAYMENT {2}CAPTURED/);
    assert.match(preview, /CARD {2}\*\*\*\*1111/);
    assert.match(preview, /COUNTER RECEIPT/);
    assert.match(preview, /Jamal W\./);
  });

  it("omits card data when Square did not supply last four", () => {
    const preview = renderPlainText(buildCounterReceipt(sampleOrder({ cardLast4: null })));
    assert.doesNotMatch(preview, /CARD/);
    assert.doesNotMatch(preview, /\*\*\*\*/);
  });
});
