"use server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { ensureRealYear, seedDemo, wipeDemo } from "@/lib/seed-data";
import type { ActionResult } from "@/components/action-form";

/** Setup is open only while SETUP_TOKEN is set and no real HOD account exists yet. */
export async function setupIsOpen() {
  if (!process.env.SETUP_TOKEN) return false;
  const hods = await prisma.user.count({ where: { role: "HOD", isDemo: false } });
  return hods === 0;
}

function tokenMatches(given: string) {
  const expected = Buffer.from(process.env.SETUP_TOKEN ?? "");
  const actual = Buffer.from(given);
  return expected.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const schema = z
  .object({
    token: z.string().min(1, "Enter the setup token."),
    name: z.string().trim().min(2, "Enter your name."),
    email: z.string().trim().toLowerCase().email("Enter a valid email."),
    department: z.string().trim().min(2, "Enter the department name."),
    password: z.string().min(8, "Password must be at least 8 characters.").regex(/[0-9]/, "Include a number.").regex(/[A-Za-z]/, "Include a letter."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match." });

export async function setupAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  if (!(await setupIsOpen())) return { error: "Setup is already complete. Sign in instead." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!tokenMatches(d.token)) return { error: "The setup token is wrong." };

  await ensureRealYear(prisma);
  const hod = await prisma.user.upsert({
    where: { email: d.email },
    create: { name: d.name, email: d.email, role: "HOD", department: d.department, isDemo: false, passwordHash: await bcrypt.hash(d.password, 10) },
    update: { name: d.name, role: "HOD", department: d.department, isDemo: false, active: true, passwordHash: await bcrypt.hash(d.password, 10) },
  });
  if (form.get("demo") === "on") {
    await wipeDemo(prisma);
    await seedDemo(prisma);
  }
  await audit(hod, "system.setup", "User", hod.id, { demo: form.get("demo") === "on" });
  await createSession(hod.id);
  redirect("/hod");
}
