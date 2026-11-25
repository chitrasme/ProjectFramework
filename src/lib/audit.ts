import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export async function audit(
  actor: { id: string; isDemo: boolean } | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      isDemo: actor?.isDemo ?? false,
      action,
      entity,
      entityId: entityId ?? null,
      details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
