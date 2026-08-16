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

type StoredCart = {
  lines: Array<CartLineRequest & { item: MenuItemSummary; optionLabels: string[] }>;
  tip?: TipRequest;
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
  clear: () => void;
  toCartRequest: () => { lines: CartLineRequest[]; tip?: TipRequest };
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [tip, setTipState] = useState<TipRequest | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

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
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [lines, tip, hydrated]);

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
      if (quantity <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, quantity } : l));
    });
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const setTip = useCallback((next: TipRequest | undefined) => {
    setTipState(next);
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setTipState(undefined);
  }, []);

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
    () => ({ lines, tip, totalItems, addLine, updateQuantity, removeLine, setTip, clear, toCartRequest }),
    [lines, tip, totalItems, addLine, updateQuantity, removeLine, setTip, clear, toCartRequest],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
