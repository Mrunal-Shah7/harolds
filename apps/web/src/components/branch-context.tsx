"use client";

// Branch identity for client components. The root layout reads it on the server
// (getBranchConfig, from STORE_BRANCH_NAME) and hands it down here, so no client bundle imports
// the server-only config package and nothing branch-specific is hardcoded in a component.
import { createContext, useContext, type ReactNode } from "react";
import type { BranchConfig } from "@harolds/config";

const BranchContext = createContext<BranchConfig | null>(null);

export function BranchProvider({ value, children }: { value: BranchConfig; children: ReactNode }) {
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchConfig {
  const value = useContext(BranchContext);
  if (!value) throw new Error("useBranch must be used inside <BranchProvider> (mounted by the root layout)");
  return value;
}
