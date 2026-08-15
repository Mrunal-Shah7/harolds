// SPRINT-8: attributable back-office actions — who, what, when; no secrets in the summary.
import { prisma } from "./client";

export type RecordAdminAuditArgs = {
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
};

export async function recordAdminAudit(args: RecordAdminAuditArgs): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      userId: args.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId ?? null,
      summary: args.summary,
    },
  });
}

export async function listAdminAudit(args?: { take?: number; userId?: string }) {
  return prisma.adminAuditLog.findMany({
    where: args?.userId ? { userId: args.userId } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(args?.take ?? 100, 500),
    include: { user: { select: { id: true, displayName: true, email: true, role: true } } },
  });
}
