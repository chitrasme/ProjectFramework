import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { canViewProject } from "@/lib/access";
import { audit } from "@/lib/audit";
import { buildExcel, buildYearPdf, buildProjectPdf } from "@/lib/reports";

// GET /api/reports?format=xlsx|pdf&year=<id>      department reports (HOD)
// GET /api/reports?format=pdf&project=<id>         single project report (HOD, its guide, its members)
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const projectId = url.searchParams.get("project");
  const yearId = url.searchParams.get("year");

  let out: { buffer: Buffer; filename: string } | null = null;
  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, include: { members: { select: { userId: true } } } });
    if (!p || !canViewProject(user, { isDemo: p.isDemo, guideId: p.guideId, memberIds: p.members.map((m) => m.userId) }))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    out = await buildProjectPdf(projectId);
  } else {
    if (user.role !== "HOD") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!yearId) return NextResponse.json({ error: "year is required" }, { status: 400 });
    out = format === "xlsx" ? await buildExcel(yearId, user.isDemo) : await buildYearPdf(yearId, user.isDemo, user.department);
  }
  if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit(user, "report.export", "Report", projectId ?? yearId, { format: projectId ? "pdf" : format });
  return new NextResponse(new Uint8Array(out.buffer), {
    headers: {
      "Content-Type": out.filename.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${out.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
