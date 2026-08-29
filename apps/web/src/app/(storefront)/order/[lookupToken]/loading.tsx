// SPRINT-17: route-level loading UI (design.md §12). Next streams this immediately while the
// page's data resolves, so the route always has a visible loading state instead of nothing.
import { OrderSkeleton } from "@/components/storefront/page-skeletons";

export default function Loading() {
  return <OrderSkeleton />;
}
