import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";

// Called by a scheduler (Vercel Cron, GitHub Actions, cron + curl) with  Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runReminders();
  return NextResponse.json({ ok: true, ...result });
}
