import "server-only";
import { prisma } from "./db";
import { computeStages } from "./progress";
import { notify, projectMemberIds } from "./notify";

const DAY = 86_400_000;

/**
 * Sends deadline reminders for every active project:
 *  DUE_3D – deadline within 3 days, DUE_1D – within 24 hours, OVERDUE – deadline passed (also tells the guide).
 * Each kind is sent at most once per project and stage (ReminderLog), so the job can run as often as you like.
 */
export async function runReminders(now = new Date()) {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE", academicYear: { archived: false } },
    include: { extensions: true, reminders: true },
  });
  const yearIds = [...new Set(projects.map((p) => p.academicYearId))];
  const [stages, subs] = await Promise.all([
    prisma.stage.findMany({ where: { academicYearId: { in: yearIds } } }),
    prisma.submission.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, select: { projectId: true, stageId: true, version: true, status: true, createdAt: true } }),
  ]);
  let sent = 0;
  for (const p of projects) {
    const views = computeStages(stages.filter((s) => s.academicYearId === p.academicYearId), subs.filter((s) => s.projectId === p.id), p.extensions, now);
    for (const v of views) {
      if (!v.deadline || !v.stage.requiresDocument) continue;
      if (v.state === "APPROVED" || v.state === "UNDER_REVIEW" || v.state === "LOCKED") continue;
      const ms = v.deadline.getTime() - now.getTime();
      const kind = ms < 0 ? "OVERDUE" : ms <= DAY ? "DUE_1D" : ms <= 3 * DAY ? "DUE_3D" : null;
      if (!kind || p.reminders.some((r) => r.stageId === v.stage.id && r.kind === kind)) continue;
      try {
        await prisma.reminderLog.create({ data: { projectId: p.id, stageId: v.stage.id, kind } });
      } catch {
        continue; // another run already sent it
      }
      const members = await projectMemberIds(p.id);
      const when = v.deadline.toLocaleString("en-IN", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
      if (kind === "OVERDUE") {
        await notify(members, { title: `Overdue: ${v.stage.name}`, body: `The deadline (${when}) has passed. Upload as soon as possible; late uploads are flagged.`, link: `/projects/${p.id}/stages/${v.stage.id}`, kind: "REMINDER" });
        await notify([p.guideId], { title: `${p.teamName} missed a deadline`, body: `${v.stage.name} was due ${when}.`, link: `/projects/${p.id}`, kind: "REMINDER" });
      } else {
        await notify(members, { title: `Due ${kind === "DUE_1D" ? "within 24 hours" : "in 3 days"}: ${v.stage.name}`, body: `Deadline: ${when}.`, link: `/projects/${p.id}/stages/${v.stage.id}`, kind: "REMINDER" });
      }
      sent++;
    }
  }
  return { projects: projects.length, sent };
}
