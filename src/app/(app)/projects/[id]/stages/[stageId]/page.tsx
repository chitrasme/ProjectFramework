import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, FileText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { loadProjectForUser } from "@/lib/data";
import { canReviewProject, canSubmitForProject } from "@/lib/access";
import { canSubmit } from "@/lib/progress";
import { toLocalInput } from "@/lib/time";
import { Card, PageHeader, StateBadge, SubmissionBadge, fmtDate, fmtSize, Notice, Badge, DaysLeft } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { submitStageAction } from "@/app/actions/student";
import { reviewSubmissionAction, completeStageAction, extendDeadlineAction } from "@/app/actions/review";

export default async function StagePage({ params }: { params: Promise<{ id: string; stageId: string }> }) {
  const { id, stageId } = await params;
  const user = await requireUser();
  const { project, scope, views, submissions } = await loadProjectForUser(user, id);
  const view = views.find((v) => v.stage.id === stageId);
  if (!view) notFound();
  const stage = view.stage;
  const versions = submissions.filter((s) => s.stageId === stageId);
  const latest = versions[0];
  const reviewer = canReviewProject(user, scope);
  const student = canSubmitForProject(user, scope);
  const submitCheck = canSubmit(view);
  const ext = project.extensions.find((e) => e.stageId === stageId);

  return (
    <div>
      <div className="mb-2 text-sm text-muted">
        <Link className="link" href={`/projects/${id}`}>{project.teamName}</Link>
        <ChevronRight size={14} className="mx-1 inline" />Stage {stage.order}
      </div>
      <PageHeader title={`${stage.order}. ${stage.name}`} subtitle={project.title} actions={<StateBadge state={view.state} />} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="About this stage">
            <p className="text-sm whitespace-pre-wrap">{stage.description || "No description."}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted">Deadline</dt><dd className="font-medium">{fmtDate(view.deadline, true)}</dd><DaysLeft days={view.daysLeft} state={view.state} /></div>
              <div><dt className="text-xs text-muted">Upload</dt><dd>{stage.requiresDocument ? "Required" : "Not needed"}</dd></div>
              <div><dt className="text-xs text-muted">File types</dt><dd className="break-words">{stage.requiresDocument ? stage.allowedTypes.split(",").join(", ") : "—"}</dd></div>
              <div><dt className="text-xs text-muted">Max marks</dt><dd>{stage.maxMarks || "—"}</dd></div>
            </dl>
            {ext && <div className="mt-3"><Notice tone="info">Deadline extended for this team to {fmtDate(ext.newDeadline, true)}{ext.reason && ` – ${ext.reason}`}.</Notice></div>}
          </Card>

          {student && (
            <Card title="Upload a version">
              {project.status !== "ACTIVE" ? (
                <Notice tone="warn">Uploads open once the HOD approves your project and allocates a guide.</Notice>
              ) : submitCheck.ok ? (
                <ActionForm action={submitStageAction} className="space-y-3">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="stageId" value={stageId} />
                  {view.state === "OVERDUE" && <Notice tone="bad">The deadline has passed. You can still upload, but the submission will be marked late.</Notice>}
                  {latest?.status === "CHANGES_REQUESTED" && <Notice tone="warn">Your guide asked for changes. Upload a revised version (v{view.latestVersion + 1}).</Notice>}
                  <div>
                    <label className="label" htmlFor="file">File</label>
                    <input id="file" name="file" type="file" required accept={stage.allowedTypes} className="input file:mr-3 file:rounded file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-brand" />
                    <p className="mt-1 text-xs text-muted">Allowed: {stage.allowedTypes.split(",").join(", ")} · Max {process.env.MAX_UPLOAD_MB || 25} MB</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="note">Note for your guide (optional)</label>
                    <textarea id="note" name="note" rows={3} className="input" placeholder="What changed in this version?" />
                  </div>
                  <Submit pendingText="Uploading…">Upload version {view.latestVersion + 1}</Submit>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted">{submitCheck.reason}</p>
              )}
            </Card>
          )}

          {reviewer && latest?.status === "PENDING" && (
            <Card title={`Review version ${latest.version}`} className="border-info/40">
              <ActionForm action={reviewSubmissionAction} className="space-y-3">
                <input type="hidden" name="submissionId" value={latest.id} />
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="decision" value="APPROVED" required /> Approve</label>
                  <label className="flex items-center gap-2"><input type="radio" name="decision" value="CHANGES_REQUESTED" /> Request changes</label>
                  <label className="flex items-center gap-2"><input type="radio" name="decision" value="REJECTED" /> Reject</label>
                </div>
                <div>
                  <label className="label" htmlFor="comment">Feedback</label>
                  <textarea id="comment" name="comment" rows={4} className="input" placeholder="Required when requesting changes or rejecting" />
                </div>
                {stage.maxMarks > 0 && (
                  <div className="max-w-40">
                    <label className="label" htmlFor="marks">Marks (out of {stage.maxMarks})</label>
                    <input id="marks" name="marks" type="number" min={0} max={stage.maxMarks} className="input" />
                  </div>
                )}
                <Submit>Save review</Submit>
              </ActionForm>
            </Card>
          )}

          {reviewer && !stage.requiresDocument && view.state !== "APPROVED" && (
            <Card title="Complete this stage">
              {view.state === "LOCKED" ? <p className="text-sm text-muted">Earlier stages must be completed first.</p> : project.status !== "ACTIVE" ? <p className="text-sm text-muted">The project must be approved first.</p> : (
                <ActionForm action={completeStageAction} className="space-y-3">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="stageId" value={stageId} />
                  <input name="comment" className="input" placeholder="Comment (optional)" />
                  <Submit className="btn-ok">Mark stage complete</Submit>
                </ActionForm>
              )}
            </Card>
          )}

          <Card title={`Version history (${versions.length})`}>
            {versions.length === 0 ? <p className="text-sm text-muted">Nothing submitted yet.</p> : (
              <ol className="space-y-4">
                {versions.map((s) => (
                  <li key={s.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">v{s.version}</span>
                      <SubmissionBadge status={s.status} />
                      {s.isLate && <Badge tone="bad">Late</Badge>}
                      <span className="text-xs text-muted">by {s.uploadedBy.name} · {fmtDate(s.createdAt, true)}</span>
                    </div>
                    {s.fileKey && (
                      <a href={`/api/files/${s.id}`} className="mt-2 inline-flex items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-sm hover:bg-border">
                        <FileText size={15} /> {s.fileName} <span className="text-xs text-muted">{fmtSize(s.fileSize)}</span> <Download size={14} />
                      </a>
                    )}
                    {s.note && <p className="mt-2 text-sm text-muted whitespace-pre-wrap">Note: {s.note}</p>}
                    {s.reviewedAt && (
                      <div className="mt-2 border-l-2 border-border pl-3 text-sm">
                        <div className="text-xs text-muted">Reviewed by {s.reviewedBy?.name} · {fmtDate(s.reviewedAt, true)}{s.marks != null && <> · <span className="font-medium text-text">{s.marks}/{stage.maxMarks} marks</span></>}</div>
                        {s.reviewComment && <p className="mt-1 whitespace-pre-wrap">{s.reviewComment}</p>}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {reviewer && view.state !== "APPROVED" && (
            <Card title="Team deadline">
              <ActionForm action={extendDeadlineAction} className="space-y-3" resetOnSuccess={false}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="stageId" value={stageId} />
                <div>
                  <label className="label" htmlFor="newDeadline">New deadline for this team</label>
                  <input id="newDeadline" name="newDeadline" type="datetime-local" className="input" defaultValue={toLocalInput(view.deadline)} required />
                </div>
                <input name="reason" className="input" placeholder="Reason (shared with the team)" />
                <Submit className="btn-secondary w-full">Extend deadline</Submit>
              </ActionForm>
              {ext && (
                <ActionForm action={extendDeadlineAction} className="mt-2">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="stageId" value={stageId} />
                  <input type="hidden" name="clear" value="1" />
                  <button className="text-xs text-bad hover:underline">Remove extension</button>
                </ActionForm>
              )}
            </Card>
          )}
          <Card title="All stages">
            <ul className="space-y-1 text-sm">
              {views.map((v) => (
                <li key={v.stage.id}>
                  <Link href={`/projects/${id}/stages/${v.stage.id}`} className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${v.stage.id === stageId ? "bg-brand-soft text-brand" : "hover:bg-surface-2"}`}>
                    <span className="truncate">{v.stage.order}. {v.stage.name}</span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${v.state === "APPROVED" ? "bg-ok" : v.state === "OVERDUE" || v.state === "REJECTED" ? "bg-bad" : v.state === "UNDER_REVIEW" ? "bg-info" : v.state === "CHANGES_REQUESTED" ? "bg-warn" : "bg-border"}`} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
