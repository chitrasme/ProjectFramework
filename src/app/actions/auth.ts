"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, homeFor } from "@/lib/session";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/components/action-form";

// Simple in-memory brute-force guard (per server instance): 8 failures per email per 15 minutes.
const failures = new Map<string, { count: number; until: number }>();

export async function loginAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const f = failures.get(email);
  if (f && f.count >= 8 && f.until > Date.now()) return { error: "Too many failed attempts. Try again in 15 minutes." };

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) {
    const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + 15 * 60_000 };
    failures.set(email, { count: cur.count + 1, until: cur.until });
    return { error: user && !user.active ? "This account has been deactivated. Contact your HOD." : "Incorrect email or password." };
  }
  failures.delete(email);
  await createSession(user.id);
  await audit(user, "auth.login", "User", user.id);
  redirect(user.mustChangePassword ? "/profile?first=1" : homeFor(user.role));
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await audit(user, "auth.logout", "User", user.id);
  await destroySession();
  redirect("/login");
}

const pwSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(8, "New password must be at least 8 characters.").regex(/[0-9]/, "Include at least one number.").regex(/[A-Za-z]/, "Include at least one letter."),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The new passwords do not match." });

export async function changePasswordAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = pwSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await bcrypt.compare(parsed.data.current, row.passwordHash))) return { error: "Current password is incorrect." };
  if (user.isDemo) return { error: "Demo account passwords cannot be changed." };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.next, 10), mustChangePassword: false } });
  await audit(user, "auth.change_password", "User", user.id);
  return { ok: "Password changed." };
}

export async function updateProfileAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  if (name.length < 2) return { error: "Enter your name." };
  await prisma.user.update({ where: { id: user.id }, data: { name, phone: phone || null } });
  await audit(user, "user.update_profile", "User", user.id);
  return { ok: "Profile saved." };
}
