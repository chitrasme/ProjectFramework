import { PrismaClient } from "@prisma/client";

/** Snapshot of every table as JSON. `isDemo` limits it to demo or real data; null = everything. */
export async function snapshot(prisma: PrismaClient, opts: { isDemo: boolean | null; includePasswordHashes: boolean }) {
  const demo = opts.isDemo;
  const userWhere = demo === null ? {} : { isDemo: demo };
  const yearWhere = demo === null ? {} : { isDemo: demo };
  const projWhere = demo === null ? {} : { project: { isDemo: demo } };
  const [users, years, stages, projects, members, submissions, extensions, remarks, events, notifications, auditLogs] = await Promise.all([
    prisma.user.findMany({ where: userWhere }),
    prisma.academicYear.findMany({ where: yearWhere }),
    prisma.stage.findMany({ where: demo === null ? {} : { academicYear: { isDemo: demo } } }),
    prisma.project.findMany({ where: demo === null ? {} : { isDemo: demo } }),
    prisma.teamMember.findMany({ where: projWhere }),
    prisma.submission.findMany({ where: projWhere }),
    prisma.deadlineExtension.findMany({ where: projWhere }),
    prisma.remark.findMany({ where: projWhere }),
    prisma.calendarEvent.findMany({ where: demo === null ? {} : { academicYear: { isDemo: demo } } }),
    prisma.notification.findMany({ where: demo === null ? {} : { user: { isDemo: demo } } }),
    prisma.auditLog.findMany({ where: demo === null ? {} : { isDemo: demo } }),
  ]);
  return {
    format: "projecttrack-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    scope: demo === null ? "all" : demo ? "demo" : "real",
    counts: { users: users.length, years: years.length, stages: stages.length, projects: projects.length, submissions: submissions.length },
    data: {
      users: opts.includePasswordHashes ? users : users.map(({ passwordHash: _ph, ...u }) => u), // eslint-disable-line @typescript-eslint/no-unused-vars
      academicYears: years, stages, projects, teamMembers: members, submissions, deadlineExtensions: extensions,
      remarks, calendarEvents: events, notifications, auditLogs,
    },
  };
}
