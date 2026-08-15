// SPRINT-3: Phase 7 orderability — store state only; line availability is Phase 4 validate.
import { ApiErrorCode, type ApiErrorCode as ApiErrorCodeType } from "@harolds/types";

export type OrderabilityInput = {
  isOpen: boolean;
  acceptingOrders: boolean;
  /**
   * Sold-out / unavailable lines are rejected in validateCart (Phase 4), not here.
   * Kept on the args bag so callers remember the separation of concerns.
   */
  hasSoldOutInCart?: boolean;
};

export type OrderabilityResult = {
  orderable: boolean;
  blockingReasons: ApiErrorCodeType[];
};

/**
 * Decide whether checkout may proceed given store hours / accepting-orders switch.
 * Never rejects sold-out lines here — those are validation reasons, not orderability.
 */
export function evaluateOrderability(args: OrderabilityInput): OrderabilityResult {
  const blockingReasons: ApiErrorCodeType[] = [];

  if (!args.isOpen) {
    blockingReasons.push(ApiErrorCode.STORE_CLOSED);
  }
  if (!args.acceptingOrders) {
    blockingReasons.push(ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS);
  }

  return {
    orderable: blockingReasons.length === 0,
    blockingReasons,
  };
}
