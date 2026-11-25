"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getActiveYear } from "@/lib/data";
import { canSubmitForProject } from "@/lib/access";
import { audit } from "@/lib/audit";
import { notify, hodIds, projectMemberIds } from "@/lib/notify";
import { computeStages, canSubmit, isLate } from "@/lib/progress";
import { makeKey, putFile } from "@/lib/storage";
import type { ActionResult } from "@/components/action-form";

const MAX_TEAM = Number(process.env.MAX_TEAM_SIZE || 4);

const projectSchema = z.object({
  teamName: z.string().trim().min(2, "Enter a team name.").max(60),
  title: z.string().trim().min(5, "Enter a project title (at least 5 characters).").max(200),
  abstract: z.string().trim().max(3000).default(""),
  domain: z.string().trim().max(80).default(""),
  technologies: z.string().trim().max(200).default(""),
  members: z.string().default(""),
});

export async function createProjectAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("STUDENT");
  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const year = await getActiveYear(user.isDemo);
  if (!year) return { error: "No academic year is open yet. Ask your HOD." };

  const rollNos = [...new Set(d.members.split(/[\s,;]+/).map((r) => r.trim().toUpperCase()).filter(Boolean))].filter((r) => r !== user.rollNo?.toUpperCase());
  if (rollNos.length + 1 > MAX_TEAM) return { error: `A team can have at most ${MAX_TEAM} members.` };
  const others = await prisma.user.findMany({ where: { rollNo: { in: rollNos }, role: "STUDENT", isDemo: user.isDemo, active: true } });
  const missing = rollNos.filter((r) => !others.some((o) => o.rollNo?.toUpperCase() === r));
  if (missing.length) return { error: `No student found with roll number: ${missing.join(", ")}` };

  const memberIds = [user.id, ...others.map((o) => o.id)];
  const taken = await prisma.teamMember.findMany({
    where: { userId: { in: memberIds }, project: { academicYearId: year.id, status: { not: "REJECTED" } } },
    include: { user: { select: { name: true } } },
  });
  if (taken.length) return { error: `Already in a team this year: ${taken.map((t) => t.user.name).join(", ")}` };

  const project = await prisma.project.create({
    data: {
      academicYearId: year.id, teamName: d.teamName, title: d.title, abstract: d.abstract, domain: d.domain,
      technologies: d.technologies, isDemo: user.isDemo,
      members: { create: memberIds.map((id) => ({ userId: id, isLeader: id === user.id })) },
    },
  });
  await audit(user, "project.create", "Project", project.id, { title: d.title, members: memberIds.length });
  await notify(await hodIds(user.isDemo), { title: "New project proposal", body: `${d.teamName}: "${d.title}" is waiting for approval and guide allocation.`, link: `/projects/${project.id}`, kind: "PROPOSAL" });
  await notify(others.map((o) => o.id), { title: "Added to a project team", body: `${user.name} added you to ${d.teamName}: "${d.title}".`, link: `/projects/${project.id}` });
  revalidatePath("/student");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("STUDENT", "GUIDE", "HOD");
  const id = String(form.get("projectId"));
  const project = await prisma.project.findUnique({ where: { id }, include: { members: true } });
  if (!project) return { error: "Project not found." };
  const scope = { isDemo: project.isDemo, guideId: project.guideId, memberIds: project.members.map((m) => m.userId) };
  const allowed = canSubmitForProject(user, scope) || (user.isDemo === project.isDemo && (user.role === "HOD" || project.guideId === user.id));
  if (!allowed) return { error: "You cannot edit this project." };
  const parsed = projectSchema.omit({ members: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Students may only retitle a project before it is approved.
  const data = { ...parsed.data, ...(user.role === "STUDENT" && project.status !== "PROPOSED" ? { title: project.title } : {}) };
  await prisma.project.update({ where: { id }, data });
  await audit(user, "project.update", "Project", id, data);
  revalidatePath(`/projects/${id}`);
  return { ok: "Project details saved." };
}

export async function submitStageAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser("STUDENT");
  const projectId = String(form.get("projectId"));
  const stageId = String(form.get("stageId"));
  const note = String(form.get("note") ?? "").trim().slice(0, 2000);
  const file = form.get("file");

  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true, extensions: true } });
  if (!project) return { error: "Project not found." };
  if (!canSubmitForProject(user, { isDemo: project.isDemo, guideId: project.guideId, memberIds: project.members.map((m) => m.userId) }))
    return { error: "You are not a member of this project." };
  if (project.status !== "ACTIVE") return { error: "Uploads open once the HOD approves the project and allocates a guide." };

  const stages = await prisma.stage.findMany({ where: { academicYearId: project.academicYearId } });
  const subs = await prisma.submission.findMany({ where: { projectId } });
  const view = computeStages(stages, subs, project.extensions).find((v) => v.stage.id === stageId);
  if (!view) return { error: "Stage not found." };
  const check = canSubmit(view);
  if (!check.ok) return { error: check.reason };

  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  const maxMb = Number(process.env.MAX_UPLOAD_MB || 25);
  if (file.size > maxMb * 1024 * 1024) return { error: `File is larger than ${maxMb} MB.` };
  const ext = path.extname(file.name).toLowerCase();
  const stage = view.stage;
  const allowed = stage.allowedTypes.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(ext))
    return { error: `File type ${ext || "(none)"} is not allowed. Allowed: ${stage.allowedTypes}` };

  const key = makeKey(projectId, file.name);
  await putFile(key, Buffer.from(await file.arrayBuffer()), file.type);
  const version = view.latestVersion + 1;
  const late = isLate(view.deadline);
  const sub = await prisma.submission.create({
    data: {
      projectId, stageId, version, fileKey: key, fileName: file.name.slice(0, 200), mimeType: file.type || "application/octet-stream",
      fileSize: file.size, note, uploadedById: user.id, isLate: late,
    },
  });
  await audit(user, "submission.upload", "Submission", sub.id, { stage: stage.name, version, late, fileName: file.name });
  await notify([project.guideId], {
    title: `New submission: ${stage.name}`,
    body: `${project.teamName} uploaded version ${version}${late ? " (late)" : ""}.`,
    link: `/projects/${projectId}/stages/${stageId}`, kind: "SUBMISSION",
  });
  await notify((await projectMemberIds(projectId)).filter((id) => id !== user.id), {
    title: `${stage.name} submitted`, body: `${user.name} uploaded version ${version}.`, link: `/projects/${projectId}/stages/${stageId}`,
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: `Version ${version} uploaded${late ? " (marked late)" : ""}. Your guide has been notified.` };
}
