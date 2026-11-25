"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canReviewProject, canViewProject } from "@/lib/access";
import { audit } from "@/lib/audit";
import { notify, projectMemberIds } from "@/lib/notify";
import { computeStages } from "@/lib/progress";
import { getActiveYear } from "@/lib/data";
import { parseLocalInput } from "@/lib/time";
import type { ActionResult } from "@/components/action-form";

async function loadScoped(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true, extensions: true } });
  if (!project) return null;
  return { project, scope: { isDemo: project.isDemo, guideId: project.guideId, memberIds: project.members.map((m) => m.userId) } };
}

async function maybeComplete(projectId: string) {
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { extensions: true } });
  const [stages, subs] = await Promise.all([
    prisma.stage.findMany({ where: { academicYearId: p.academicYearId } }),
    prisma.submission.findMany({ where: { projectId } }),
  ]);
  const views = computeStages(stages, subs, p.extensions);
  const done = views.length > 0 && views.every((v) => v.state === "APPROVED");
  if (done && p.status !== "COMPLETED") await prisma.project.update({ where: { id: projectId }, data: { status: "COMPLETED" } });
  if (!done && p.status === "COMPLETED") await prisma.project.update({ where: { id: projectId }, data: { status: "ACTIVE" } });
}

const reviewSchema = z.object({
  submissionId: z.string().min(1),
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  comment: z.string().trim().max(4000).default(""),
  marks: z.string().optional(),
});

export async function reviewSubmissionAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("GUIDE", "HOD");
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Choose a decision." };
  const { submissionId, decision, comment } = parsed.data;
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, include: { stage: true } });
  if (!sub) return { error: "Submission not found." };
  const loaded = await loadScoped(sub.projectId);
  if (!loaded || !canReviewProject(user, loaded.scope)) return { error: "You cannot review this project." };
  if (sub.status !== "PENDING") return { error: "This version has already been reviewed." };
  const latest = await prisma.submission.findFirst({ where: { projectId: sub.projectId, stageId: sub.stageId }, orderBy: { version: "desc" } });
  if (latest?.id !== sub.id) return { error: "A newer version exists; review that one instead." };
  if (decision !== "APPROVED" && comment.length < 3) return { error: "Add a comment explaining what needs to change." };

  let marks: number | null = null;
  if (parsed.data.marks && parsed.data.marks.trim() !== "") {
    marks = Number(parsed.data.marks);
    if (!Number.isInteger(marks) || marks < 0 || marks > sub.stage.maxMarks) return { error: `Marks must be a whole number from 0 to ${sub.stage.maxMarks}.` };
  }
  await prisma.submission.update({
    where: { id: sub.id },
    data: { status: decision, reviewComment: comment || null, marks: decision === "APPROVED" ? marks : null, reviewedById: user.id, reviewedAt: new Date() },
  });
  await audit(user, `submission.${decision.toLowerCase()}`, "Submission", sub.id, { stage: sub.stage.name, version: sub.version, marks });
  const label = { APPROVED: "approved", CHANGES_REQUESTED: "needs changes", REJECTED: "was rejected" }[decision];
  await notify(await projectMemberIds(sub.projectId), {
    title: `${sub.stage.name} ${label}`,
    body: comment ? `${user.name}: ${comment.slice(0, 300)}` : `${user.name} reviewed version ${sub.version}.`,
    link: `/projects/${sub.projectId}/stages/${sub.stageId}`, kind: "REVIEW",
  });
  await maybeComplete(sub.projectId);
  revalidatePath(`/projects/${sub.projectId}`);
  return { ok: "Review saved and the team has been notified." };
}

export async function completeStageAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("GUIDE", "HOD");
  const projectId = String(form.get("projectId"));
  const stageId = String(form.get("stageId"));
  const comment = String(form.get("comment") ?? "").trim().slice(0, 2000);
  const loaded = await loadScoped(projectId);
  if (!loaded || !canReviewProject(user, loaded.scope)) return { error: "You cannot update this project." };
  if (loaded.project.status !== "ACTIVE") return { error: "The project is not active." };
  const stages = await prisma.stage.findMany({ where: { academicYearId: loaded.project.academicYearId } });
  const subs = await prisma.submission.findMany({ where: { projectId } });
  const view = computeStages(stages, subs, loaded.project.extensions).find((v) => v.stage.id === stageId);
  if (!view) return { error: "Stage not found." };
  if (view.state === "APPROVED") return { error: "Already complete." };
  if (view.state === "LOCKED") return { error: "Earlier stages must be completed first." };
  if (view.stage.requiresDocument) return { error: "This stage needs a document upload and review." };
  await prisma.submission.create({
    data: {
      projectId, stageId, version: view.latestVersion + 1, uploadedById: user.id, status: "APPROVED",
      reviewedById: user.id, reviewedAt: new Date(), reviewComment: comment || "Marked complete.", note: "Completed by reviewer",
    },
  });
  await audit(user, "stage.complete", "Stage", stageId, { projectId, stage: view.stage.name });
  await notify(await projectMemberIds(projectId), { title: `${view.stage.name} completed`, body: `${user.name} marked this stage complete.`, link: `/projects/${projectId}` });
  await maybeComplete(projectId);
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Stage marked complete." };
}

export async function extendDeadlineAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("GUIDE", "HOD");
  const projectId = String(form.get("projectId"));
  const stageId = String(form.get("stageId"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  const raw = String(form.get("newDeadline") ?? "");
  const loaded = await loadScoped(projectId);
  if (!loaded || !canReviewProject(user, loaded.scope)) return { error: "You cannot change deadlines for this project." };
  const stage = await prisma.stage.findFirst({ where: { id: stageId, academicYearId: loaded.project.academicYearId } });
  if (!stage) return { error: "Stage not found." };
  if (form.get("clear") === "1") {
    await prisma.deadlineExtension.deleteMany({ where: { projectId, stageId } });
    await audit(user, "deadline.extension_removed", "Stage", stageId, { projectId });
    revalidatePath(`/projects/${projectId}`);
    return { ok: "Extension removed; the department deadline applies again." };
  }
  const newDeadline = parseLocalInput(raw);
  if (!newDeadline) return { error: "Choose a new deadline." };
  if (newDeadline.getTime() < Date.now()) return { error: "The new deadline must be in the future." };
  await prisma.deadlineExtension.upsert({
    where: { projectId_stageId: { projectId, stageId } },
    create: { projectId, stageId, newDeadline, reason, grantedById: user.id },
    update: { newDeadline, reason, grantedById: user.id },
  });
  await prisma.reminderLog.deleteMany({ where: { projectId, stageId } }); // allow fresh reminders for the new date
  await audit(user, "deadline.extend", "Stage", stageId, { projectId, newDeadline: newDeadline.toISOString(), reason });
  await notify(await projectMemberIds(projectId), {
    title: `Deadline extended: ${stage.name}`,
    body: `New deadline ${newDeadline.toLocaleDateString("en-IN")}${reason ? ` – ${reason}` : ""}.`,
    link: `/projects/${projectId}/stages/${stageId}`, kind: "DEADLINE",
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Deadline extended and the team notified." };
}

export async function addRemarkAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const projectId = String(form.get("projectId"));
  const body = String(form.get("body") ?? "").trim();
  if (body.length < 2) return { error: "Write a remark first." };
  const loaded = await loadScoped(projectId);
  if (!loaded || !canViewProject(user, loaded.scope)) return { error: "Project not found." };
  await prisma.remark.create({ data: { projectId, authorId: user.id, body: body.slice(0, 4000) } });
  await audit(user, "remark.add", "Project", projectId);
  const recipients = [...loaded.scope.memberIds, loaded.project.guideId].filter((id) => id && id !== user.id);
  await notify(recipients, { title: `New remark on ${loaded.project.teamName}`, body: `${user.name}: ${body.slice(0, 200)}`, link: `/projects/${projectId}#remarks` });
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Remark posted." };
}

const eventSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(150),
  description: z.string().trim().max(1000).default(""),
  startsAt: z.string().min(1, "Choose a date and time."),
  kind: z.enum(["EVENT", "REVIEW", "MEETING", "HOLIDAY"]).default("EVENT"),
  projectId: z.string().optional(),
});

export async function addEventAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("GUIDE", "HOD");
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const startsAt = parseLocalInput(d.startsAt);
  if (!startsAt) return { error: "Invalid date." };
  let yearId: string;
  let recipients: string[] = [];
  const projectId = d.projectId || null;
  if (projectId) {
    const loaded = await loadScoped(projectId);
    if (!loaded || !canReviewProject(user, loaded.scope)) return { error: "You cannot schedule events for this project." };
    yearId = loaded.project.academicYearId;
    recipients = loaded.scope.memberIds;
  } else {
    if (user.role !== "HOD") return { error: "Only the HOD can add department-wide events. Pick one of your teams." };
    const year = await getActiveYear(user.isDemo);
    if (!year) return { error: "No academic year exists." };
    yearId = year.id;
    const all = await prisma.user.findMany({ where: { isDemo: user.isDemo, active: true, id: { not: user.id } }, select: { id: true } });
    recipients = all.map((u) => u.id);
  }
  const ev = await prisma.calendarEvent.create({
    data: { academicYearId: yearId, projectId, title: d.title, description: d.description, startsAt, kind: d.kind, createdById: user.id },
  });
  await audit(user, "event.create", "CalendarEvent", ev.id, { title: d.title, projectId });
  await notify(recipients, { title: `Scheduled: ${d.title}`, body: startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), link: "/calendar", kind: "EVENT" });
  revalidatePath("/calendar");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  return { ok: "Event added and participants notified." };
}

export async function deleteEventAction(form: FormData) {
  const user = await requireUser("GUIDE", "HOD");
  const id = String(form.get("eventId"));
  const ev = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!ev || (ev.createdById !== user.id && user.role !== "HOD")) return;
  const year = await prisma.academicYear.findUnique({ where: { id: ev.academicYearId } });
  if (year?.isDemo !== user.isDemo) return;
  await prisma.calendarEvent.delete({ where: { id } });
  await audit(user, "event.delete", "CalendarEvent", id, { title: ev.title });
  revalidatePath("/calendar");
}
