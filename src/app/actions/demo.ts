"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { seedDemo, wipeDemo } from "@/lib/seed-data";
import type { ActionResult } from "@/components/action-form";

// Only a real HOD manages demo data (a demo HOD would delete its own account).
async function realHod() {
  const user = await requireUser("HOD");
  return user.isDemo ? null : user;
}

export async function loadDemoAction(): Promise<ActionResult> {
  const user = await realHod();
  if (!user) return { error: "Only a real HOD account can manage demo data." };
  try {
    await wipeDemo(prisma);
    await seedDemo(prisma);
  } catch (e) {
    console.error("Demo data could not be loaded", e);
    await wipeDemo(prisma).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Demo data could not be loaded: ${msg.slice(0, 300)}. Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and that the "${process.env.SUPABASE_BUCKET || "projecttrack"}" bucket exists.` };
  }
  await audit(user, "demo.load", "System");
  revalidatePath("/hod/backup");
  return { ok: "Demo data loaded. Demo accounts use the password Demo@123." };
}

export async function removeDemoAction(): Promise<ActionResult> {
  const user = await realHod();
  if (!user) return { error: "Only a real HOD account can manage demo data." };
  await wipeDemo(prisma);
  await audit(user, "demo.remove", "System");
  revalidatePath("/hod/backup");
  return { ok: "All demo accounts and demo data removed." };
}
