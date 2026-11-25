import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader, Empty, Badge, fmtDate, SubmissionBadge, Card } from "@/components/ui";

export const metadata = { title: "Review queue" };

export default async function ReviewQueue() {
  const user = await requireUser("GUIDE");
  const [pending, recent] = await Promise.all([
    prisma.submission.findMany({
      where: { status: "PENDING", project: { guideId: user.id, isDemo: user.isDemo } },
      include: { project: { select: { teamName: true, title: true } }, stage: { select: { name: true, order: true } }, uploadedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.submission.findMany({
      where: { reviewedById: user.id, project: { isDemo: user.isDemo } },
      include: { project: { select: { teamName: true } }, stage: { select: { name: true } } },
      orderBy: { reviewedAt: "desc" }, take: 15,
    }),
  ]);
  return (
    <div>
      <PageHeader title="Review queue" subtitle="Oldest first. Open a submission to download it and record your decision." />
      {pending.length === 0 ? <Empty title="You are all caught up">New uploads from your teams will appear here.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Team</th><th>Stage</th><th>Version</th><th>Uploaded</th><th></th></tr></thead>
            <tbody>
              {pending.map((s) => (
                <tr key={s.id}>
                  <td><div className="font-medium">{s.project.teamName}</div><div className="max-w-xs truncate text-xs text-muted">{s.project.title}</div></td>
                  <td>{s.stage.order}. {s.stage.name}</td>
                  <td>v{s.version} {s.isLate && <Badge tone="bad">Late</Badge>}</td>
                  <td className="whitespace-nowrap">{fmtDate(s.createdAt, true)}<div className="text-xs text-muted">{s.uploadedBy.name}</div></td>
                  <td className="text-right"><Link href={`/projects/${s.projectId}/stages/${s.stageId}`} className="btn-primary px-3 py-1.5 text-xs">Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Card title="Recently reviewed" className="mt-6">
        {recent.length === 0 ? <p className="text-sm text-muted">No reviews yet.</p> : (
          <ul className="divide-y divide-border text-sm">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/projects/${s.projectId}/stages/${s.stageId}`} className="hover:underline">{s.project.teamName} · {s.stage.name} v{s.version}</Link>
                <span className="flex items-center gap-2 text-xs text-muted">{fmtDate(s.reviewedAt)}<SubmissionBadge status={s.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
