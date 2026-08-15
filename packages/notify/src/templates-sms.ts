// SPRINT-7: transactional SMS copy — order confirmation and order ready. No marketing.
import { formatStoreLocalTime } from "./time";

export type ConfirmationSmsInput = {
  storeName: string;
  orderNumber: string;
  estimatedReadyAt: Date;
  timeZone: string;
};

export function renderOrderConfirmationSms(input: ConfirmationSmsInput): string {
  const ready = formatStoreLocalTime(input.estimatedReadyAt, input.timeZone);
  return `${input.storeName}: order ${input.orderNumber} is confirmed. Ready around ${ready}.`;
}

export function renderOrderReadySms(orderNumber: string): string {
  return `Order ${orderNumber} is ready for pickup.`;
}

export function smsContainsMoney(body: string): boolean {
  return /\$\d|\d+\.\d{2}|USD|subtotal|tax|total/i.test(body);
}
