import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { summarizeProjects } from "@/lib/data";
import { Card, PageHeader, Progress, Stat, StateBadge, Empty, fmtDate, Notice } from "@/components/ui";

export const metadata = { title: "Guide dashboard" };

export default async function GuideDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser("GUIDE");
  const { denied } = await searchParams;
  const projects = await prisma.project.findMany({
    where: { guideId: user.id, isDemo: user.isDemo, status: { in: ["ACTIVE", "COMPLETED"] }, academicYear: { archived: false } },
    include: { members: { include: { user: { select: { name: true } } } } },
    orderBy: { teamName: "asc" },
  });
  const summary = await summarizeProjects(projects.map((p) => p.id));
  const pending = await prisma.submission.findMany({
    where: { status: "PENDING", project: { guideId: user.id, isDemo: user.isDemo } },
    include: { project: { select: { teamName: true } }, stage: { select: { name: true } } },
    orderBy: { createdAt: "asc" }, take: 6,
  });
  const overdueTeams = projects.filter((p) => (summary.get(p.id)?.overdue ?? 0) > 0);
  const avg = projects.length ? Math.round(projects.reduce((a, p) => a + (summary.get(p.id)?.progress ?? 0), 0) / projects.length) : 0;
  const events = await prisma.calendarEvent.findMany({
    where: { startsAt: { gte: new Date() }, OR: [{ project: { guideId: user.id } }, { projectId: null, academicYear: { isDemo: user.isDemo, isActive: true } }] },
    orderBy: { startsAt: "asc" }, take: 4,
  });

  return (
    <div>
      <PageHeader title={`Welcome, ${user.name}`} subtitle="Your teams, reviews and deadlines at a glance." />
      {denied && <div className="mb-4"><Notice tone="bad">That page is not available for your role.</Notice></div>}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Teams" value={projects.length} />
        <Stat label="Pending reviews" value={pending.length} tone={pending.length ? "warn" : "default"} />
        <Stat label="Teams with overdue stages" value={overdueTeams.length} tone={overdueTeams.length ? "bad" : "default"} />
        <Stat label="Average progress" value={`${avg}%`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Teams" className="lg:col-span-2" actions={<Link href="/guide/projects" className="link text-sm">View all</Link>}>
          {projects.length === 0 ? <Empty title="No teams allocated yet">The HOD allocates teams to you.</Empty> : (
            <ul className="divide-y divide-border">
              {projects.map((p) => {
                const s = summary.get(p.id)!;
                return (
                  <li key={p.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.teamName}</Link>
                      {s.current ? <StateBadge state={s.current.state} /> : <span className="text-xs text-ok">Completed</span>}
                    </div>
                    <div className="truncate text-sm text-muted">{p.title}</div>
                    <div className="mt-1 text-xs text-muted">{p.members.map((m) => m.user.name).join(", ")}</div>
                    <div className="mt-2 grid items-center gap-3 sm:grid-cols-2">
                      <Progress value={s.progress} size="sm" />
                      <div className="text-xs text-muted sm:text-right">{s.current ? `Stage ${s.current.stage.order}: ${s.current.stage.name}` : "All stages approved"}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Waiting for your review" actions={<Link href="/guide/reviews" className="link text-sm">Queue</Link>}>
            {pending.length === 0 ? <p className="text-sm text-muted">Nothing to review.</p> : (
              <ul className="space-y-2.5 text-sm">
                {pending.map((s) => (
                  <li key={s.id}>
                    <Link href={`/projects/${s.projectId}/stages/${s.stageId}`} className="font-medium hover:underline">{s.project.teamName}</Link>
                    <div className="text-xs text-muted">{s.stage.name} · v{s.version} · {fmtDate(s.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Upcoming" actions={<Link href="/calendar" className="link text-sm">Calendar</Link>}>
            {events.length === 0 ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
              <ul className="space-y-2 text-sm">
                {events.map((e) => <li key={e.id}><div className="font-medium">{e.title}</div><div className="text-xs text-muted">{fmtDate(e.startsAt, true)}</div></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
