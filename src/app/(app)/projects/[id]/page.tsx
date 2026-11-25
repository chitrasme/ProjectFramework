import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { requireUser } from "@/lib/session";
import { loadProjectForUser } from "@/lib/data";
import { prisma } from "@/lib/db";
import { canReviewProject } from "@/lib/access";
import { Card, PageHeader, Progress, StateBadge, ProjectStatusBadge, DaysLeft, fmtDate, Badge, Notice } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { addRemarkAction } from "@/app/actions/review";
import { updateProjectAction } from "@/app/actions/student";
import { HodProjectPanel } from "./hod-panel";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { project, scope, views, progress, current } = await loadProjectForUser(user, id);
  const reviewer = canReviewProject(user, scope);
  const isMember = scope.memberIds.includes(user.id);
  const [remarks, events, guides] = await Promise.all([
    prisma.remark.findMany({ where: { projectId: id }, include: { author: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.calendarEvent.findMany({ where: { projectId: id, startsAt: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { startsAt: "asc" }, take: 5 }),
    user.role === "HOD"
      ? prisma.user.findMany({ where: { role: "GUIDE", isDemo: user.isDemo, active: true }, select: { id: true, name: true, _count: { select: { guidedProjects: true } } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const editable = isMember || reviewer;

  return (
    <div>
      <div className="mb-2 text-sm text-muted">
        {user.role === "HOD" ? <Link className="link" href="/hod/projects">Projects</Link> : user.role === "GUIDE" ? <Link className="link" href="/guide/projects">My Teams</Link> : "My Project"}
        <ChevronRight size={14} className="mx-1 inline" />{project.teamName}
      </div>
      <PageHeader
        title={project.title}
        subtitle={<>{project.teamName} · {project.academicYear.label} · Guide: {project.guide?.name ?? "not allocated yet"}</>}
        actions={<><a href={`/api/reports?format=pdf&project=${id}`} className="btn-secondary px-3 py-1.5 text-xs">PDF report</a><ProjectStatusBadge status={project.status} /></>}
      />

      {project.status === "PROPOSED" && isMember && <div className="mb-4"><Notice tone="warn">Your proposal is waiting for the HOD to approve it and allocate a guide. Stage uploads open after that.</Notice></div>}
      {project.status === "REJECTED" && <div className="mb-4"><Notice tone="bad">This proposal was rejected. Check the remarks below and submit a new proposal from My Project.</Notice></div>}
      {user.role === "HOD" && <div className="mb-6"><HodProjectPanel project={{ id: project.id, status: project.status, guideId: project.guideId }} guides={guides.map((g) => ({ id: g.id, name: g.name, load: g._count.guidedProjects }))} /></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Progress">
            <Progress value={progress} />
            <p className="mt-2 text-sm text-muted">
              {current ? <>Current stage: <span className="font-medium text-text">{current.stage.order}. {current.stage.name}</span>{current.deadline && <> · due {fmtDate(current.deadline)}</>}</> : "All stages approved."}
            </p>
          </Card>
          <Card title={`Stages (${views.length})`}>
            <ol className="-my-2 divide-y divide-border">
              {views.map((v) => (
                <li key={v.stage.id}>
                  <Link href={`/projects/${id}/stages/${v.stage.id}`} className="flex items-center gap-3 py-2.5 hover:bg-surface-2 -mx-2 px-2 rounded-md">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${v.state === "APPROVED" ? "bg-ok text-white" : v.state === "LOCKED" ? "bg-surface-2 text-muted" : "bg-brand-soft text-brand"}`}>
                      {v.state === "LOCKED" ? <Lock size={12} /> : v.stage.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{v.stage.name}</div>
                      <div className="text-xs text-muted">
                        Due {fmtDate(v.deadline)}{v.extended && " (extended)"}{v.latestVersion > 0 && ` · v${v.latestVersion}`}{!v.stage.requiresDocument && " · no upload"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <StateBadge state={v.state} />
                      <DaysLeft days={v.daysLeft} state={v.state} />
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Remarks & discussion" className="scroll-mt-6" >
            <div id="remarks" />
            <ActionForm action={addRemarkAction} className="mb-4">
              <input type="hidden" name="projectId" value={id} />
              <textarea name="body" rows={2} className="input" placeholder={reviewer ? "Feedback, meeting notes or instructions for the team…" : "Ask your guide a question or share an update…"} required />
              <div className="mt-2 flex justify-end"><Submit>Post remark</Submit></div>
            </ActionForm>
            {remarks.length === 0 ? <p className="text-sm text-muted">No remarks yet.</p> : (
              <ul className="space-y-3">
                {remarks.map((r) => (
                  <li key={r.id} className="rounded-md bg-surface-2 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="font-medium text-text">{r.author.name}</span>
                      <Badge>{r.author.role === "STUDENT" ? "Student" : r.author.role === "GUIDE" ? "Guide" : "HOD"}</Badge>
                      <span>{fmtDate(r.createdAt, true)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Team">
            <ul className="space-y-2">
              {project.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.user.name}</div>
                    <div className="truncate text-xs text-muted">{m.user.rollNo} · {m.user.email}</div>
                  </div>
                  {m.isLeader && <Badge tone="brand">Leader</Badge>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Upcoming">
            {events.length === 0 ? <p className="text-sm text-muted">No meetings or reviews scheduled.</p> : (
              <ul className="space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id}><div className="font-medium">{e.title}</div><div className="text-xs text-muted">{fmtDate(e.startsAt, true)}</div></li>
                ))}
              </ul>
            )}
            {reviewer && <Link href={`/calendar?project=${id}`} className="link mt-3 inline-block text-sm">Schedule a meeting or review →</Link>}
          </Card>
          <Card title="Project details">
            {editable ? (
              <ActionForm action={updateProjectAction} resetOnSuccess={false} className="space-y-3">
                <input type="hidden" name="projectId" value={id} />
                <div><label className="label">Team name</label><input name="teamName" defaultValue={project.teamName} className="input" /></div>
                <div>
                  <label className="label">Title</label>
                  <input name="title" defaultValue={project.title} className="input" readOnly={user.role === "STUDENT" && project.status !== "PROPOSED"} />
                </div>
                <div><label className="label">Domain</label><input name="domain" defaultValue={project.domain} className="input" /></div>
                <div><label className="label">Technologies</label><input name="technologies" defaultValue={project.technologies} className="input" /></div>
                <div><label className="label">Abstract</label><textarea name="abstract" rows={5} defaultValue={project.abstract} className="input" /></div>
                <Submit className="btn-secondary w-full">Save details</Submit>
              </ActionForm>
            ) : (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-muted">Domain</dt><dd>{project.domain || "—"}</dd></div>
                <div><dt className="text-muted">Technologies</dt><dd>{project.technologies || "—"}</dd></div>
                <div><dt className="text-muted">Abstract</dt><dd className="whitespace-pre-wrap">{project.abstract || "—"}</dd></div>
              </dl>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
