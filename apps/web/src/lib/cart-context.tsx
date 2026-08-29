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
  lines: Array<CartLineRequest & { item: MenuItemSummary; optionLabels: string[] }>;
  tip?: TipRequest;
  /** SPRINT-16: minted once per shopping session; see lib/order-key.ts. */
  sessionNonce?: string;
};

function lineKey(itemId: string, selectedOptionIds: string[], customerNote: string | null | undefined): string {
  return `${itemId}::${[...selectedOptionIds].sort().join(",")}::${customerNote ?? ""}`;
}

function omitKey(line: CartLine): CartLineRequest & { item: MenuItemSummary; optionLabels: string[] } {
  return {
    itemId: line.itemId,
    quantity: line.quantity,
    selectedOptionIds: line.selectedOptionIds,
    customerNote: line.customerNote,
    item: line.item,
    optionLabels: line.optionLabels,
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
  }) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
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

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      tip,
      totalItems,
      addLine,
      updateQuantity,
      removeLine,
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
