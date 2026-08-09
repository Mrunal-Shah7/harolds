// SPRINT-1: database package public surface
export { prisma, PrismaClient } from "./client";
export * from "./generated/prisma";
export { getStoreConfig, invalidateStoreConfigCache } from "./store-config";
