"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function markAllReadAction() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
}

export async function openNotificationAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  const n = await prisma.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return;
  await prisma.notification.update({ where: { id }, data: { read: true } });
  revalidatePath("/", "layout");
  if (n.link?.startsWith("/")) redirect(n.link);
}
