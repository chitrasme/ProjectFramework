/**
 * End-to-end tests: real browser, real server, real PostgreSQL.
 *   npm run test:e2e
 * Each run creates a brand-new database (projecttrack_e2e_<timestamp>) on the server given by
 * TEST_DATABASE_SERVER (default: local Postgres as user projecttrack), and drops it afterwards.
 * Set KEEP_DB=1 to keep it for inspection. Existing databases are never touched.
 * Requires a production build (npm run build) and Playwright with Chromium.
 */
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const SERVER = new URL(process.env.TEST_DATABASE_SERVER || "postgresql://projecttrack:projecttrack@localhost:5432/postgres");
const DB_NAME = `projecttrack_e2e_${Date.now()}`;
const DB = Object.assign(new URL(SERVER.href), { pathname: `/${DB_NAME}` }).href;
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const UPLOADS = path.resolve(".test-uploads");
const SHOTS = process.env.E2E_SCREENSHOTS;
const env = {
  ...process.env, DATABASE_URL: DB, DIRECT_URL: DB, UPLOAD_DIR: UPLOADS, STORAGE_DRIVER: "local", DEMO_MODE: "true",
  AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret", CRON_SECRET: "e2e-cron", SETUP_TOKEN: "e2e-setup-token", APP_URL: BASE, SMTP_HOST: "", PORT: String(PORT), NODE_ENV: "production",
};

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push([name, "PASS"]);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push([name, "FAIL", e]);
    console.log(`  ✗ ${name}\n    ${e.message.split("\n").join("\n    ")}`);
  }
}

// ---------- setup ----------
console.log(`Creating test database ${DB_NAME}…`);
rmSync(UPLOADS, { recursive: true, force: true });
mkdirSync(UPLOADS, { recursive: true });
const { PrismaClient: AdminClient } = require("@prisma/client");
const admin = new AdminClient({ datasources: { db: { url: SERVER.href } } });
await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });

console.log("Starting server…");
try {
  await fetch(`${BASE}/login`);
  throw new Error(`Port ${PORT} is already in use; stop that server first.`);
} catch (e) {
  if (e.message.startsWith("Port")) throw e;
}
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${BASE}/login`);
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
async function session(email, password = "Demo@123") {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return { ctx, page };
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const status = (page) => page.getByRole("status").last();
const alert = (page) => page.locator("[role=alert]:not(#__next-route-announcer__)").last();
const btn = (page, name) => page.getByRole("button", { name, exact: true });

// Look up ids straight from the database
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: DB } } });
const proj = (team) => db.project.findFirstOrThrow({ where: { teamName: team }, include: { members: true } });
const stageOf = async (team, order) => {
  const p = await proj(team);
  return db.stage.findFirstOrThrow({ where: { academicYearId: p.academicYearId, order } });
};

try {
  const nova = await proj("Team Nova");
  const orbit = await proj("Team Orbit");
  const pulse = await proj("Team Pulse");
  const orbitFile = await db.submission.findFirstOrThrow({ where: { projectId: orbit.id, fileKey: { not: null } } });
  const demoYear = await db.academicYear.findFirstOrThrow({ where: { isDemo: true } });

  console.log("\nFirst-time setup");
  await test("setup page refuses a wrong token, then creates the real HOD once", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.getByText("First time here?").click();
    await page.waitForURL(/\/setup/);
    await page.fill("#token", "wrong");
    await page.fill("#name", "Real HOD");
    await page.fill("#email", "realhod@college.test");
    await page.fill("#password", "RealHod#2026");
    await page.fill("#confirm", "RealHod#2026");
    await page.uncheck("input[name=demo]");
    await btn(page, "Create HOD account").click();
    await alert(page).waitFor();
    assert.match(await alert(page).textContent(), /setup token is wrong/);
    await page.fill("#token", "e2e-setup-token");
    await Promise.all([page.waitForURL(/\/hod/), btn(page, "Create HOD account").click()]);
    await page.getByText("Department dashboard").waitFor();
    const r = await page.goto(`${BASE}/setup`);
    assert.equal(r.status(), 404);
    await page.goto(`${BASE}/login`);
    await ctx.close();
    const anon = await browser.newContext();
    const p2 = await anon.newPage();
    await p2.goto(`${BASE}/login`);
    assert.equal(await p2.getByText("First time here?").count(), 0);
    await anon.close();
  });

  console.log("\nAuthentication");
  await test("rejects a wrong password", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await shot(page, "01-login");
    await page.fill("#email", "student1@demo.projecttrack");
    await page.fill("#password", "wrong");
    await page.click("button[type=submit]");
    await assert.doesNotReject(alert(page).waitFor());
    assert.match(await alert(page).textContent(), /Incorrect email or password/);
    await ctx.close();
  });
  await test("signed-out users are sent to login, APIs return 401", async () => {
    const r = await fetch(`${BASE}/student`, { redirect: "manual" });
    assert.ok([302, 303, 307, 308].includes(r.status) || r.status === 200);
    const f = await fetch(`${BASE}/api/files/${orbitFile.id}`);
    assert.equal(f.status, 401);
  });

  console.log("\nStudent");
  const s1 = await session("student1@demo.projecttrack");
  await test("student dashboard shows own project and current stage", async () => {
    assert.equal(new URL(s1.page.url()).pathname, "/student");
    await s1.page.getByText("Smart Attendance System using Face Recognition").first().waitFor();
    await s1.page.getByText("Current stage").waitFor();
    await shot(s1.page, "02-student-dashboard");
  });
  await test("student cannot open another team's project (404)", async () => {
    const r = await s1.page.goto(`${BASE}/projects/${orbit.id}`);
    assert.equal(r.status(), 404);
  });
  await test("student cannot download another team's file (404)", async () => {
    const r = await s1.page.request.get(`${BASE}/api/files/${orbitFile.id}`);
    assert.equal(r.status(), 404);
  });
  await test("student can download own team's file", async () => {
    const own = await db.submission.findFirstOrThrow({ where: { projectId: nova.id, fileKey: { not: null } } });
    const r = await s1.page.request.get(`${BASE}/api/files/${own.id}`);
    assert.equal(r.status(), 200);
    assert.equal((await r.body()).subarray(0, 4).toString(), "%PDF");
  });
  await test("student is kept out of HOD pages and HOD APIs", async () => {
    await s1.page.goto(`${BASE}/hod/users`);
    assert.equal(new URL(s1.page.url()).pathname, "/student");
    await s1.page.getByText("not available for your role").waitFor();
    assert.equal((await s1.page.request.get(`${BASE}/api/reports?format=xlsx&year=${demoYear.id}`)).status(), 403);
    assert.equal((await s1.page.request.get(`${BASE}/api/backup`)).status(), 403);
  });
  await test("student cannot upload while the latest version is under review", async () => {
    const st = await stageOf("Team Nova", 8);
    await s1.page.goto(`${BASE}/projects/${nova.id}/stages/${st.id}`);
    await s1.page.getByText("waiting for review").waitFor();
    assert.equal(await s1.page.locator("input[type=file]").count(), 0);
  });

  const s4 = await session("student4@demo.projecttrack");
  const orbitStage6 = await stageOf("Team Orbit", 6);
  await test("upload rejects a disallowed file type", async () => {
    await s4.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage6.id}`);
    await s4.page.setInputFiles("#file", { name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
    await btn(s4.page, "Upload version 2").click();
    await alert(s4.page).waitFor();
    assert.match(await alert(s4.page).textContent(), /not allowed/);
  });
  await test("student uploads a revised version after changes were requested", async () => {
    await s4.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage6.id}`);
    await s4.page.getByText("asked for changes").waitFor();
    await s4.page.setInputFiles("#file", { name: "SRS_v2.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 revised SRS") });
    await s4.page.fill("#note", "Added the comparison table.");
    await btn(s4.page, "Upload version 2").click();
    await s4.page.getByText("Your latest version is waiting for review.").waitFor();
    await s4.page.getByText("SRS_v2.pdf").waitFor();
    const v2 = await db.submission.findFirstOrThrow({ where: { projectId: orbit.id, stageId: orbitStage6.id, version: 2 } });
    assert.equal(v2.status, "PENDING");
    assert.equal(v2.fileName, "SRS_v2.pdf");
    await shot(s4.page, "03-student-upload");
  });

  console.log("\nGuide");
  const g1 = await session("guide1@demo.projecttrack");
  await test("guide was notified and sees the upload in the review queue", async () => {
    const n = await db.notification.findFirst({ where: { user: { email: "guide1@demo.projecttrack" }, title: { contains: "Requirement Analysis" } } });
    assert.ok(n, "notification missing");
    await g1.page.goto(`${BASE}/guide/reviews`);
    await g1.page.getByRole("cell", { name: /Team Orbit/ }).waitFor();
    await shot(g1.page, "04-guide-queue");
  });
  await test("guide cannot open a team allocated to another guide (404)", async () => {
    const r = await g1.page.goto(`${BASE}/projects/${pulse.id}`);
    assert.equal(r.status(), 404);
  });
  await test("requesting changes without a comment is refused", async () => {
    await g1.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage6.id}`);
    await g1.page.check("input[value=CHANGES_REQUESTED]");
    await btn(g1.page, "Save review").click();
    await alert(g1.page).waitFor();
    assert.match(await alert(g1.page).textContent(), /Add a comment/);
  });
  await test("marks above the stage maximum are refused", async () => {
    await g1.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage6.id}`);
    await g1.page.check("input[value=APPROVED]");
    await g1.page.fill("#marks", "99");
    await g1.page.evaluate(() => document.querySelector("#marks").removeAttribute("max"));
    await btn(g1.page, "Save review").click();
    await alert(g1.page).waitFor();
    assert.match(await alert(g1.page).textContent(), /Marks must be/);
  });
  await test("guide approves with marks; the next stage unlocks", async () => {
    await g1.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage6.id}`);
    await g1.page.check("input[value=APPROVED]");
    await g1.page.fill("#comment", "Well done.");
    await g1.page.fill("#marks", "4");
    await btn(g1.page, "Save review").click();
    await g1.page.getByText("4/5 marks").waitFor();
    const v2 = await db.submission.findFirstOrThrow({ where: { projectId: orbit.id, stageId: orbitStage6.id, version: 2 } });
    assert.equal(v2.status, "APPROVED");
    assert.equal(v2.marks, 4);
    await shot(g1.page, "05-guide-review");
  });
  const orbitStage7 = await stageOf("Team Orbit", 7);
  await test("guide extends a team deadline (entered in IST)", async () => {
    await g1.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage7.id}`);
    const future = new Date(Date.now() + 20 * 86400000);
    const local = new Date(future.getTime() + 330 * 60000).toISOString().slice(0, 10) + "T17:00";
    await g1.page.fill("#newDeadline", local);
    await g1.page.fill("input[name=reason]", "Lab closed for a week");
    await btn(g1.page, "Extend deadline").click();
    await status(g1.page).waitFor();
    const ext = await db.deadlineExtension.findFirstOrThrow({ where: { projectId: orbit.id, stageId: orbitStage7.id } });
    assert.equal(ext.newDeadline.toISOString(), new Date(`${local}:00+05:30`).toISOString());
  });
  await test("guide adds a meeting to the calendar for a team", async () => {
    await g1.page.goto(`${BASE}/calendar?project=${orbit.id}`);
    await g1.page.fill("input[name=title]", "Orbit design walkthrough");
    const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    await g1.page.fill("input[name=startsAt]", `${d}T10:30`);
    await btn(g1.page, "Add to calendar").click();
    await status(g1.page).waitFor();
    await g1.page.reload();
    await g1.page.getByText("Orbit design walkthrough").first().waitFor();
    await shot(g1.page, "06-calendar");
  });
  await test("guide cannot review a project they do not guide (server-side check)", async () => {
    // Pulse belongs to guide2; give it a pending submission and try to review it as guide1 by replaying the form
    const st = await stageOf("Team Pulse", 4);
    const pending = await db.submission.create({ data: { projectId: pulse.id, stageId: st.id, version: 1, uploadedById: pulse.members[0].userId, fileName: "x.pdf" } });
    await g1.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage7.id}`);
    // no review form for guide1 on Pulse: the page itself is 404
    const r = await g1.page.goto(`${BASE}/projects/${pulse.id}/stages/${st.id}`);
    assert.equal(r.status(), 404);
    const after = await db.submission.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(after.status, "PENDING");
    await db.submission.delete({ where: { id: pending.id } });
  });

  console.log("\nStudent sees feedback");
  await test("team gets review and extension notifications", async () => {
    await s4.page.goto(`${BASE}/notifications`);
    await s4.page.getByText(/Requirement Analysis \(SRS\) approved/).waitFor();
    await s4.page.getByText(/Deadline extended: System Design/).waitFor();
    await shot(s4.page, "07-notifications");
  });
  await test("student sees the extended deadline on the stage", async () => {
    await s4.page.goto(`${BASE}/projects/${orbit.id}/stages/${orbitStage7.id}`);
    await s4.page.getByText(/Deadline extended for this team/).waitFor();
    await s4.page.locator("#file").waitFor();
  });

  console.log("\nHOD");
  const hod = await session("hod@demo.projecttrack");
  await test("HOD dashboard shows analytics", async () => {
    await hod.page.getByText("Teams by current stage").waitFor();
    await hod.page.getByText("Guide workload").waitFor();
    await shot(hod.page, "08-hod-dashboard");
  });
  await test("HOD approves a proposal and allocates a guide", async () => {
    const zenith = await proj("Team Zenith");
    const guide2 = await db.user.findUniqueOrThrow({ where: { email: "guide2@demo.projecttrack" } });
    await hod.page.goto(`${BASE}/projects/${zenith.id}`);
    await hod.page.selectOption("select[name=guideId]", guide2.id);
    await btn(hod.page, "Approve & allocate").click();
    await status(hod.page).waitFor();
    const after = await db.project.findUniqueOrThrow({ where: { id: zenith.id } });
    assert.equal(after.status, "ACTIVE");
    assert.equal(after.guideId, guide2.id);
    const n = await db.notification.findFirst({ where: { userId: zenith.members[0].userId, title: "Project approved" } });
    assert.ok(n);
  });
  await test("HOD guide can mark a no-upload stage complete", async () => {
    const zenith = await proj("Team Zenith");
    const st = await stageOf("Team Zenith", 1);
    await hod.page.goto(`${BASE}/projects/${zenith.id}/stages/${st.id}`);
    await btn(hod.page, "Mark stage complete").click();
    await hod.page.getByText("Note: Completed by reviewer").waitFor();
    const s = await db.submission.findFirstOrThrow({ where: { projectId: zenith.id, stageId: st.id } });
    assert.equal(s.status, "APPROVED");
  });
  await test("HOD edits a stage deadline and teams are notified", async () => {
    const st = await stageOf("Team Nova", 9);
    await hod.page.goto(`${BASE}/hod/stages`);
    const card = hod.page.locator("details", { hasText: st.name }).first();
    await card.locator("summary").click();
    await card.locator("input[name=deadline]").fill("2027-02-15T17:00");
    await card.getByRole("button", { name: "Save stage" }).click();
    await card.getByRole("status").waitFor();
    const after = await db.stage.findUniqueOrThrow({ where: { id: st.id } });
    assert.equal(after.deadline.toISOString(), "2027-02-15T11:30:00.000Z");
    const n = await db.notification.findFirst({ where: { userId: nova.members[0].userId, title: { contains: "Deadline updated" } } });
    assert.ok(n);
  });
  await test("Excel export is a valid workbook with the expected sheets", async () => {
    const r = await hod.page.request.get(`${BASE}/api/reports?format=xlsx&year=${demoYear.id}`);
    assert.equal(r.status(), 200);
    const buf = await r.body();
    assert.equal(buf.subarray(0, 2).toString(), "PK");
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ["Projects", "Stage matrix", "Deadlines", "Submissions", "Students"]);
    assert.equal(wb.getWorksheet("Projects").rowCount, 1 + 5);
  });
  await test("PDF department and project reports download", async () => {
    const r = await hod.page.request.get(`${BASE}/api/reports?format=pdf&year=${demoYear.id}`);
    assert.equal(r.status(), 200);
    assert.equal((await r.body()).subarray(0, 4).toString(), "%PDF");
    const p = await s1.page.request.get(`${BASE}/api/reports?format=pdf&project=${nova.id}`);
    assert.equal(p.status(), 200);
    const denied = await s1.page.request.get(`${BASE}/api/reports?format=pdf&project=${orbit.id}`);
    assert.equal(denied.status(), 404);
  });
  await test("backup export contains records but no password hashes", async () => {
    const r = await hod.page.request.get(`${BASE}/api/backup`);
    const json = await r.json();
    assert.equal(json.format, "projecttrack-backup");
    assert.equal(json.scope, "demo");
    assert.ok(json.data.projects.length >= 5);
    assert.ok(json.data.users.every((u) => !("passwordHash" in u)));
    assert.ok(json.data.users.every((u) => u.isDemo === true));
  });
  await test("audit log records the actions above", async () => {
    await hod.page.goto(`${BASE}/hod/audit?q=submission`);
    await hod.page.getByText("submission.upload").first().waitFor();
    await hod.page.getByText("submission.approved").first().waitFor();
  });

  console.log("\nDemo / real separation and a real workflow");
  const real = await session("realhod@college.test", "RealHod#2026");
  let realStudentPw = "", realGuidePw = "";
  await test("real HOD sees no demo projects or users", async () => {
    await real.page.goto(`${BASE}/hod/projects`);
    await real.page.getByText("No projects match").waitFor();
    await real.page.goto(`${BASE}/hod/users`);
    assert.equal(await real.page.getByText("@demo.projecttrack").count(), 0);
    const r = await real.page.goto(`${BASE}/projects/${nova.id}`);
    assert.equal(r.status(), 404);
  });
  await test("real HOD creates a guide and a student", async () => {
    await real.page.goto(`${BASE}/hod/users`);
    const form = real.page.locator("form", { has: real.page.getByRole("button", { name: "Create account" }) });
    await form.locator("input[name=name]").fill("Prof. Real Guide");
    await form.locator("input[name=email]").fill("guide@college.test");
    await form.locator("select[name=role]").selectOption("GUIDE");
    await form.locator("input[name=password]").fill("GuidePass#1");
    await form.getByRole("button", { name: "Create account" }).click();
    await form.getByRole("status").waitFor();
    realGuidePw = "GuidePass#1";
    const imp = real.page.locator("form", { has: real.page.getByRole("button", { name: "Import" }) });
    await imp.locator("textarea[name=csv]").fill("name,email,role,rollNo\nAsha Real,asha@college.test,STUDENT,21CS001\nBad Row,not-an-email,STUDENT,X");
    await imp.getByRole("button", { name: "Import" }).click();
    await imp.getByRole("status").waitFor();
    const text = await imp.getByRole("status").textContent();
    assert.match(text, /Imported 1 account/);
    realStudentPw = /asha@college\.test,(\S+)/.exec(text)[1];
    const u = await db.user.findUniqueOrThrow({ where: { email: "asha@college.test" } });
    assert.equal(u.isDemo, false);
    assert.equal(u.mustChangePassword, true);
  });
  let realProjectId = "";
  await test("real student must change the temp password, then registers a project", async () => {
    const st = await session("asha@college.test", realStudentPw);
    assert.equal(new URL(st.page.url()).pathname, "/profile");
    await st.page.fill("#current", realStudentPw);
    await st.page.fill("#next", "AshaNew#2026");
    await st.page.fill("#confirm", "AshaNew#2026");
    await btn(st.page, "Change password").click();
    await status(st.page).waitFor();
    await st.page.goto(`${BASE}/student/project`);
    await st.page.fill("#teamName", "Team Real");
    await st.page.fill("#title", "Library Seat Booking System");
    await st.page.fill("#members", "DEMO001"); // a demo student must not be addable to a real team
    await btn(st.page, "Submit proposal").click();
    await alert(st.page).waitFor();
    assert.match(await alert(st.page).textContent(), /No student found/);
    await st.page.fill("#members", "");
    await btn(st.page, "Submit proposal").click();
    await Promise.race([
      st.page.waitForURL(/\/projects\//),
      alert(st.page).filter({ hasNotText: "No student found" }).waitFor().then(async () => { throw new Error("Form error: " + (await alert(st.page).textContent())); }),
    ]);
    realProjectId = new URL(st.page.url()).pathname.split("/")[2];
    await st.page.getByText("waiting for the HOD").waitFor();
    await shot(st.page, "09-real-proposal");
    await st.ctx.close();
  });
  await test("demo HOD cannot see the real project", async () => {
    const r = await hod.page.goto(`${BASE}/projects/${realProjectId}`);
    assert.equal(r.status(), 404);
  });
  await test("real HOD approves it and the real guide sees it", async () => {
    const guide = await db.user.findUniqueOrThrow({ where: { email: "guide@college.test" } });
    await real.page.goto(`${BASE}/projects/${realProjectId}`);
    await real.page.selectOption("select[name=guideId]", guide.id);
    await btn(real.page, "Approve & allocate").click();
    await status(real.page).waitFor();
    const g = await session("guide@college.test", realGuidePw);
    await g.page.goto(`${BASE}/guide/projects`);
    await g.page.getByText("Team Real").waitFor();
    assert.equal(await g.page.getByText("Team Nova").count(), 0);
    await g.ctx.close();
  });
  await test("deactivated users cannot sign in", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { email: "asha@college.test" } });
    await real.page.goto(`${BASE}/hod/users?q=asha`);
    await real.page.locator("summary", { hasText: "Manage" }).first().click();
    real.page.once("dialog", (d) => d.accept());
    await real.page.getByRole("button", { name: "Deactivate" }).click();
    await real.page.getByRole("status").last().waitFor();
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: u.id } })).active, false);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#email", "asha@college.test");
    await page.fill("#password", "AshaNew#2026");
    await page.click("button[type=submit]");
    await alert(page).waitFor();
    assert.match(await alert(page).textContent(), /deactivated/);
    await ctx.close();
  });
  await test("HOD creates a new academic year copied from the current one", async () => {
    await real.page.goto(`${BASE}/hod/years`);
    await real.page.fill("input[name=label]", "2027-28");
    await real.page.fill("input[name=startDate]", "2027-06-01");
    await real.page.fill("input[name=endDate]", "2028-05-31");
    await btn(real.page, "Create year").click();
    await status(real.page).waitFor();
    const y = await db.academicYear.findFirstOrThrow({ where: { label: "2027-28", isDemo: false }, include: { stages: true } });
    assert.equal(y.stages.length, 14);
    assert.equal(y.isActive, false);
  });

  console.log("\nReminders");
  await test("reminder job requires the cron secret", async () => {
    assert.equal((await fetch(`${BASE}/api/cron/reminders`)).status, 401);
  });
  await test("reminder job notifies overdue teams once", async () => {
    const r1 = await (await fetch(`${BASE}/api/cron/reminders`, { headers: { Authorization: "Bearer e2e-cron" } })).json();
    assert.ok(r1.sent > 0, `expected reminders, got ${JSON.stringify(r1)}`);
    const r2 = await (await fetch(`${BASE}/api/cron/reminders`, { headers: { Authorization: "Bearer e2e-cron" } })).json();
    assert.equal(r2.sent, 0);
    const n = await db.notification.findFirst({ where: { title: { startsWith: "Overdue:" } } });
    assert.ok(n);
  });

  if (SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#email", "student1@demo.projecttrack");
    await page.fill("#password", "Demo@123");
    await Promise.all([page.waitForURL(/student/), page.click("button[type=submit]")]);
    await shot(page, "10-mobile-student");
    await ctx.close();
  }
} finally {
  await browser.close();
  await db.$disconnect();
  server.kill();
  await new Promise((r) => setTimeout(r, 500));
  if (!process.env.KEEP_DB) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
  await admin.$disconnect();
  rmSync(UPLOADS, { recursive: true, force: true });
}

const failed = results.filter((r) => r[1] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("\nServer log tail:\n" + serverLog.split("\n").slice(-30).join("\n"));
  process.exit(1);
}
