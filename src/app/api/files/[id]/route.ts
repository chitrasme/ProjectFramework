import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canViewProject } from "@/lib/access";
import { getFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const sub = await prisma.submission.findUnique({ where: { id }, include: { project: { include: { members: { select: { userId: true } } } } } });
  // Same 404 for "missing" and "not yours" so file ids cannot be probed.
  if (!sub || !sub.fileKey) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scope = { isDemo: sub.project.isDemo, guideId: sub.project.guideId, memberIds: sub.project.members.map((m) => m.userId) };
  if (!canViewProject(user, scope)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await getFile(sub.fileKey);
  await audit(user, "submission.download", "Submission", sub.id, { fileName: sub.fileName });
  const name = (sub.fileName || "file").replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": sub.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
