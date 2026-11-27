import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveYear, summarizeProjects } from "@/lib/data";
import { Card, PageHeader, Stat, Empty, fmtDate, Notice, Progress } from "@/components/ui";
import { BarList } from "@/components/bar-list";
import { YearSwitcher } from "@/components/year-switcher";

export const metadata = { title: "HOD dashboard" };

export default async function HodDashboard({ searchParams }: { searchParams: Promise<{ year?: string; denied?: string }> }) {
  const user = await requireUser("HOD");
  const sp = await searchParams;
  const [year, years] = await Promise.all([
    resolveYear(user.isDemo, sp.year),
    prisma.academicYear.findMany({ where: { isDemo: user.isDemo }, orderBy: { startDate: "desc" } }),
  ]);
  if (!year) return <div><PageHeader title="Department dashboard" /><Empty title="No academic year yet">Create one under Academic Years.</Empty></div>;

  const [projects, stages, guides, recent, studentsTotal] = await Promise.all([
    prisma.project.findMany({ where: { academicYearId: year.id }, include: { guide: { select: { name: true } } } }),
    prisma.stage.findMany({ where: { academicYearId: year.id, isActive: true }, orderBy: { order: "asc" } }),
    prisma.user.findMany({ where: { role: "GUIDE", isDemo: user.isDemo, active: true }, select: { id: true, name: true } }),
    prisma.auditLog.findMany({ where: { isDemo: user.isDemo }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.user.count({ where: { role: "STUDENT", isDemo: user.isDemo, active: true } }),
  ]);
  const active = projects.filter((p) => p.status === "ACTIVE" || p.status === "COMPLETED");
  const [summary, pendingReviews, studentsInTeams] = await Promise.all([
    summarizeProjects(active.map((p) => p.id)),
    prisma.submission.count({ where: { status: "PENDING", project: { academicYearId: year.id } } }),
    prisma.teamMember.count({ where: { project: { academicYearId: year.id, status: { not: "REJECTED" } } } }),
  ]);

  const byStage = stages.map((s) => ({
    label: `${s.order}. ${s.name}`,
    value: active.filter((p) => summary.get(p.id)?.current?.stage.id === s.id).length,
  }));
  const completed = active.filter((p) => !summary.get(p.id)?.current).length;
  if (completed) byStage.push({ label: "All stages done", value: completed });

  const guideLoad = guides
    .map((g) => {
      const mine = active.filter((p) => p.guideId === g.id);
      const avg = mine.length ? Math.round(mine.reduce((a, p) => a + (summary.get(p.id)?.progress ?? 0), 0) / mine.length) : 0;
      return { label: g.name, value: mine.length, hint: `average progress ${avg}%` };
    })
    .sort((a, b) => b.value - a.value);

  const atRisk = active
    .map((p) => ({ p, s: summary.get(p.id)! }))
    .filter(({ s }) => s.overdue > 0)
    .sort((a, b) => b.s.overdue - a.s.overdue)
    .slice(0, 8);
  const avgProgress = active.length ? Math.round(active.reduce((a, p) => a + (summary.get(p.id)?.progress ?? 0), 0) / active.length) : 0;
  const proposals = projects.filter((p) => p.status === "PROPOSED");
  const upcomingStage = stages.find((s) => s.deadline && s.deadline > new Date());

  return (
    <div>
      <PageHeader
        title="Department dashboard"
        subtitle={<>Academic year {year.label}{!year.isActive && " (not the active year)"}</>}
        actions={<YearSwitcher years={years} current={year.id} />}
      />
      {sp.denied && <div className="mb-4"><Notice tone="bad">That page is not available for your role.</Notice></div>}
      {proposals.length > 0 && (
        <div className="mb-4"><Notice tone="warn">{proposals.length} project proposal{proposals.length > 1 ? "s are" : " is"} waiting for approval and guide allocation. <Link href={`/hod/projects?year=${year.id}&status=PROPOSED`} className="font-medium underline">Review now</Link></Notice></div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Projects" value={projects.length} hint={`${active.length} approved · ${proposals.length} proposed`} />
        <Stat label="Average progress" value={`${avgProgress}%`} hint={`${completed} completed`} />
        <Stat label="Teams with overdue stages" value={atRisk.length} tone={atRisk.length ? "bad" : "default"} />
        <Stat label="Pending reviews" value={pendingReviews} tone={pendingReviews ? "warn" : "default"} hint={`${studentsInTeams}/${studentsTotal} students in teams`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Teams by current stage">
          <BarList rows={byStage} emptyText="No approved projects yet." />
        </Card>
        <Card title="Guide workload (teams)">
          <BarList rows={guideLoad} emptyText="No guides yet." />
        </Card>
        <Card title="Teams needing attention" actions={<Link href={`/hod/projects?year=${year.id}`} className="link text-sm">All projects</Link>}>
          {atRisk.length === 0 ? <p className="text-sm text-muted">No team has an overdue stage.</p> : (
            <ul className="divide-y divide-border">
              {atRisk.map(({ p, s }) => (
                <li key={p.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.teamName}</Link>
                    <span className="text-xs font-medium text-bad">{s.overdue} overdue</span>
                  </div>
                  <div className="text-xs text-muted">{p.guide?.name ?? "No guide"} · {s.current ? `Stage ${s.current.stage.order}: ${s.current.stage.name}` : ""}</div>
                  <div className="mt-1"><Progress value={s.progress} size="sm" /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent activity" actions={<Link href="/hod/audit" className="link text-sm">Audit log</Link>}>
          {upcomingStage && <p className="mb-3 text-sm">Next department deadline: <span className="font-medium">{upcomingStage.name}</span> on {fmtDate(upcomingStage.deadline, true)}</p>}
          <ul className="space-y-2 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span className="truncate"><span className="font-medium">{r.actor?.name ?? "System"}</span> <span className="text-muted">{r.action}</span></span>
                <span className="shrink-0 text-xs text-muted">{fmtDate(r.createdAt, true)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
