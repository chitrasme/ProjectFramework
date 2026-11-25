import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { snapshot } from "@/lib/backup";
import { audit } from "@/lib/audit";

// HOD-only JSON export of the department's records (password hashes are left out).
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "HOD") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const snap = await snapshot(prisma, { isDemo: user.isDemo, includePasswordHashes: false });
  await audit(user, "backup.download", "System", null, snap.counts);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(snap, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="projecttrack-backup-${stamp}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
