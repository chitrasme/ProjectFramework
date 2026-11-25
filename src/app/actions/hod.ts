"use server";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { notify, projectMemberIds } from "@/lib/notify";
import { parseLocalInput } from "@/lib/time";
import { DEFAULT_STAGES } from "@/lib/progress";
import type { ActionResult } from "@/components/action-form";

const DAY = 86_400_000;

async function hod() {
  return requireUser("HOD");
}

/* ---------------- Projects ---------------- */

export async function assignGuideAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const projectId = String(form.get("projectId"));
  const guideId = String(form.get("guideId"));
  const [project, guide] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.user.findUnique({ where: { id: guideId } }),
  ]);
  if (!project || project.isDemo !== user.isDemo) return { error: "Project not found." };
  if (!guide || guide.role !== "GUIDE" || guide.isDemo !== user.isDemo || !guide.active) return { error: "Choose an active guide." };
  const wasProposed = project.status === "PROPOSED";
  await prisma.project.update({ where: { id: projectId }, data: { guideId, status: project.status === "PROPOSED" ? "ACTIVE" : project.status } });
  await audit(user, wasProposed ? "project.approve" : "project.change_guide", "Project", projectId, { guide: guide.name });
  await notify([guideId], { title: "New team allocated", body: `You are now the guide for ${project.teamName}: "${project.title}".`, link: `/projects/${projectId}`, kind: "ALLOCATION" });
  await notify(await projectMemberIds(projectId), {
    title: wasProposed ? "Project approved" : "Guide changed",
    body: `${guide.name} is your project guide.${wasProposed ? " You can now start uploading stage documents." : ""}`,
    link: `/projects/${projectId}`, kind: "ALLOCATION",
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/hod/projects");
  return { ok: wasProposed ? "Project approved and guide allocated." : "Guide updated." };
}

export async function setProjectStatusAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const projectId = String(form.get("projectId"));
  const status = z.enum(["PROPOSED", "REJECTED"]).safeParse(form.get("status"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!status.success) return { error: "Invalid status." };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.isDemo !== user.isDemo) return { error: "Project not found." };
  await prisma.project.update({ where: { id: projectId }, data: { status: status.data } });
  if (reason) await prisma.remark.create({ data: { projectId, authorId: user.id, body: `Proposal ${status.data === "REJECTED" ? "rejected" : "reopened"}: ${reason}` } });
  await audit(user, `project.${status.data.toLowerCase()}`, "Project", projectId, { reason });
  await notify(await projectMemberIds(projectId), {
    title: status.data === "REJECTED" ? "Project proposal rejected" : "Proposal reopened",
    body: reason || "Check ProjectTrack for details.", link: `/projects/${projectId}`,
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: "Status updated." };
}

/* ---------------- Users ---------------- */

const userSchema = z.object({
  name: z.string().trim().min(2, "Enter a name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["STUDENT", "GUIDE", "HOD"]),
  rollNo: z.string().trim().toUpperCase().optional(),
  department: z.string().trim().optional(),
});

function tempPassword() {
  return "Pt-" + crypto.randomBytes(4).toString("hex") + "9";
}

export async function createUserAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.role === "STUDENT" && !d.rollNo) return { error: "Students need a roll number." };
  const password = String(form.get("password") || "") || tempPassword();
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  try {
    const created = await prisma.user.create({
      data: {
        name: d.name, email: d.email, role: d.role, rollNo: d.role === "STUDENT" ? d.rollNo : null,
        department: d.department || user.department, isDemo: user.isDemo, mustChangePassword: true,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    await audit(user, "user.create", "User", created.id, { email: d.email, role: d.role });
    revalidatePath("/hod/users");
    return { ok: `Account created for ${d.email}. Temporary password: ${password} (they must change it on first login).` };
  } catch {
    return { error: "A user with that email or roll number already exists." };
  }
}

/** CSV columns: name,email,role,rollNo  (header row optional; role defaults to STUDENT) */
export async function importUsersAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const file = form.get("file");
  let text = String(form.get("csv") ?? "");
  if (file instanceof File && file.size > 0) text = await file.text();
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return { error: "Paste CSV rows or choose a CSV file." };
  if (/^name\s*,/i.test(rows[0])) rows.shift();
  if (rows.length > 1000) return { error: "Import at most 1000 rows at a time." };
  const created: string[] = [];
  const skipped: string[] = [];
  const credentials: string[] = [];
  for (const [i, row] of rows.entries()) {
    const [name, email, role = "STUDENT", rollNo = ""] = row.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const parsed = userSchema.safeParse({ name, email, role: role.toUpperCase() || "STUDENT", rollNo: rollNo || undefined });
    if (!parsed.success || (parsed.data.role === "STUDENT" && !parsed.data.rollNo)) {
      skipped.push(`row ${i + 1} (invalid)`);
      continue;
    }
    const password = tempPassword();
    try {
      await prisma.user.create({
        data: {
          name: parsed.data.name, email: parsed.data.email, role: parsed.data.role,
          rollNo: parsed.data.role === "STUDENT" ? parsed.data.rollNo : null, department: user.department,
          isDemo: user.isDemo, mustChangePassword: true, passwordHash: await bcrypt.hash(password, 10),
        },
      });
      created.push(parsed.data.email);
      credentials.push(`${parsed.data.email},${password}`);
    } catch {
      skipped.push(`${parsed.data.email} (exists)`);
    }
  }
  await audit(user, "user.import", "User", null, { created: created.length, skipped: skipped.length });
  revalidatePath("/hod/users");
  return {
    ok: `Imported ${created.length} account(s).${skipped.length ? ` Skipped: ${skipped.slice(0, 10).join("; ")}${skipped.length > 10 ? "…" : ""}.` : ""}` +
      (credentials.length ? `\nTemporary passwords (copy now, shown once):\n${credentials.join("\n")}` : ""),
  };
}

export async function toggleUserActiveAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const id = String(form.get("userId"));
  if (id === user.id) return { error: "You cannot deactivate your own account." };
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.isDemo !== user.isDemo) return { error: "User not found." };
  await prisma.user.update({ where: { id }, data: { active: !target.active } });
  await audit(user, target.active ? "user.deactivate" : "user.activate", "User", id, { email: target.email });
  revalidatePath("/hod/users");
  return { ok: `${target.name} ${target.active ? "deactivated" : "re-activated"}.` };
}

export async function resetPasswordAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const id = String(form.get("userId"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.isDemo !== user.isDemo) return { error: "User not found." };
  if (target.isDemo) return { error: "Demo passwords cannot be reset." };
  const password = tempPassword();
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } });
  await audit(user, "user.reset_password", "User", id, { email: target.email });
  return { ok: `New temporary password for ${target.email}: ${password}` };
}

export async function updateUserAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const id = String(form.get("userId"));
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.isDemo !== user.isDemo) return { error: "User not found." };
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (id === user.id && parsed.data.role !== "HOD") return { error: "You cannot remove your own HOD role." };
  try {
    await prisma.user.update({
      where: { id },
      data: { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, rollNo: parsed.data.role === "STUDENT" ? parsed.data.rollNo || null : null, department: parsed.data.department || target.department },
    });
  } catch {
    return { error: "That email or roll number is already used." };
  }
  await audit(user, "user.update", "User", id, parsed.data);
  revalidatePath("/hod/users");
  return { ok: "User updated." };
}

/* ---------------- Stages ---------------- */

async function ownedStage(user: { isDemo: boolean }, stageId: string) {
  const stage = await prisma.stage.findUnique({ where: { id: stageId }, include: { academicYear: true } });
  if (!stage || stage.academicYear.isDemo !== user.isDemo) return null;
  return stage;
}

const stageSchema = z.object({
  name: z.string().trim().min(2, "Enter a stage name.").max(100),
  description: z.string().trim().max(2000).default(""),
  deadline: z.string().optional(),
  maxMarks: z.coerce.number().int().min(0).max(100).default(0),
  allowedTypes: z.string().trim().max(200).default(".pdf,.doc,.docx,.ppt,.pptx,.zip"),
});

function normaliseTypes(s: string) {
  return s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).map((t) => (t.startsWith(".") ? t : "." + t)).join(",");
}

export async function updateStageAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const stage = await ownedStage(user, String(form.get("stageId")));
  if (!stage) return { error: "Stage not found." };
  const parsed = stageSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const deadline = parsed.data.deadline ? parseLocalInput(parsed.data.deadline) : null;
  if (parsed.data.deadline && !deadline) return { error: "Invalid deadline." };
  const data = {
    name: parsed.data.name, description: parsed.data.description, deadline, maxMarks: parsed.data.maxMarks,
    allowedTypes: normaliseTypes(parsed.data.allowedTypes), requiresDocument: form.get("requiresDocument") === "on", isActive: form.get("isActive") === "on",
  };
  await prisma.stage.update({ where: { id: stage.id }, data });
  if (stage.deadline?.getTime() !== deadline?.getTime()) {
    await prisma.reminderLog.deleteMany({ where: { stageId: stage.id } });
    const members = await prisma.teamMember.findMany({ where: { project: { academicYearId: stage.academicYearId, status: "ACTIVE" } }, select: { userId: true } });
    await notify(members.map((m) => m.userId), { title: `Deadline updated: ${data.name}`, body: deadline ? `New department deadline: ${deadline.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "The deadline was removed.", link: "/calendar", kind: "DEADLINE" });
  }
  await audit(user, "stage.update", "Stage", stage.id, { ...data, deadline: deadline?.toISOString() ?? null });
  revalidatePath("/hod/stages");
  return { ok: "Stage saved." };
}

export async function addStageAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const yearId = String(form.get("yearId"));
  const year = await prisma.academicYear.findUnique({ where: { id: yearId } });
  if (!year || year.isDemo !== user.isDemo) return { error: "Year not found." };
  const parsed = stageSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const last = await prisma.stage.findFirst({ where: { academicYearId: yearId }, orderBy: { order: "desc" } });
  const stage = await prisma.stage.create({
    data: {
      academicYearId: yearId, order: (last?.order ?? 0) + 1, name: parsed.data.name, description: parsed.data.description,
      deadline: parseLocalInput(parsed.data.deadline), maxMarks: parsed.data.maxMarks, allowedTypes: normaliseTypes(parsed.data.allowedTypes),
      requiresDocument: form.get("requiresDocument") === "on",
    },
  });
  await audit(user, "stage.create", "Stage", stage.id, { name: stage.name, year: year.label });
  revalidatePath("/hod/stages");
  return { ok: `Stage "${stage.name}" added.` };
}

export async function moveStageAction(form: FormData) {
  const user = await hod();
  const stage = await ownedStage(user, String(form.get("stageId")));
  const dir = form.get("dir") === "up" ? -1 : 1;
  if (!stage) return;
  const neighbour = await prisma.stage.findFirst({
    where: { academicYearId: stage.academicYearId, order: dir < 0 ? { lt: stage.order } : { gt: stage.order } },
    orderBy: { order: dir < 0 ? "desc" : "asc" },
  });
  if (!neighbour) return;
  // swap orders through a temporary value to respect the unique (year, order) index
  await prisma.$transaction([
    prisma.stage.update({ where: { id: stage.id }, data: { order: -1 } }),
    prisma.stage.update({ where: { id: neighbour.id }, data: { order: stage.order } }),
    prisma.stage.update({ where: { id: stage.id }, data: { order: neighbour.order } }),
  ]);
  await audit(user, "stage.reorder", "Stage", stage.id, { from: stage.order, to: neighbour.order });
  revalidatePath("/hod/stages");
}

export async function deleteStageAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const stage = await ownedStage(user, String(form.get("stageId")));
  if (!stage) return { error: "Stage not found." };
  const count = await prisma.submission.count({ where: { stageId: stage.id } });
  if (count) return { error: `This stage has ${count} submission(s). Turn it off (uncheck "Active") instead of deleting it.` };
  await prisma.stage.delete({ where: { id: stage.id } });
  await audit(user, "stage.delete", "Stage", stage.id, { name: stage.name });
  revalidatePath("/hod/stages");
  return { ok: "Stage deleted." };
}

export async function shiftDeadlinesAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const yearId = String(form.get("yearId"));
  const days = Number(form.get("days"));
  const fromOrder = Number(form.get("fromOrder") || 1);
  if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 120) return { error: "Enter a number of days between -120 and 120." };
  const year = await prisma.academicYear.findUnique({ where: { id: yearId } });
  if (!year || year.isDemo !== user.isDemo) return { error: "Year not found." };
  const stages = await prisma.stage.findMany({ where: { academicYearId: yearId, order: { gte: fromOrder }, deadline: { not: null } } });
  await prisma.$transaction(stages.map((s) => prisma.stage.update({ where: { id: s.id }, data: { deadline: new Date(s.deadline!.getTime() + days * DAY) } })));
  await prisma.reminderLog.deleteMany({ where: { stageId: { in: stages.map((s) => s.id) } } });
  await audit(user, "stage.shift_deadlines", "AcademicYear", yearId, { days, fromOrder, count: stages.length });
  const members = await prisma.teamMember.findMany({ where: { project: { academicYearId: yearId, status: "ACTIVE" } }, select: { userId: true } });
  await notify(members.map((m) => m.userId), { title: "Deadlines updated", body: `Deadlines from stage ${fromOrder} onward moved by ${days} day(s).`, link: "/calendar", kind: "DEADLINE" });
  revalidatePath("/hod/stages");
  return { ok: `Moved ${stages.length} deadline(s) by ${days} day(s).` };
}

/* ---------------- Academic years ---------------- */

export async function createYearAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await hod();
  const label = String(form.get("label") ?? "").trim();
  const start = parseLocalInput(String(form.get("startDate") ?? "") + "T00:00");
  const end = parseLocalInput(String(form.get("endDate") ?? ""));
  const copyFrom = String(form.get("copyFrom") ?? "");
  if (!/^[\w\s-]{4,30}$/.test(label)) return { error: 'Enter a label such as "2027-28".' };
  if (!start || !end || end <= start) return { error: "Enter a valid start and end date." };
  const exists = await prisma.academicYear.findFirst({ where: { label, isDemo: user.isDemo } });
  if (exists) return { error: "A year with that label already exists." };

  let stageData: { order: number; name: string; description: string; requiresDocument: boolean; maxMarks: number; allowedTypes?: string; isActive?: boolean; deadline: Date | null }[];
  if (copyFrom) {
    const src = await prisma.academicYear.findUnique({ where: { id: copyFrom }, include: { stages: { orderBy: { order: "asc" } } } });
    if (!src || src.isDemo !== user.isDemo) return { error: "Source year not found." };
    // keep each stage's offset from the year start
    stageData = src.stages.map((s) => ({
      order: s.order, name: s.name, description: s.description, requiresDocument: s.requiresDocument, maxMarks: s.maxMarks,
      allowedTypes: s.allowedTypes, isActive: s.isActive,
      deadline: s.deadline ? new Date(start.getTime() + (s.deadline.getTime() - src.startDate.getTime())) : null,
    }));
  } else {
    stageData = DEFAULT_STAGES.map((s, i) => ({ order: i + 1, name: s.name, description: s.description, requiresDocument: s.requiresDocument, maxMarks: s.maxMarks, deadline: new Date(start.getTime() + s.offsetDays * DAY) }));
  }
  const year = await prisma.academicYear.create({
    data: { label, startDate: start, endDate: end, isDemo: user.isDemo, stages: { create: stageData } },
  });
  await audit(user, "year.create", "AcademicYear", year.id, { label, copyFrom: copyFrom || "defaults" });
  revalidatePath("/hod/years");
  return { ok: `Academic year ${label} created with ${stageData.length} stages. Make it active when you are ready.` };
}

export async function activateYearAction(form: FormData) {
  const user = await hod();
  const id = String(form.get("yearId"));
  const year = await prisma.academicYear.findUnique({ where: { id } });
  if (!year || year.isDemo !== user.isDemo) return;
  await prisma.$transaction([
    prisma.academicYear.updateMany({ where: { isDemo: user.isDemo }, data: { isActive: false } }),
    prisma.academicYear.update({ where: { id }, data: { isActive: true, archived: false } }),
  ]);
  await audit(user, "year.activate", "AcademicYear", id, { label: year.label });
  revalidatePath("/hod", "layout");
}

export async function archiveYearAction(form: FormData) {
  const user = await hod();
  const id = String(form.get("yearId"));
  const year = await prisma.academicYear.findUnique({ where: { id } });
  if (!year || year.isDemo !== user.isDemo || year.isActive) return;
  await prisma.academicYear.update({ where: { id }, data: { archived: !year.archived } });
  await audit(user, year.archived ? "year.unarchive" : "year.archive", "AcademicYear", id, { label: year.label });
  revalidatePath("/hod/years");
}
