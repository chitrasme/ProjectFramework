import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getActiveYear, loadProjectForUser } from "@/lib/data";
import { Card, PageHeader, Progress, Stat, StateBadge, SubmissionBadge, ProjectStatusBadge, DaysLeft, Empty, fmtDate, Notice } from "@/components/ui";

export const metadata = { title: "Student dashboard" };

export default async function StudentDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser("STUDENT");
  const { denied } = await searchParams;
  const year = await getActiveYear(user.isDemo);
  const membership = await prisma.teamMember.findFirst({
    where: { userId: user.id, project: { status: { not: "REJECTED" }, ...(year ? { academicYearId: year.id } : {}) } },
    orderBy: { project: { createdAt: "desc" } },
  });

  const header = <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle={`${user.rollNo ?? ""} · ${year?.label ?? "No active academic year"}`} />;
  const deniedNote = denied && <div className="mb-4"><Notice tone="bad">That page is not available for your role.</Notice></div>;

  if (!membership) {
    return (
      <div>
        {header}{deniedNote}
        <Empty title="You are not in a project team yet">
          Register your team and project proposal to get started.
          <div className="mt-4"><Link href="/student/project" className="btn-primary">Register project</Link></div>
        </Empty>
      </div>
    );
  }

  const { project, views, progress, current, submissions } = await loadProjectForUser(user, membership.projectId);
  const upcoming = views.filter((v) => v.deadline && v.state !== "APPROVED" && v.state !== "LOCKED").slice(0, 4);
  const approved = views.filter((v) => v.state === "APPROVED").length;
  const recentFeedback = submissions.filter((s) => s.reviewedAt && s.reviewComment).sort((a, b) => +b.reviewedAt! - +a.reviewedAt!).slice(0, 4);
  const stageName = new Map(views.map((v) => [v.stage.id, v.stage.name]));
  const events = await prisma.calendarEvent.findMany({
    where: { startsAt: { gte: new Date() }, OR: [{ projectId: project.id }, { projectId: null, academicYearId: project.academicYearId }] },
    orderBy: { startsAt: "asc" }, take: 4,
  });

  return (
    <div>
      {header}{deniedNote}
      <div className="card mb-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{project.teamName}</div>
            <Link href={`/projects/${project.id}`} className="mt-1 block text-lg font-semibold hover:underline">{project.title}</Link>
            <div className="mt-1 text-sm text-muted">Guide: {project.guide?.name ?? "not allocated yet"}</div>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="mt-4"><Progress value={progress} /></div>
        {current && project.status === "ACTIVE" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 px-4 py-3">
            <div>
              <div className="text-xs text-muted">Current stage</div>
              <div className="font-medium">{current.stage.order}. {current.stage.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted">Due {fmtDate(current.deadline, true)} <DaysLeft days={current.daysLeft} state={current.state} /></div>
            </div>
            <div className="flex items-center gap-3">
              <StateBadge state={current.state} />
              <Link href={`/projects/${project.id}/stages/${current.stage.id}`} className="btn-primary">Open stage</Link>
            </div>
          </div>
        )}
        {project.status === "PROPOSED" && <div className="mt-4"><Notice tone="warn">Waiting for the HOD to approve your proposal and allocate a guide.</Notice></div>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Stages approved" value={`${approved}/${views.length}`} />
        <Stat label="Under review" value={views.filter((v) => v.state === "UNDER_REVIEW").length} />
        <Stat label="Needs changes" value={views.filter((v) => v.state === "CHANGES_REQUESTED").length} tone="warn" />
        <Stat label="Overdue" value={views.filter((v) => v.state === "OVERDUE").length} tone={views.some((v) => v.state === "OVERDUE") ? "bad" : "default"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming deadlines">
          {upcoming.length === 0 ? <p className="text-sm text-muted">No open deadlines.</p> : (
            <ul className="divide-y divide-border">
              {upcoming.map((v) => (
                <li key={v.stage.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/projects/${project.id}/stages/${v.stage.id}`} className="block truncate text-sm font-medium hover:underline">{v.stage.order}. {v.stage.name}</Link>
                    <div className="text-xs text-muted">{fmtDate(v.deadline, true)}{v.extended && " (extended)"}</div>
                  </div>
                  <div className="flex flex-col items-end"><StateBadge state={v.state} /><DaysLeft days={v.daysLeft} state={v.state} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent feedback">
          {recentFeedback.length === 0 ? <p className="text-sm text-muted">No feedback yet.</p> : (
            <ul className="space-y-3">
              {recentFeedback.map((s) => (
                <li key={s.id} className="text-sm">
                  <div className="flex items-center gap-2"><span className="font-medium">{stageName.get(s.stageId)}</span><span className="text-xs text-muted">v{s.version}</span><SubmissionBadge status={s.status} /></div>
                  <p className="mt-0.5 line-clamp-2 text-muted">{s.reviewComment}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Scheduled" className="lg:col-span-2">
          {events.length === 0 ? <p className="text-sm text-muted">No upcoming meetings or reviews.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {events.map((e) => (
                <li key={e.id} className="rounded-md bg-surface-2 px-3 py-2 text-sm"><div className="font-medium">{e.title}</div><div className="text-xs text-muted">{fmtDate(e.startsAt, true)}</div></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
