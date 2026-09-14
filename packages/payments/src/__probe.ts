import { createPayment } from "@harolds/payments";
const out = await createPayment({
  paymentToken: "00000000-000000-000000-000000000000",
  amountCents: 32,
  correlationId: "pay:probe-decline",
  orderId: "probe-decline-code",
  orderReference: "H-DECLINE",
});
console.log("OUTCOME:", JSON.stringify(out, null, 2));
