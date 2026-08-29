// SPRINT-12: trading state precedence — switch > override > schedule. Single source of truth.
/**
 * Precedence (authoritative, do not reimplement elsewhere):
 *   1. acceptingOrders switch OFF → not accepting (authoritative over override and schedule).
 *   2. Active trading override → authoritative over the weekly schedule + closures for isOpen.
 *   3. Weekly hours + one-off closures → base schedule.
 *
 * The store-status endpoint reports which control is the reason when closed / not accepting.
 */
import { DateTime } from "luxon";
import { evaluateOpenClosed, type OpenClosedHoursRow, type OpenClosedClosureRow } from "./open-closed";
import { resolveBusinessDate } from "./business-date";

export const TradingOverrideKind = {
  CLOSE_EARLY: "CLOSE_EARLY",
  OPEN_LATE: "OPEN_LATE",
  CLOSED_REST_OF_DAY: "CLOSED_REST_OF_DAY",
  OPEN_ANYWAY: "OPEN_ANYWAY",
} as const;
export type TradingOverrideKind = (typeof TradingOverrideKind)[keyof typeof TradingOverrideKind];

export type TradingOverrideRow = {
  id: string;
  businessDate: string; // YYYY-MM-DD
  kind: TradingOverrideKind;
  openTime: string | null;
  closeTime: string | null;
  customerMessage: string | null;
  expiresAt: Date;
  cancelledAt: Date | null;
};

/** Machine-readable reason for why trading is blocked or constrained. */
export type TradingClosedReason =
  | "ACCEPTING_ORDERS_OFF"
  | "OVERRIDE_CLOSED_REST_OF_DAY"
  | "OVERRIDE_CLOSE_EARLY"
  | "OVERRIDE_OPEN_LATE"
  | "SCHEDULE_CLOSED"
  | "CLOSURE_DATE"
  | null;

export type EvaluateTradingStateArgs = {
  instant: Date;
  timeZone: string;
  orderNumberResetHour: number;
  acceptingOrders: boolean;
  hours: OpenClosedHoursRow[];
  closures: OpenClosedClosureRow[];
  overrides: TradingOverrideRow[];
};

export type TradingStateResult = {
  /** Schedule/override open window (ignores acceptingOrders). */
  isOpen: boolean;
  nextOpenAt: Date | null;
  acceptingOrders: boolean;
  /** Why the store appears closed or paused to customers; null when open and accepting. */
  closedReason: TradingClosedReason;
  activeOverride: TradingOverrideRow | null;
};

function parseTimeMinutes(t: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!match) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
}

function endOfBusinessDateUtc(
  businessDate: string,
  timeZone: string,
  resetHour: number,
): Date {
  // Business date ends at the next calendar day's resetHour in store local time.
  const start = DateTime.fromISO(businessDate, { zone: timeZone }).startOf("day");
  const endLocal = start.plus({ days: 1 }).set({
    hour: resetHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  return endLocal.toUTC().toJSDate();
}

/** Default expiry for a new override: end of the business date it applies to. */
export function defaultOverrideExpiry(
  businessDate: string,
  timeZone: string,
  orderNumberResetHour: number,
): Date {
  return endOfBusinessDateUtc(businessDate, timeZone, orderNumberResetHour);
}

function activeOverridesFor(
  args: EvaluateTradingStateArgs,
  businessDate: string,
): TradingOverrideRow[] {
  const now = args.instant.getTime();
  return args.overrides.filter(
    (o) =>
      o.businessDate === businessDate &&
      o.cancelledAt == null &&
      o.expiresAt.getTime() > now,
  );
}

function applyOverrideToOpen(
  scheduleOpen: boolean,
  localMinutes: number,
  override: TradingOverrideRow | null,
): { isOpen: boolean; reason: TradingClosedReason } {
  if (!override) {
    return { isOpen: scheduleOpen, reason: scheduleOpen ? null : "SCHEDULE_CLOSED" };
  }

  switch (override.kind) {
    case TradingOverrideKind.CLOSED_REST_OF_DAY:
      return { isOpen: false, reason: "OVERRIDE_CLOSED_REST_OF_DAY" };
    case TradingOverrideKind.CLOSE_EARLY: {
      if (!override.closeTime) return { isOpen: false, reason: "OVERRIDE_CLOSE_EARLY" };
      const close = parseTimeMinutes(override.closeTime);
      if (localMinutes >= close) {
        return { isOpen: false, reason: "OVERRIDE_CLOSE_EARLY" };
      }
      // Still before early close — follow schedule (must have been open).
      return {
        isOpen: scheduleOpen,
        reason: scheduleOpen ? null : "SCHEDULE_CLOSED",
      };
    }
    case TradingOverrideKind.OPEN_LATE: {
      if (!override.openTime) return { isOpen: false, reason: "OVERRIDE_OPEN_LATE" };
      const open = parseTimeMinutes(override.openTime);
      if (localMinutes < open) {
        return { isOpen: false, reason: "OVERRIDE_OPEN_LATE" };
      }
      // Past the late-open time — open if the schedule would be (or force open for the day window).
      return {
        isOpen: scheduleOpen || true,
        reason: null,
      };
    }
    case TradingOverrideKind.OPEN_ANYWAY: {
      if (!override.openTime || !override.closeTime) {
        return { isOpen: scheduleOpen, reason: scheduleOpen ? null : "SCHEDULE_CLOSED" };
      }
      const open = parseTimeMinutes(override.openTime);
      const close = parseTimeMinutes(override.closeTime);
      const inWindow =
        close > open
          ? localMinutes >= open && localMinutes < close
          : localMinutes >= open || localMinutes < close;
      if (inWindow) return { isOpen: true, reason: null };
      return { isOpen: scheduleOpen, reason: scheduleOpen ? null : "SCHEDULE_CLOSED" };
    }
    default:
      return { isOpen: scheduleOpen, reason: scheduleOpen ? null : "SCHEDULE_CLOSED" };
  }
}

/**
 * Evaluate trading state with documented precedence.
 */
export function evaluateTradingState(args: EvaluateTradingStateArgs): TradingStateResult {
  const businessDate = resolveBusinessDate(
    args.instant,
    args.timeZone,
    args.orderNumberResetHour,
  );
  const local = DateTime.fromJSDate(args.instant, { zone: "utc" }).setZone(args.timeZone);
  const localMinutes = local.hour * 60 + local.minute;

  const schedule = evaluateOpenClosed({
    instant: args.instant,
    timeZone: args.timeZone,
    hours: args.hours,
    closures: args.closures,
  });

  // Prefer the most recently created active override (list should be sorted desc by createdAt).
  const active = activeOverridesFor(args, businessDate)[0] ?? null;
  const overridden = applyOverrideToOpen(schedule.isOpen, localMinutes, active);

  // Closure-date refinement when schedule says closed and no override forced open.
  let closedReason = overridden.reason;
  if (
    !overridden.isOpen &&
    !active &&
    args.closures.some((c) => c.date === local.toISODate())
  ) {
    closedReason = "CLOSURE_DATE";
  }

  // Switch is authoritative over override.
  if (!args.acceptingOrders) {
    return {
      isOpen: overridden.isOpen,
      nextOpenAt: overridden.isOpen ? null : schedule.nextOpenAt,
      acceptingOrders: false,
      closedReason: "ACCEPTING_ORDERS_OFF",
      activeOverride: active,
    };
  }

  return {
    isOpen: overridden.isOpen,
    nextOpenAt: overridden.isOpen ? null : schedule.nextOpenAt,
    acceptingOrders: true,
    closedReason: overridden.isOpen ? null : closedReason,
    activeOverride: active,
  };
}
