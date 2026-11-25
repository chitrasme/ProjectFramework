import type { Role } from "@prisma/client";

// Pure authorization rules, shared by pages, server actions and the file download route.
// Demo and real data never mix: a demo user only ever sees demo records and vice versa.

export type Actor = { id: string; role: Role; isDemo: boolean };
export type ProjectScope = { isDemo: boolean; guideId: string | null; memberIds: string[] };

export function canViewProject(user: Actor, p: ProjectScope) {
  if (user.isDemo !== p.isDemo) return false;
  if (user.role === "HOD") return true;
  if (user.role === "GUIDE") return p.guideId === user.id;
  return p.memberIds.includes(user.id);
}

export function canReviewProject(user: Actor, p: ProjectScope) {
  if (user.isDemo !== p.isDemo) return false;
  if (user.role === "HOD") return true;
  return user.role === "GUIDE" && p.guideId === user.id;
}

export function canSubmitForProject(user: Actor, p: ProjectScope) {
  return user.isDemo === p.isDemo && user.role === "STUDENT" && p.memberIds.includes(user.id);
}

export function canManageDepartment(user: Actor) {
  return user.role === "HOD";
}
