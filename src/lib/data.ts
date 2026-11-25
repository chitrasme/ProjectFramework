import "server-only";
import { notFound } from "next/navigation";
import type { Stage } from "@prisma/client";
import { prisma } from "./db";
import type { SessionUser } from "./session";
import { canViewProject } from "./access";
import { computeStages, progressPercent, currentStage } from "./progress";

export async function getActiveYear(isDemo: boolean) {
  return (
    (await prisma.academicYear.findFirst({ where: { isDemo, isActive: true } })) ??
    (await prisma.academicYear.findFirst({ where: { isDemo }, orderBy: { startDate: "desc" } }))
  );
}

/** Year chosen with ?year=<id> (HOD year switcher), defaulting to the active year. */
export async function resolveYear(isDemo: boolean, yearId?: string) {
  if (yearId) {
    const y = await prisma.academicYear.findFirst({ where: { id: yearId, isDemo } });
    if (y) return y;
  }
  return getActiveYear(isDemo);
}

export const projectInclude = {
  members: { include: { user: { select: { id: true, name: true, rollNo: true, email: true } } }, orderBy: { isLeader: "desc" as const } },
  guide: { select: { id: true, name: true, email: true } },
  academicYear: true,
  extensions: true,
} as const;

/** Loads a project with its stage timeline, or 404s if the user may not see it. */
export async function loadProjectForUser(user: SessionUser, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
  if (!project) notFound();
  const scope = { isDemo: project.isDemo, guideId: project.guideId, memberIds: project.members.map((m) => m.userId) };
  if (!canViewProject(user, scope)) notFound();
  const [stages, submissions] = await Promise.all([
    prisma.stage.findMany({ where: { academicYearId: project.academicYearId }, orderBy: { order: "asc" } }),
    prisma.submission.findMany({
      where: { projectId },
      orderBy: [{ stageId: "asc" }, { version: "desc" }],
      include: { uploadedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
    }),
  ]);
  const views = computeStages(stages, submissions, project.extensions);
  return { project, scope, stages, submissions, views, progress: progressPercent(views), current: currentStage(views) };
}

/** Timeline summary for many projects at once (dashboards and reports). */
export async function summarizeProjects(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, ReturnType<typeof summarizeOne>>();
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, academicYearId: true, extensions: true },
  });
  const yearIds = [...new Set(projects.map((p) => p.academicYearId))];
  const [stages, submissions] = await Promise.all([
    prisma.stage.findMany({ where: { academicYearId: { in: yearIds } } }),
    prisma.submission.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, stageId: true, version: true, status: true, createdAt: true, marks: true, isLate: true },
    }),
  ]);
  const out = new Map<string, ReturnType<typeof summarizeOne>>();
  for (const p of projects) {
    out.set(
      p.id,
      summarizeOne(
        stages.filter((s) => s.academicYearId === p.academicYearId),
        submissions.filter((s) => s.projectId === p.id),
        p.extensions,
      ),
    );
  }
  return out;
}

function summarizeOne(
  stages: Stage[],
  subs: { stageId: string; version: number; status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; createdAt: Date; marks: number | null; isLate: boolean }[],
  extensions: Parameters<typeof computeStages>[2],
) {
  const views = computeStages(stages, subs, extensions);
  const approvedMarks = new Map<string, number>();
  for (const s of subs) if (s.status === "APPROVED" && s.marks != null) approvedMarks.set(s.stageId, s.marks);
  return {
    views,
    progress: progressPercent(views),
    current: currentStage(views),
    overdue: views.filter((v) => v.state === "OVERDUE").length,
    pendingReviews: views.filter((v) => v.state === "UNDER_REVIEW").length,
    totalMarks: [...approvedMarks.values()].reduce((a, b) => a + b, 0),
    maxMarks: views.reduce((a, v) => a + (v.stage.maxMarks), 0),
    lateSubmissions: subs.filter((s) => s.isLate).length,
  };
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}
