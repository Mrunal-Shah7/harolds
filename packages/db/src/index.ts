// SPRINT-1 / SPRINT-2: database package public surface
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
  generateLookupToken,
  findOrderByIdempotencyKey,
  findOrderByLookupToken,
  findOrderByProcessorPaymentId,
  recordProcessorPaymentId,
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
  PublicOrderView,
  PublicOrderLineView,
} from "./repositories/orders";

// SPRINT-4: refunds / cancellation / reconciliation (DB-only helpers; Square wired at app/CLI)
export {
  findRefundByIdempotencyKey,
  createPendingRefundRow,
  completeRefundRow,
  applyRefundToOrder,
  cancelUnpaidOrder,
  markOrderCancelledAfterRefund,
  getOrderWithLines,
} from "./refunds";
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
  renderPayloadsForOrder,
  toTicketOrderInput,
  IllegalPrintTransitionError,
} from "./print-jobs";
export type { PrintSweepConfig, PrintQueueReport, CompletionResult } from "./print-jobs";
export { runReconciliation, sweepAbandonedOrders } from "./reconcile";
export type { ReconcileFinding, SquarePaymentProbe } from "./reconcile";

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
  isPhoneSuppressed,
  setSmsSuppression,
  recordSmsInboundEvent,
  payloadOf,
} from "./jobs";
export type {
  ClaimedBackgroundJob,
  AttemptFailureResult,
  BackgroundQueueReport,
  BackgroundJobCounts,
  SmsInboundKind,
  RecordSmsInboundResult,
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
