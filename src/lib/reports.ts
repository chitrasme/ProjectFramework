import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "./db";
import { summarizeProjects } from "./data";
import { STATE_LABEL } from "./progress";
import { APP_TZ } from "./time";

const d = (x: Date | null | undefined) => (x ? x.toLocaleDateString("en-IN", { timeZone: APP_TZ }) : "");

export async function reportData(yearId: string, isDemo: boolean) {
  const year = await prisma.academicYear.findFirst({ where: { id: yearId, isDemo } });
  if (!year) return null;
  const [projects, stages] = await Promise.all([
    prisma.project.findMany({
      where: { academicYearId: year.id },
      include: { guide: { select: { name: true } }, members: { include: { user: { select: { name: true, rollNo: true, email: true } } }, orderBy: { isLeader: "desc" } } },
      orderBy: { teamName: "asc" },
    }),
    prisma.stage.findMany({ where: { academicYearId: year.id, isActive: true }, orderBy: { order: "asc" } }),
  ]);
  const summary = await summarizeProjects(projects.map((p) => p.id));
  return { year, projects, stages, summary };
}

export async function buildExcel(yearId: string, isDemo: boolean) {
  const data = await reportData(yearId, isDemo);
  if (!data) return null;
  const { year, projects, stages, summary } = data;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ProjectTrack";
  wb.created = new Date();

  const header = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5FBF" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };

  const s1 = wb.addWorksheet("Projects");
  s1.columns = [
    { header: "Team", key: "team", width: 18 }, { header: "Title", key: "title", width: 45 }, { header: "Domain", key: "domain", width: 18 },
    { header: "Guide", key: "guide", width: 26 }, { header: "Members", key: "members", width: 45 }, { header: "Status", key: "status", width: 12 },
    { header: "Progress %", key: "progress", width: 11 }, { header: "Current stage", key: "current", width: 30 }, { header: "Overdue stages", key: "overdue", width: 14 },
    { header: "Late submissions", key: "late", width: 15 }, { header: "Marks", key: "marks", width: 10 }, { header: "Max marks", key: "max", width: 10 },
  ];
  for (const p of projects) {
    const s = summary.get(p.id);
    s1.addRow({
      team: p.teamName, title: p.title, domain: p.domain, guide: p.guide?.name ?? "", status: p.status,
      members: p.members.map((m) => `${m.user.name} (${m.user.rollNo ?? ""})`).join(", "),
      progress: s?.progress ?? 0, current: s?.current ? `${s.current.stage.order}. ${s.current.stage.name}` : p.status === "COMPLETED" ? "Completed" : "",
      overdue: s?.overdue ?? 0, late: s?.lateSubmissions ?? 0, marks: s?.totalMarks ?? 0, max: s?.maxMarks ?? 0,
    });
  }
  header(s1);

  const s2 = wb.addWorksheet("Stage matrix");
  s2.columns = [{ header: "Team", key: "team", width: 18 }, ...stages.map((st) => ({ header: `${st.order}. ${st.name}`, key: st.id, width: 18 }))];
  const fills: Record<string, string> = { APPROVED: "FFE4F4EA", OVERDUE: "FFFDE8E6", REJECTED: "FFFDE8E6", CHANGES_REQUESTED: "FFFDF1DC", UNDER_REVIEW: "FFEFEAFC" };
  for (const p of projects) {
    const s = summary.get(p.id);
    const row = s2.addRow({ team: p.teamName, ...Object.fromEntries((s?.views ?? []).map((v) => [v.stage.id, STATE_LABEL[v.state]])) });
    (s?.views ?? []).forEach((v, i) => {
      const fill = fills[v.state];
      if (fill) row.getCell(i + 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    });
  }
  header(s2);

  const s3 = wb.addWorksheet("Deadlines");
  s3.columns = [{ header: "Order", key: "o", width: 8 }, { header: "Stage", key: "n", width: 34 }, { header: "Deadline", key: "d", width: 14 }, { header: "Approved teams", key: "a", width: 15 }, { header: "Overdue teams", key: "x", width: 14 }, { header: "Max marks", key: "m", width: 10 }];
  for (const st of stages) {
    let a = 0, x = 0;
    for (const p of projects) {
      const v = summary.get(p.id)?.views.find((vv) => vv.stage.id === st.id);
      if (v?.state === "APPROVED") a++;
      if (v?.state === "OVERDUE") x++;
    }
    s3.addRow({ o: st.order, n: st.name, d: d(st.deadline), a, x, m: st.maxMarks });
  }
  header(s3);

  const subs = await prisma.submission.findMany({
    where: { project: { academicYearId: year.id } },
    include: { project: { select: { teamName: true } }, stage: { select: { name: true, order: true } }, uploadedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
    orderBy: [{ project: { teamName: "asc" } }, { stage: { order: "asc" } }, { version: "asc" }],
  });
  const s4 = wb.addWorksheet("Submissions");
  s4.columns = [
    { header: "Team", key: "t", width: 18 }, { header: "Stage", key: "s", width: 30 }, { header: "Version", key: "v", width: 8 }, { header: "File", key: "f", width: 30 },
    { header: "Uploaded by", key: "u", width: 22 }, { header: "Uploaded on", key: "ud", width: 13 }, { header: "Late", key: "l", width: 6 }, { header: "Status", key: "st", width: 18 },
    { header: "Reviewed by", key: "r", width: 22 }, { header: "Reviewed on", key: "rd", width: 13 }, { header: "Marks", key: "m", width: 7 }, { header: "Comment", key: "c", width: 50 },
  ];
  for (const s of subs) {
    s4.addRow({ t: s.project.teamName, s: `${s.stage.order}. ${s.stage.name}`, v: s.version, f: s.fileName ?? "", u: s.uploadedBy.name, ud: d(s.createdAt), l: s.isLate ? "Yes" : "", st: s.status, r: s.reviewedBy?.name ?? "", rd: d(s.reviewedAt), m: s.marks ?? "", c: s.reviewComment ?? "" });
  }
  header(s4);

  const s5 = wb.addWorksheet("Students");
  s5.columns = [{ header: "Roll no.", key: "r", width: 14 }, { header: "Name", key: "n", width: 26 }, { header: "Email", key: "e", width: 30 }, { header: "Team", key: "t", width: 18 }, { header: "Leader", key: "l", width: 8 }, { header: "Guide", key: "g", width: 26 }, { header: "Progress %", key: "p", width: 11 }];
  for (const p of projects) for (const m of p.members) s5.addRow({ r: m.user.rollNo, n: m.user.name, e: m.user.email, t: p.teamName, l: m.isLeader ? "Yes" : "", g: p.guide?.name ?? "", p: summary.get(p.id)?.progress ?? 0 });
  header(s5);

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `ProjectTrack_${year.label.replace(/\s+/g, "_")}.xlsx` };
}

/* ---------- PDF ---------- */

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(public doc: PDFDocument, public font: PDFFont, public bold: PDFFont, public title: string) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([842, 595]); // A4 landscape
    this.y = 555;
    this.page.drawText(this.title, { x: 40, y: 570, size: 8, font: this.font, color: rgb(0.4, 0.4, 0.45) });
  }
  ensure(h: number) {
    if (this.y - h < 40) this.newPage();
  }
  text(t: string, opts: { size?: number; bold?: boolean; x?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 10;
    this.ensure(size + 6);
    this.page.drawText(clean(t), { x: opts.x ?? 40, y: this.y, size, font: opts.bold ? this.bold : this.font, color: rgb(...(opts.color ?? [0.08, 0.1, 0.12])) });
    this.y -= size + 6;
  }
  table(cols: { title: string; width: number }[], rows: string[][]) {
    const size = 8.5;
    const drawHeader = () => {
      this.ensure(20);
      this.page.drawRectangle({ x: 40, y: this.y - 5, width: cols.reduce((a, c) => a + c.width, 0), height: 16, color: rgb(0.12, 0.37, 0.75) });
      let x = 44;
      for (const c of cols) {
        this.page.drawText(fit(c.title, this.bold, size, c.width - 6), { x, y: this.y, size, font: this.bold, color: rgb(1, 1, 1) });
        x += c.width;
      }
      this.y -= 18;
    };
    drawHeader();
    rows.forEach((r, i) => {
      if (this.y - 16 < 40) {
        this.newPage();
        drawHeader();
      }
      if (i % 2 === 1) this.page.drawRectangle({ x: 40, y: this.y - 4, width: cols.reduce((a, c) => a + c.width, 0), height: 14, color: rgb(0.96, 0.97, 0.98) });
      let x = 44;
      r.forEach((cell, j) => {
        this.page.drawText(fit(cell, this.font, size, cols[j].width - 6), { x, y: this.y, size, font: this.font, color: rgb(0.08, 0.1, 0.12) });
        x += cols[j].width;
      });
      this.y -= 14;
    });
    this.y -= 8;
  }
}

// Standard PDF fonts only cover Latin-1; replace anything else.
function clean(s: string) {
  return s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}
function fit(s: string, font: PDFFont, size: number, width: number) {
  let t = clean(s ?? "");
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > width) t = t.slice(0, -1);
  return t + "...";
}

export async function buildYearPdf(yearId: string, isDemo: boolean, department: string) {
  const data = await reportData(yearId, isDemo);
  if (!data) return null;
  const { year, projects, stages, summary } = data;
  const doc = await PDFDocument.create();
  doc.setTitle(`Project progress report ${year.label}`);
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), `ProjectTrack - ${department} - ${year.label}`);
  w.text("Final Year Project Progress Report", { size: 18, bold: true });
  w.text(`${department} · Academic year ${year.label} · Generated ${d(new Date())}${isDemo ? " · DEMO DATA" : ""}`, { size: 10, color: [0.36, 0.4, 0.45] });
  w.y -= 6;
  const active = projects.filter((p) => p.status === "ACTIVE" || p.status === "COMPLETED");
  const avg = active.length ? Math.round(active.reduce((a, p) => a + (summary.get(p.id)?.progress ?? 0), 0) / active.length) : 0;
  w.text(`Projects: ${projects.length}   Approved: ${active.length}   Completed: ${projects.filter((p) => p.status === "COMPLETED").length}   Awaiting approval: ${projects.filter((p) => p.status === "PROPOSED").length}   Average progress: ${avg}%   Teams with overdue stages: ${active.filter((p) => (summary.get(p.id)?.overdue ?? 0) > 0).length}`, { size: 10 });
  w.y -= 8;
  w.text("Projects", { size: 13, bold: true });
  w.table(
    [{ title: "Team", width: 90 }, { title: "Title", width: 210 }, { title: "Guide", width: 120 }, { title: "Members", width: 150 }, { title: "Status", width: 62 }, { title: "Progress", width: 50 }, { title: "Current stage", width: 80 }],
    projects.map((p) => {
      const s = summary.get(p.id);
      return [p.teamName, p.title, p.guide?.name ?? "-", p.members.map((m) => m.user.rollNo ?? m.user.name).join(", "), p.status, `${s?.progress ?? 0}%`, s?.current ? `${s.current.stage.order}. ${s.current.stage.name}` : "-"];
    }),
  );
  w.text("Stage deadlines", { size: 13, bold: true });
  w.table(
    [{ title: "#", width: 30 }, { title: "Stage", width: 260 }, { title: "Deadline", width: 90 }, { title: "Approved", width: 70 }, { title: "Overdue", width: 70 }, { title: "Under review", width: 80 }],
    stages.map((st) => {
      const vs = projects.map((p) => summary.get(p.id)?.views.find((v) => v.stage.id === st.id)).filter(Boolean);
      return [String(st.order), st.name, d(st.deadline), String(vs.filter((v) => v!.state === "APPROVED").length), String(vs.filter((v) => v!.state === "OVERDUE").length), String(vs.filter((v) => v!.state === "UNDER_REVIEW").length)];
    }),
  );
  return { buffer: Buffer.from(await doc.save()), filename: `ProjectTrack_Report_${year.label.replace(/\s+/g, "_")}.pdf` };
}

export async function buildProjectPdf(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { guide: true, academicYear: true, members: { include: { user: true }, orderBy: { isLeader: "desc" } } },
  });
  if (!project) return null;
  const summary = (await summarizeProjects([projectId])).get(projectId)!;
  const subs = await prisma.submission.findMany({ where: { projectId }, include: { stage: true, reviewedBy: true }, orderBy: [{ stage: { order: "asc" } }, { version: "asc" }] });
  const doc = await PDFDocument.create();
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), `ProjectTrack - ${project.teamName} - ${project.academicYear.label}`);
  w.text(project.title, { size: 16, bold: true });
  w.text(`${project.teamName} · Guide: ${project.guide?.name ?? "-"} · ${project.academicYear.label} · Status: ${project.status} · Progress: ${summary.progress}% · Marks: ${summary.totalMarks}/${summary.maxMarks}`, { size: 10, color: [0.36, 0.4, 0.45] });
  w.text(`Members: ${project.members.map((m) => `${m.user.name} (${m.user.rollNo ?? ""})${m.isLeader ? " - leader" : ""}`).join(", ")}`, { size: 10 });
  w.y -= 6;
  w.text("Stages", { size: 13, bold: true });
  w.table(
    [{ title: "#", width: 30 }, { title: "Stage", width: 250 }, { title: "Deadline", width: 90 }, { title: "Status", width: 110 }, { title: "Versions", width: 60 }, { title: "Marks", width: 60 }],
    summary.views.map((v) => {
      const approved = subs.find((s) => s.stageId === v.stage.id && s.status === "APPROVED");
      return [String(v.stage.order), v.stage.name, d(v.deadline) + (v.extended ? " (ext.)" : ""), STATE_LABEL[v.state], String(v.latestVersion), approved?.marks != null ? `${approved.marks}/${v.stage.maxMarks}` : "-"];
    }),
  );
  w.text("Review history", { size: 13, bold: true });
  w.table(
    [{ title: "Stage", width: 170 }, { title: "Ver.", width: 35 }, { title: "Submitted", width: 70 }, { title: "Status", width: 100 }, { title: "Reviewer", width: 110 }, { title: "Comment", width: 275 }],
    subs.map((s) => [`${s.stage.order}. ${s.stage.name}`, String(s.version), d(s.createdAt) + (s.isLate ? " late" : ""), s.status, s.reviewedBy?.name ?? "-", (s.reviewComment ?? "").replace(/\s+/g, " ")]),
  );
  return { buffer: Buffer.from(await doc.save()), filename: `ProjectTrack_${project.teamName.replace(/[^a-z0-9]+/gi, "_")}.pdf` };
}
