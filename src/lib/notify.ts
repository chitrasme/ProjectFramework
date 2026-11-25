import nodemailer from "nodemailer";
import { prisma } from "./db";

type Note = { title: string; body: string; link?: string; kind?: string };

let transporter: nodemailer.Transporter | null | undefined;
function mailer() {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST) return (transporter = null);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** In-app notification for each user, plus email when SMTP is configured (never for demo users). */
export async function notify(userIds: (string | null | undefined)[], note: Note) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({ userId, title: note.title, body: note.body, link: note.link, kind: note.kind ?? "INFO" })),
  });
  const t = mailer();
  if (!t) return;
  const users = await prisma.user.findMany({ where: { id: { in: ids }, isDemo: false, active: true }, select: { email: true } });
  const url = note.link ? `${process.env.APP_URL ?? ""}${note.link}` : process.env.APP_URL ?? "";
  await Promise.allSettled(
    users.map((u) =>
      t.sendMail({
        from: process.env.SMTP_FROM,
        to: u.email,
        subject: `[ProjectTrack] ${note.title}`,
        text: `${note.body}\n\n${url}`,
      }),
    ),
  );
}

export async function projectMemberIds(projectId: string) {
  const members = await prisma.teamMember.findMany({ where: { projectId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

export async function hodIds(isDemo: boolean) {
  const hods = await prisma.user.findMany({ where: { role: "HOD", isDemo, active: true }, select: { id: true } });
  return hods.map((h) => h.id);
}
