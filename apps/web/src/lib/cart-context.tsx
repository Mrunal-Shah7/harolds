"use client";

// Client-side cart state. Stores only identifiers/quantities/notes — never prices
// (STOREFRONT-REQUIREMENTS.md #1: server reprices, client never sends money fields).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartLineRequest, MenuItemSummary, TipRequest } from "@harolds/types";

export type CartLine = CartLineRequest & {
  /** Client-only key so the same item + different options can coexist as separate lines. */
  key: string;
  item: MenuItemSummary;
  optionLabels: string[];
  /**
   * Base price plus the selected option deltas, computed when the line was added.
   *
   * This is a DISPLAY figure and never leaves the browser: `toCartRequest` omits it, so the
   * "client never sends money fields" rule is intact. It exists so the cart bar can show a
   * running item total the instant something is added, which a server quote cannot do without a
   * round trip. It is the estimate half of an estimate-then-reconcile pair: whenever a real
   * quote lands, the quote's figure replaces this one.
   */
  unitPriceCents: number;
};

const STORAGE_KEY = "harolds.cart.v1";

/**
 * SPRINT-16: minted here rather than imported from lib/order-key, deliberately. cart-context is
 * loaded by every storefront page; order-key's canonicaliser is only needed at checkout, and
 * importing it here would pull it into the home and menu bundles for no reason.
 */
function newSessionNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type StoredCart = {
  lines: Array<
    CartLineRequest & { item: MenuItemSummary; optionLabels: string[]; unitPriceCents?: number }
  >;
  tip?: TipRequest;
  /** SPRINT-16: minted once per shopping session; see lib/order-key.ts. */
  sessionNonce?: string;
};

function lineKey(itemId: string, selectedOptionIds: string[], customerNote: string | null | undefined): string {
  return `${itemId}::${[...selectedOptionIds].sort().join(",")}::${customerNote ?? ""}`;
}

function omitKey(
  line: CartLine,
): CartLineRequest & { item: MenuItemSummary; optionLabels: string[]; unitPriceCents: number } {
  return {
    itemId: line.itemId,
    quantity: line.quantity,
    selectedOptionIds: line.selectedOptionIds,
    customerNote: line.customerNote,
    item: line.item,
    optionLabels: line.optionLabels,
    unitPriceCents: line.unitPriceCents,
  };
}

type CartContextValue = {
  lines: CartLine[];
  tip: TipRequest | undefined;
  totalItems: number;
  addLine: (input: {
    item: MenuItemSummary;
    quantity: number;
    selectedOptionIds: string[];
    optionLabels: string[];
    customerNote?: string | null;
    /** Base + selected option deltas. Display only; see CartLine.unitPriceCents. */
    unitPriceCents?: number;
  }) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  /**
   * Estimated cost of the items alone — no tax, no tip. Summed in the browser so the cart bar
   * can react immediately; superseded by the server quote wherever one is available.
   */
  subtotalCents: number;
  /** How many of one item the cart holds, summed over every line of it. */
  quantityForItem: (itemId: string) => number;
  /**
   * Menu-card stepper. "+" repeats the most recently added configuration of the item rather than
   * guessing a new one, and "-" takes one off that same line, so the pair is symmetric and the
   * customer's last choice is the one that repeats.
   */
  incrementItem: (itemId: string) => void;
  decrementItem: (itemId: string) => void;
  /**
   * True when one more of this item would exceed the admin's per-order ceiling for it.
   * The server enforces the same limit; this only stops the UI from offering the impossible.
   */
  isAtItemLimit: (item: MenuItemSummary) => boolean;
  /** Edit a line's kitchen note in place, merging if that makes it identical to another line. */
  updateLineNote: (key: string, note: string | null) => void;
  setTip: (tip: TipRequest | undefined) => void;
  /** SPRINT-14 (design.md §7.7, Phase 6.3): removal is cheap to undo and expensive to
   *  interrupt, so it is never a confirmation dialog. Client state only — no request. */
  lastRemoved: { line: CartLine; index: number } | null;
  undoRemove: () => void;
  dismissUndo: () => void;
  clear: () => void;
  toCartRequest: () => { lines: CartLineRequest[]; tip?: TipRequest };
  /**
   * SPRINT-16: the session nonce the order idempotency key is derived from. Minted on first use,
   * persisted beside the cart so it survives a reload, and cleared when the order succeeds or the
   * cart empties — so the NEXT order is genuinely a new one.
   */
  getSessionNonce: () => string;
  /**
   * SPRINT-16: start a new order identity. Called ONLY after a definite decline, where the
   * processor has confirmed no money moved, so a fresh order is harmless. It is never called on
   * an ambiguous PAYMENT_FAILED — that is precisely the case the stable key protects.
   */
  rotateSessionNonce: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [tip, setTipState] = useState<TipRequest | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [lastRemoved, setLastRemoved] = useState<{ line: CartLine; index: number } | null>(null);
  const [sessionNonce, setSessionNonce] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredCart;
        setLines(
          parsed.lines.map((l) => ({
            ...l,
            key: lineKey(l.itemId, l.selectedOptionIds, l.customerNote),
            // Carts stored before this field existed fall back to the base price. The figure is
            // an estimate that the next quote corrects, so an old cart is never wrong for long.
            unitPriceCents: l.unitPriceCents ?? l.item.basePriceCents,
          })),
        );
        setTipState(parsed.tip);
        if (parsed.sessionNonce) setSessionNonce(parsed.sessionNonce);
      }
    } catch {
      // Corrupt/old cart data — start fresh.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const stored: StoredCart = {
      lines: lines.map((line) => omitKey(line)),
      tip,
      ...(sessionNonce ? { sessionNonce } : {}),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [lines, tip, sessionNonce, hydrated]);

  const addLine = useCallback<CartContextValue["addLine"]>((input) => {
    const key = lineKey(input.item.id, input.selectedOptionIds, input.customerNote);
    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => l.key === key);
      const existing = existingIndex >= 0 ? prev[existingIndex] : undefined;
      if (existing) {
        const next = [...prev];
        next[existingIndex] = { ...existing, quantity: existing.quantity + input.quantity };
        return next;
      }
      return [
        ...prev,
        {
          key,
          itemId: input.item.id,
          quantity: input.quantity,
          selectedOptionIds: input.selectedOptionIds,
          customerNote: input.customerNote ?? null,
          item: input.item,
          optionLabels: input.optionLabels,
          unitPriceCents: input.unitPriceCents ?? input.item.basePriceCents,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) => {
      if (quantity <= 0) {
        const index = prev.findIndex((l) => l.key === key);
        const removed = index >= 0 ? prev[index] : undefined;
        if (removed) setLastRemoved({ line: removed, index });
        return prev.filter((l) => l.key !== key);
      }
      return prev.map((l) => (l.key === key ? { ...l, quantity } : l));
    });
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => {
      const index = prev.findIndex((l) => l.key === key);
      const removed = index >= 0 ? prev[index] : undefined;
      if (removed) setLastRemoved({ line: removed, index });
      return prev.filter((l) => l.key !== key);
    });
  }, []);

  /**
   * Change one line's kitchen note.
   *
   * The note is PART of a line's identity (`lineKey`), because two of the same item with
   * different instructions are two different things to the kitchen. That means editing a note
   * re-keys the line, and the new key can collide with a line that already exists — add wings
   * with "extra crispy", add plain wings, then type "extra crispy" on the plain one. Merging the
   * quantities is the only answer that does not silently drop one of them.
   */
  const updateLineNote = useCallback((key: string, note: string | null) => {
    setLines((prev) => {
      const index = prev.findIndex((l) => l.key === key);
      if (index < 0) return prev;
      const line = prev[index]!;
      const cleaned = note && note.trim().length > 0 ? note.trim() : null;
      if ((line.customerNote ?? null) === cleaned) return prev;
      const nextKey = lineKey(line.itemId, line.selectedOptionIds, cleaned);
      const twinIndex = prev.findIndex((l, i) => i !== index && l.key === nextKey);
      if (twinIndex >= 0) {
        const twin = prev[twinIndex]!;
        return prev
          .map((l, i) =>
            i === twinIndex ? { ...twin, quantity: twin.quantity + line.quantity } : l,
          )
          .filter((_, i) => i !== index);
      }
      return prev.map((l, i) =>
        i === index ? { ...l, key: nextKey, customerNote: cleaned } : l,
      );
    });
  }, []);

  const quantityForItem = useCallback(
    (itemId: string) =>
      lines.reduce((sum, l) => (l.itemId === itemId ? sum + l.quantity : sum), 0),
    [lines],
  );

  const isAtItemLimit = useCallback(
    (item: MenuItemSummary) => {
      const ceiling = item.maxQuantityPerOrder;
      if (typeof ceiling !== "number" || ceiling <= 0) return false;
      return lines.reduce((sum, l) => (l.itemId === item.id ? sum + l.quantity : sum), 0) >= ceiling;
    },
    [lines],
  );

  /** The line the stepper acts on: the most recently added configuration of this item. */
  const newestIndexOf = (all: CartLine[], itemId: string): number => {
    for (let i = all.length - 1; i >= 0; i -= 1) {
      if (all[i]!.itemId === itemId) return i;
    }
    return -1;
  };

  const incrementItem = useCallback((itemId: string) => {
    setLines((prev) => {
      const index = newestIndexOf(prev, itemId);
      if (index < 0) return prev;
      const line = prev[index]!;
      const ceiling = line.item.maxQuantityPerOrder;
      if (typeof ceiling === "number" && ceiling > 0) {
        const held = prev.reduce((sum, l) => (l.itemId === itemId ? sum + l.quantity : sum), 0);
        if (held >= ceiling) return prev;
      }
      return prev.map((l, i) => (i === index ? { ...l, quantity: l.quantity + 1 } : l));
    });
  }, []);

  const decrementItem = useCallback((itemId: string) => {
    setLines((prev) => {
      const index = newestIndexOf(prev, itemId);
      if (index < 0) return prev;
      const line = prev[index]!;
      if (line.quantity > 1) {
        return prev.map((l, i) => (i === index ? { ...l, quantity: l.quantity - 1 } : l));
      }
      setLastRemoved({ line, index });
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const undoRemove = useCallback(() => {
    setLastRemoved((removed) => {
      if (!removed) return null;
      setLines((prev) => {
        if (prev.some((l) => l.key === removed.line.key)) return prev;
        const next = [...prev];
        next.splice(Math.min(removed.index, next.length), 0, removed.line);
        return next;
      });
      return null;
    });
  }, []);

  const dismissUndo = useCallback(() => setLastRemoved(null), []);

  const setTip = useCallback((next: TipRequest | undefined) => {
    setTipState(next);
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setTipState(undefined);
    // SPRINT-16: a completed or abandoned cart ends the session. The next order derives a new key.
    setSessionNonce(null);
  }, []);

  const getSessionNonce = useCallback((): string => {
    if (sessionNonce) return sessionNonce;
    const minted = newSessionNonce();
    setSessionNonce(minted);
    return minted;
  }, [sessionNonce]);

  const rotateSessionNonce = useCallback(() => setSessionNonce(newSessionNonce()), []);

  // An emptied cart ends the session too, however it was emptied.
  useEffect(() => {
    if (hydrated && lines.length === 0 && sessionNonce) setSessionNonce(null);
  }, [hydrated, lines.length, sessionNonce]);

  const toCartRequest = useCallback(() => {
    return {
      lines: lines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        selectedOptionIds: line.selectedOptionIds,
        customerNote: line.customerNote,
      })),
      ...(tip ? { tip } : {}),
    };
  }, [lines, tip]);

  const totalItems = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);

  // Items only: no tax, no tip. See CartLine.unitPriceCents for why a client figure exists here.
  const subtotalCents = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0),
    [lines],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      tip,
      totalItems,
      addLine,
      updateQuantity,
      removeLine,
      subtotalCents,
      quantityForItem,
      incrementItem,
      decrementItem,
      isAtItemLimit,
      updateLineNote,
      setTip,
      clear,
      toCartRequest,
      lastRemoved,
      undoRemove,
      dismissUndo,
      getSessionNonce,
      rotateSessionNonce,
    }),
    [
      lines,
      tip,
      totalItems,
      addLine,
      updateQuantity,
      removeLine,
      subtotalCents,
      quantityForItem,
      incrementItem,
      decrementItem,
      isAtItemLimit,
      updateLineNote,
      setTip,
      clear,
      toCartRequest,
      lastRemoved,
      undoRemove,
      dismissUndo,
      getSessionNonce,
      rotateSessionNonce,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
