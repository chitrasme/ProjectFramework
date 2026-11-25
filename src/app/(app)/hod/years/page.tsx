import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, fmtDate } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { createYearAction, activateYearAction, archiveYearAction } from "@/app/actions/hod";

export const metadata = { title: "Academic years" };

export default async function YearsPage() {
  const user = await requireUser("HOD");
  const years = await prisma.academicYear.findMany({
    where: { isDemo: user.isDemo },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { projects: true, stages: true } } },
  });
  return (
    <div>
      <PageHeader title="Academic years" subtitle="Each batch has its own stages, deadlines and projects. New student proposals go to the active year." />
      <div className="card mb-6 overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Year</th><th>Dates</th><th>Stages</th><th>Projects</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id}>
                <td className="font-medium">{y.label}</td>
                <td className="text-sm">{fmtDate(y.startDate)} – {fmtDate(y.endDate)}</td>
                <td className="tabular-nums"><Link className="link" href={`/hod/stages?year=${y.id}`}>{y._count.stages}</Link></td>
                <td className="tabular-nums"><Link className="link" href={`/hod/projects?year=${y.id}`}>{y._count.projects}</Link></td>
                <td>{y.isActive ? <Badge tone="ok">Active</Badge> : y.archived ? <Badge>Archived</Badge> : <Badge tone="brand">Open</Badge>}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    {!y.isActive && <form action={activateYearAction}><input type="hidden" name="yearId" value={y.id} /><button className="btn-secondary px-2 py-1 text-xs">Make active</button></form>}
                    {!y.isActive && <form action={archiveYearAction}><input type="hidden" name="yearId" value={y.id} /><button className="btn-secondary px-2 py-1 text-xs">{y.archived ? "Unarchive" : "Archive"}</button></form>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card title="Create an academic year">
        <ActionForm action={createYearAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="label">Label</label><input name="label" placeholder="2027-28" className="input" required /></div>
          <div><label className="label">Start date</label><input name="startDate" type="date" className="input" required /></div>
          <div><label className="label">End date</label><input name="endDate" type="date" className="input" required /></div>
          <div>
            <label className="label">Stages</label>
            <select name="copyFrom" className="input" defaultValue={years[0]?.id ?? ""}>
              <option value="">Default 14 stages</option>
              {years.map((y) => <option key={y.id} value={y.id}>Copy from {y.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4"><Submit>Create year</Submit><p className="mt-1 text-xs text-muted">Copied deadlines keep the same distance from the start date.</p></div>
        </ActionForm>
      </Card>
    </div>
  );
}
