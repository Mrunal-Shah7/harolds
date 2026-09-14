import { prisma } from "./client";
const o = await prisma.order.findUnique({
  where: { id: "cmu1og0p40009ur1ohfw2wj7d" },
  select: {
    orderNumber: true, status: true, paymentStatus: true,
    processorPaymentId: true, chargeClaimedAt: true, cardLast4: true,
    totalCents: true, refundedCents: true, paidAt: true, paymentFailureReason: true,
  },
});
console.log("ORDER:", o);
const jobs = await prisma.printJob.findMany({
  where: { orderId: "cmu1og0p40009ur1ohfw2wj7d" },
  select: { target: true, status: true },
});
console.log("PRINT JOBS:", jobs);
