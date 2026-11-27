// Demo data and default academic year. Used by `npm run db:seed` and by the one-time /setup page.
// Everything demo is flagged isDemo=true; real data is never touched here.
import type { PrismaClient, SubmissionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { DEFAULT_STAGES } from "./progress";
import { supabaseBaseUrl } from "./supabase-url";

const DAY = 86_400_000;
export const DEMO_PASSWORD = "Demo@123";

function academicLabel(d: Date) {
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1; // year starts in June
  return { label: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, start: new Date(y, 5, 1), end: new Date(y + 1, 4, 31) };
}

async function demoPdf(title: string, lines: string[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText("DEMO DOCUMENT – ProjectTrack", { x: 50, y: 790, size: 10, font });
  page.drawText(title, { x: 50, y: 750, size: 18, font: bold });
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 710 - i * 18, size: 11, font }));
  return Buffer.from(await doc.save());
}

async function storeLocal(key: string, data: Buffer) {
  // Seed writes demo files to local disk. With STORAGE_DRIVER=supabase they are uploaded instead.
  if ((process.env.STORAGE_DRIVER || "local") === "supabase") {
    const url = supabaseBaseUrl(process.env.SUPABASE_URL);
    const bucket = process.env.SUPABASE_BUCKET || "projecttrack";
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, "Content-Type": "application/pdf", "x-upsert": "true" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`);
    return;
  }
  const full = path.join(path.resolve(process.env.UPLOAD_DIR || "./uploads"), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

export async function ensureRealYear(prisma: PrismaClient) {
  const { label, start, end } = academicLabel(new Date());
  const existing = await prisma.academicYear.findFirst({ where: { isDemo: false } });
  if (existing) return;
  await prisma.academicYear.create({
    data: {
      label, startDate: start, endDate: end, isActive: true, isDemo: false,
      stages: {
        create: DEFAULT_STAGES.map((s, i) => ({
          order: i + 1, name: s.name, description: s.description, requiresDocument: s.requiresDocument,
          maxMarks: s.maxMarks, deadline: new Date(start.getTime() + s.offsetDays * DAY),
        })),
      },
    },
  });
  console.log(`Created real academic year ${label} with ${DEFAULT_STAGES.length} default stages.`);
}

export async function wipeDemo(prisma: PrismaClient) {
  await prisma.auditLog.deleteMany({ where: { isDemo: true } });
  await prisma.academicYear.deleteMany({ where: { isDemo: true } }); // cascades stages, projects, submissions…
  await prisma.user.deleteMany({ where: { isDemo: true } });
}

export async function seedDemo(prisma: PrismaClient) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = Date.now();
  // Demo year started ~100 days ago so the teams are spread across the lifecycle.
  const start = new Date(now - 100 * DAY);
  const year = await prisma.academicYear.create({
    data: {
      label: "DEMO 2026-27", startDate: start, endDate: new Date(start.getTime() + 330 * DAY), isActive: true, isDemo: true,
      stages: {
        create: DEFAULT_STAGES.map((s, i) => ({
          order: i + 1, name: s.name, description: s.description, requiresDocument: s.requiresDocument,
          maxMarks: s.maxMarks, deadline: new Date(start.getTime() + s.offsetDays * DAY),
        })),
      },
    },
    include: { stages: { orderBy: { order: "asc" } } },
  });

  const mk = (name: string, email: string, role: "HOD" | "GUIDE" | "STUDENT", rollNo?: string) =>
    prisma.user.create({ data: { name, email, role, rollNo: rollNo ?? null, passwordHash: hash, isDemo: true } });

  const hod = await mk("Dr. Meera Raghavan (Demo HOD)", "hod@demo.projecttrack", "HOD");
  const g1 = await mk("Prof. Arun Kumar (Demo Guide)", "guide1@demo.projecttrack", "GUIDE");
  const g2 = await mk("Prof. Lakshmi Narayanan (Demo Guide)", "guide2@demo.projecttrack", "GUIDE");
  const students: Awaited<ReturnType<typeof mk>>[] = [];
  const names = ["Priya S", "Rahul M", "Divya K", "Karthik R", "Sneha P", "Vignesh T", "Anitha B", "Surya V", "Harini G", "Manoj D"];
  for (let i = 0; i < names.length; i++) {
    students.push(await mk(`${names[i]} (Demo)`, `student${i + 1}@demo.projecttrack`, "STUDENT", `DEMO${String(i + 1).padStart(3, "0")}`));
  }

  const teams = [
    { team: "Team Nova", title: "Smart Attendance System using Face Recognition", domain: "Computer Vision", tech: "Python, OpenCV, Flask", guide: g1, members: [0, 1, 2], approvedUpTo: 7, pending: 8 },
    { team: "Team Orbit", title: "Crop Disease Detection with Mobile Deep Learning", domain: "Machine Learning", tech: "TensorFlow Lite, Android", guide: g1, members: [3, 4], approvedUpTo: 5, changes: 6 },
    { team: "Team Pulse", title: "IoT-based Patient Health Monitoring", domain: "IoT", tech: "ESP32, MQTT, React", guide: g2, members: [5, 6], approvedUpTo: 3 },
    { team: "Team Quill", title: "Blockchain Certificate Verification Portal", domain: "Blockchain", tech: "Solidity, Next.js", guide: g2, members: [7, 8], approvedUpTo: 2, pending: 3 },
  ];

  for (const t of teams) {
    const project = await prisma.project.create({
      data: {
        academicYearId: year.id, teamName: t.team, title: t.title, domain: t.domain, technologies: t.tech, isDemo: true,
        abstract: `${t.title}: a final-year project (demo data).`, guideId: t.guide.id, status: "ACTIVE",
        members: { create: t.members.map((m, i) => ({ userId: students[m].id, isLeader: i === 0 })) },
      },
    });
    const leader = students[t.members[0]];
    for (const stage of year.stages) {
      let status: SubmissionStatus | null = null;
      if (stage.order <= t.approvedUpTo) status = "APPROVED";
      else if (stage.order === t.pending) status = "PENDING";
      else if (stage.order === t.changes) status = "CHANGES_REQUESTED";
      if (!status) continue;
      const when = new Date(Math.min((stage.deadline?.getTime() ?? now) - 2 * DAY, now - DAY));
      let file: { fileKey: string; fileName: string; mimeType: string; fileSize: number } | null = null;
      if (stage.requiresDocument) {
        const pdf = await demoPdf(`${stage.name} – ${t.team}`, [t.title, `Domain: ${t.domain}`, `Technologies: ${t.tech}`, "", "This is sample content for the demo."]);
        const fileKey = `${project.id}/demo-${stage.order}.pdf`;
        await storeLocal(fileKey, pdf);
        file = { fileKey, fileName: `${stage.name.replace(/[^a-z0-9]+/gi, "_")}.pdf`, mimeType: "application/pdf", fileSize: pdf.length };
      }
      await prisma.submission.create({
        data: {
          projectId: project.id, stageId: stage.id, version: 1, ...file, uploadedById: leader.id, createdAt: when,
          note: stage.requiresDocument ? "Submitted for review." : "", status,
          reviewedById: status === "PENDING" ? null : t.guide.id,
          reviewedAt: status === "PENDING" ? null : new Date(when.getTime() + DAY),
          reviewComment: status === "APPROVED" ? "Good work. Approved." : status === "CHANGES_REQUESTED" ? "Please add more detail to the comparison table and cite sources properly." : null,
          marks: status === "APPROVED" && stage.maxMarks ? Math.max(1, stage.maxMarks - (stage.order % 3)) : null,
        },
      });
    }
    await prisma.calendarEvent.create({
      data: { academicYearId: year.id, projectId: project.id, title: `${t.team}: weekly guide meeting`, startsAt: new Date(now + 3 * DAY), kind: "MEETING", createdById: t.guide.id },
    });
  }

  // One proposal waiting for HOD approval and guide allocation
  await prisma.project.create({
    data: {
      academicYearId: year.id, teamName: "Team Zenith", title: "AI Chatbot for College Admissions", domain: "NLP",
      technologies: "Python, FastAPI", isDemo: true, status: "PROPOSED", abstract: "A chatbot answering admission queries (demo).",
      members: { create: [{ userId: students[9].id, isLeader: true }] },
    },
  });

  await prisma.calendarEvent.create({
    data: { academicYearId: year.id, title: "Review 1 panel – Seminar Hall", startsAt: year.stages[7].deadline!, kind: "REVIEW", createdById: hod.id },
  });
  await prisma.notification.createMany({
    data: [
      { userId: students[0].id, title: "Welcome to the ProjectTrack demo", body: "Explore your project timeline and upload a document for the next stage.", link: "/student" },
      { userId: g1.id, title: "Submission awaiting review", body: "Team Nova submitted Review 1 slides.", link: "/guide/reviews" },
      { userId: hod.id, title: "New project proposal", body: "Team Zenith is waiting for guide allocation.", link: "/hod/projects" },
    ],
  });
  await prisma.auditLog.create({ data: { actorId: hod.id, isDemo: true, action: "demo.seed", entity: "System", details: { teams: teams.length + 1 } } });
  console.log(`Demo data ready. Log in with any demo account, password ${DEMO_PASSWORD}`);
}

