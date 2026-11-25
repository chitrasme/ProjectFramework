import { ArrowDown, ArrowUp } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveYear } from "@/lib/data";
import { toLocalInput } from "@/lib/time";
import { Card, PageHeader, Empty, Badge, fmtDate } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { YearSwitcher } from "@/components/year-switcher";
import { updateStageAction, addStageAction, moveStageAction, deleteStageAction, shiftDeadlinesAction } from "@/app/actions/hod";

export const metadata = { title: "Stages & deadlines" };

export default async function StagesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser("HOD");
  const sp = await searchParams;
  const year = await resolveYear(user.isDemo, sp.year);
  const years = await prisma.academicYear.findMany({ where: { isDemo: user.isDemo }, orderBy: { startDate: "desc" } });
  if (!year) return <Empty title="No academic year yet">Create one under Academic Years.</Empty>;
  const stages = await prisma.stage.findMany({ where: { academicYearId: year.id }, orderBy: { order: "asc" }, include: { _count: { select: { submissions: true } } } });

  return (
    <div>
      <PageHeader
        title="Stages & deadlines"
        subtitle={`${stages.filter((s) => s.isActive).length} active stages in ${year.label}. Teams move through active stages in this order.`}
        actions={<YearSwitcher years={years} current={year.id} />}
      />
      <Card title="Move deadlines" className="mb-6">
        <ActionForm action={shiftDeadlinesAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="yearId" value={year.id} />
          <div><label className="label">From stage</label><select name="fromOrder" className="input w-auto">{stages.map((s) => <option key={s.id} value={s.order}>{s.order}. {s.name}</option>)}</select></div>
          <div><label className="label">Days (negative = earlier)</label><input name="days" type="number" className="input w-32" required /></div>
          <Submit className="btn-secondary">Move deadlines</Submit>
          <p className="w-full text-xs text-muted">Useful when the semester calendar changes. Teams are notified.</p>
        </ActionForm>
      </Card>

      <div className="space-y-3">
        {stages.map((s, i) => (
          <details key={s.id} className="card group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{s.order}</span>
              <span className="flex-1 font-medium">{s.name}</span>
              {!s.isActive && <Badge tone="gray">Off</Badge>}
              {!s.requiresDocument && <Badge tone="info">No upload</Badge>}
              {s.maxMarks > 0 && <Badge>{s.maxMarks} marks</Badge>}
              <span className="text-sm text-muted">{fmtDate(s.deadline, true)}</span>
              <span className="flex gap-1">
                <form action={moveStageAction}><input type="hidden" name="stageId" value={s.id} /><input type="hidden" name="dir" value="up" /><button disabled={i === 0} className="btn-secondary p-1.5" aria-label="Move up"><ArrowUp size={14} /></button></form>
                <form action={moveStageAction}><input type="hidden" name="stageId" value={s.id} /><input type="hidden" name="dir" value="down" /><button disabled={i === stages.length - 1} className="btn-secondary p-1.5" aria-label="Move down"><ArrowDown size={14} /></button></form>
              </span>
            </summary>
            <div className="border-t border-border p-4">
              <ActionForm action={updateStageAction} resetOnSuccess={false} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="stageId" value={s.id} />
                <div><label className="label">Name</label><input name="name" defaultValue={s.name} className="input" required /></div>
                <div><label className="label">Deadline</label><input name="deadline" type="datetime-local" defaultValue={toLocalInput(s.deadline)} className="input" /></div>
                <div className="sm:col-span-2"><label className="label">Description / instructions</label><textarea name="description" defaultValue={s.description} rows={2} className="input" /></div>
                <div><label className="label">Allowed file types</label><input name="allowedTypes" defaultValue={s.allowedTypes} className="input" /></div>
                <div><label className="label">Max marks</label><input name="maxMarks" type="number" min={0} max={100} defaultValue={s.maxMarks} className="input" /></div>
                <div className="flex flex-wrap gap-5 text-sm sm:col-span-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="requiresDocument" defaultChecked={s.requiresDocument} /> Students upload a document</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={s.isActive} /> Active</label>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Submit>Save stage</Submit>
                  <span className="text-xs text-muted">{s._count.submissions} submission(s)</span>
                </div>
              </ActionForm>
              {s._count.submissions === 0 && (
                <ActionForm action={deleteStageAction} confirm={`Delete stage "${s.name}"?`} className="mt-3">
                  <input type="hidden" name="stageId" value={s.id} />
                  <button className="text-xs text-bad hover:underline">Delete stage</button>
                </ActionForm>
              )}
            </div>
          </details>
        ))}
      </div>

      <Card title="Add a stage" className="mt-6">
        <ActionForm action={addStageAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="yearId" value={year.id} />
          <div><label className="label">Name</label><input name="name" className="input" required /></div>
          <div><label className="label">Deadline</label><input name="deadline" type="datetime-local" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><textarea name="description" rows={2} className="input" /></div>
          <div><label className="label">Allowed file types</label><input name="allowedTypes" defaultValue=".pdf,.doc,.docx,.ppt,.pptx,.zip" className="input" /></div>
          <div><label className="label">Max marks</label><input name="maxMarks" type="number" min={0} max={100} defaultValue={0} className="input" /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="requiresDocument" defaultChecked /> Students upload a document</label>
          <div className="sm:col-span-2"><Submit>Add stage</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
