import { ActionForm, Submit } from "@/components/action-form";
import { assignGuideAction, setProjectStatusAction } from "@/app/actions/hod";

export function HodProjectPanel({ project, guides }: { project: { id: string; status: string; guideId: string | null }; guides: { id: string; name: string; load: number }[] }) {
  return (
    <div className="card flex flex-wrap items-end gap-4 border-brand/30 bg-brand-soft/40 p-4">
      <ActionForm action={assignGuideAction} resetOnSuccess={false} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="projectId" value={project.id} />
        <div>
          <label className="label">{project.status === "PROPOSED" ? "Approve & allocate guide" : "Project guide"}</label>
          <select name="guideId" defaultValue={project.guideId ?? ""} className="input min-w-64" required>
            <option value="" disabled>Select a guide…</option>
            {guides.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.load} team{g.load === 1 ? "" : "s"})</option>)}
          </select>
        </div>
        <Submit>{project.status === "PROPOSED" ? "Approve & allocate" : "Change guide"}</Submit>
      </ActionForm>
      {project.status === "PROPOSED" && (
        <ActionForm action={setProjectStatusAction} confirm="Reject this proposal? The team will be notified." className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="status" value="REJECTED" />
          <div><label className="label">Reason</label><input name="reason" className="input min-w-64" placeholder="Why the proposal is rejected" required /></div>
          <Submit className="btn-danger">Reject</Submit>
        </ActionForm>
      )}
      {project.status === "REJECTED" && (
        <ActionForm action={setProjectStatusAction}>
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="status" value="PROPOSED" />
          <Submit className="btn-secondary">Reopen proposal</Submit>
        </ActionForm>
      )}
    </div>
  );
}
