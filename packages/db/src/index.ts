// SPRINT-1 / SPRINT-2 / SPRINT-18.3: database package public surface
export { prisma, PrismaClient } from "./client";
export * from "./generated/prisma";
export { getStoreConfig, invalidateStoreConfigCache } from "./store-config";

// SPRINT-2: business date + open/closed
export { resolveBusinessDate, businessDateToUtcDate } from "./business-date";
export {
  evaluateOpenClosed,
  type EvaluateOpenClosedArgs,
  type OpenClosedResult,
  type OpenClosedHoursRow,
  type OpenClosedClosureRow,
} from "./open-closed";

// SPRINT-2: mappers
export {
  mapModifierOption,
  mapModifierGroup,
  mapMenuItemSummary,
  mapMenuItemDetail,
  mapMenuCategory,
  mapCategorySummary,
} from "./mappers/menu";
export { mapStoreStatus } from "./mappers/store";

// SPRINT-2: repositories
export {
  getFullMenu,
  getCategories,
  getItemById,
  getItemBySlugs,
  getFeaturedItems,
  getMostOrderedItems,
  getMenuEtag,
} from "./repositories/menu";
export { getStoreStatus } from "./repositories/store";
export { fetchItemsForQuote } from "./repositories/catalog";
export type { QuoteItemRow } from "./repositories/catalog";

// SPRINT-4: order-number allocation (must be called inside an interactive transaction)
export { allocateOrderNumber } from "./order-numbers";
export type { AllocateOrderNumberArgs, AllocatedOrderNumber } from "./order-numbers";

// SPRINT-4: customer input normalisation
export { normalizePhoneToE164, validateEmail } from "./customer";

// SPRINT-4: order persistence — pending-order creation, payment transitions, lookup
export {
  createPendingOrder,
  createPendingOrderGuarded,
  type DuplicateGuardOutcome,
  generateLookupToken,
  findOrderByIdempotencyKey,
  findOrderByLookupToken,
  findOrderByProcessorPaymentId,
  recordProcessorPaymentId,
  claimOrderForCharge,
  releaseChargeClaim,
  markOrderPaidAndAllocate,
  markOrderPaymentFailed,
  markOrderPaymentUnknown,
  getPublicOrderView,
} from "./repositories/orders";
export type {
  OrderWithLines,
  CreatePendingOrderArgs,
  CreatePendingOrderCustomer,
  MarkOrderPaidAndAllocateArgs,
  MarkOrderPaymentFailedArgs,
  MarkOrderPaymentUnknownArgs,
  ChargeClaim,
  PublicOrderView,
  PublicOrderLineView,
} from "./repositories/orders";

// SPRINT-4: refunds / cancellation / reconciliation (DB-only helpers; gateway wired at app/CLI)
export {
  findRefundByIdempotencyKey,
  reservedRefundCents,
  reservedRefundCentsByOrderIds,
  remainingAfterReservation,
  createPendingRefundRow,
  reserveRefundRow,
  completeRefundRow,
  applyRefundToOrder,
  bookRefundFromProcessor,
  cancelUnpaidOrder,
  markOrderCancelledAfterRefund,
  getOrderWithLines,
  OPEN_REFUND_STATUSES,
} from "./refunds";
export type { BookRefundResult } from "./refunds";
export {
  claimNextPrintJob,
  touchPrinterHeartbeat,
  recordPrintCompletion,
  sweepPrintJobs,
  reprintTicket,
  requeuePrintJob,
  cancelQueuedPrintJob,
  cancelOrphanPrintJobs,
  repairMissingPrintJobs,
  reportPrintQueue,
  isLegalPrintTransition,
  printRetryBackoffMs,
  renderReceiptPayload,
  toTicketOrderInput,
  IllegalPrintTransitionError,
} from "./print-jobs";
export type { PrintSweepConfig, PrintQueueReport, CompletionResult } from "./print-jobs";
export { runReconciliation, sweepAbandonedOrders } from "./reconcile";
export type { ReconcileFinding, GatewayPaymentProbe } from "./reconcile";
// SPRINT-18.3: per-attempt gateway record and the rate-limited gateway incident alert
export {
  recordPaymentAttempt,
  raisePaymentGatewayIncident,
  listPaymentAttempts,
  PAYMENT_GATEWAY_ALERT_WINDOW_MS,
} from "./payment-attempts";
export type { PaymentAttemptInput, PaymentAttemptClassificationValue } from "./payment-attempts";

// SPRINT-6: kitchen display — PIN auth, order status machine, queue, unacked alerts
export {
  hashPin,
  verifyPin,
  hashSessionToken,
  generateSessionToken,
  isPlausiblePin,
} from "./pin";
export {
  listKitchenRoster,
  signInWithPin,
  resolveKitchenSession,
  revokeKitchenSession,
  setStaffPin,
  PinInvalidError,
  PinLockedError,
  AccountDisabledError,
  SessionRequiredError,
  SessionExpiredError,
  SessionRevokedError,
} from "./staff-auth";
export type {
  PinAuthConfig,
  StaffRosterEntry,
  IssuedSession,
  ResolvedKitchenSession,
} from "./staff-auth";
export {
  ORDER_STATUS_ALLOWED,
  KDS_TARGET_STATUSES,
  isLegalOrderTransition,
  isKdsTargetStatus,
  applyOrderTransition,
  applyAutomaticPrintTransition,
  applyAdminStatusCorrection,
  IllegalOrderTransitionError,
  StaleOrderTransitionError,
} from "./order-status";
export type { OrderTransitionSource, ApplyOrderTransitionArgs, ApplyAdminStatusCorrectionArgs, KdsTargetStatus } from "./order-status";
export { listKitchenQueue, getKitchenOrder, KITCHEN_QUEUE_STATUSES, toKitchenQueueOrder } from "./kitchen-queue";
export {
  enqueueUnacknowledgedKitchenAlerts,
  enqueueUnacknowledgedOrderAlert,
  hasUnacknowledgedOrderAlert,
} from "./kitchen-alerts";

// SPRINT-7: background job worker store — claim, recovery, dead-letter, ops, SMS suppression
export {
  claimDueJobs,
  recoverStrandedJobs,
  recordJobProviderMessageId,
  completeJob,
  recordAttemptFailure,
  deadLetterJob,
  reportBackgroundJobs,
  inspectBackgroundJob,
  retryDeadJob,
  retryDeadJobsByType,
  cancelBackgroundJob,
  countRecentDeliveredAlerts,
  payloadOf,
} from "./jobs";
export type {
  ClaimedBackgroundJob,
  AttemptFailureResult,
  BackgroundQueueReport,
  BackgroundJobCounts,
} from "./jobs";

// SPRINT-2: menu cache
export {
  getCachedFullMenu,
  invalidateMenuCache,
  invalidateAllPublicCaches,
} from "./menu-cache";

// SPRINT-8: admin back-office — password auth, menu/store mutations, orders, reports
export { dollarsToCents } from "./seed/currency";
export {
  hashPassword,
  verifyPassword,
  assertPasswordPolicy,
  normalizeEmail,
  generateAdminSessionToken,
  PasswordTooWeakError,
} from "./password";
export {
  signInWithPassword,
  resolveAdminSession,
  revokeAdminSession,
  revokeUserSessions,
  setAdminPassword,
  assertMinRole,
  PasswordInvalidError,
  PasswordLockedError,
  AdminForbiddenError,
} from "./admin-auth";
export type {
  PasswordAuthConfig,
  ResolvedAdminSession,
  IssuedAdminSession,
} from "./admin-auth";
export { recordAdminAudit, listAdminAudit } from "./admin-audit";
export { redactPhone, redactEmail, redactPaymentId, maskName } from "./admin-redact";
export {
  parseCurrencyInput,
  AdminValidationError,
  listAdminCategories,
  getCategoryWithActiveItemCount,
  createCategory,
  updateCategory,
  listAdminItems,
  getAdminItem,
  createItem,
  updateItem,
  setItemSoldOut,
  clearAllSoldOut,
  setCuration,
  listAdminModifierGroups,
  getAdminModifierGroup,
  createModifierGroup,
  updateModifierGroup,
  createModifierOption,
  updateModifierOption,
  replaceItemBindings,
  replaceGroupBindings,
} from "./admin-menu";
export {
  updateStoreConfig,
  listStoreHours,
  upsertStoreHours,
  listStoreClosures,
  createStoreClosure,
  updateStoreClosure,
  deleteStoreClosure,
} from "./admin-store";
export type { StoreConfigPatch } from "./admin-store";
export {
  todayRange,
  formatStoreDateTime,
  listAdminOrders,
  getAdminOrderDetail,
  remainingRefundableCents,
  assertRefundAmount,
} from "./admin-orders";
export { salesReport, salesReportToCsv } from "./admin-reports";
export type { SalesReport, SalesDayRow, ItemSalesRow } from "./admin-reports";
export {
  pinTakenByAnotherActive,
  generateDistinctPin,
  allocateUniquePin,
  listAdminUsers,
  listUserSessions,
  createAdminUser,
  updateAdminUser,
  setUserPin,
  PinConflictError,
} from "./admin-staff";
export { getOperationsSnapshot } from "./admin-dashboard";
export { maybeRunScheduledReconciliation, getLatestReconciliationRun } from "./scheduled-reconcile";
export type { ScheduledReconcileResult } from "./scheduled-reconcile";
// SPRINT-12
export {
  evaluateTradingState,
  defaultOverrideExpiry,
  TradingOverrideKind,
  type TradingClosedReason,
  type TradingOverrideRow,
  type EvaluateTradingStateArgs,
  type TradingStateResult,
} from "./trading-state";
export {
  listTradingOverrides,
  createTradingOverride,
  cancelTradingOverride,
  type CreateTradingOverrideInput,
} from "./admin-trading";
export { reorderEntities } from "./admin-menu";

// SPRINT-18: SEO configuration — snapshot loader, the one write path, sitemap lastmod source
export {
  loadSeoSnapshot,
  saveSeoConfig,
  diffSeoChanges,
  getMenuLastModified,
  SeoVersionConflictError,
  type SeoFieldChange,
} from "./seo";
