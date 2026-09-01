-- Per-item purchase ceiling, set by the admin on the Menu screen.
-- Nullable: null means this item has no ceiling of its own and only the structural
-- CART_LIMITS apply. Enforced server-side in validateCart, summed across the whole cart so
-- splitting one item over several lines cannot walk past it.
ALTER TABLE "MenuItem" ADD COLUMN "maxQuantityPerOrder" INTEGER;
