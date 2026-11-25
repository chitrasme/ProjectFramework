import Link from "next/link";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveYear, summarizeProjects } from "@/lib/data";
import { PageHeader, Empty } from "@/components/ui";
import { ProjectTable } from "@/components/project-table";
import { YearSwitcher } from "@/components/year-switcher";

export const metadata = { title: "Projects" };
const STATUSES: (ProjectStatus | "ALL")[] = ["ALL", "PROPOSED", "ACTIVE", "COMPLETED", "REJECTED"];

export default async function HodProjects({ searchParams }: { searchParams: Promise<{ year?: string; status?: string; q?: string; guide?: string }> }) {
  const user = await requireUser("HOD");
  const sp = await searchParams;
  const year = await resolveYear(user.isDemo, sp.year);
  const years = await prisma.academicYear.findMany({ where: { isDemo: user.isDemo }, orderBy: { startDate: "desc" } });
  const guides = await prisma.user.findMany({ where: { role: "GUIDE", isDemo: user.isDemo }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (!year) return <Empty title="No academic year yet" />;
  const status = STATUSES.includes(sp.status as ProjectStatus) ? (sp.status as ProjectStatus) : undefined;
  const q = sp.q?.trim();
  const where: Prisma.ProjectWhereInput = {
    academicYearId: year.id,
    ...(status ? { status } : {}),
    ...(sp.guide ? { guideId: sp.guide === "none" ? null : sp.guide } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: "insensitive" } }, { teamName: { contains: q, mode: "insensitive" } },
      { members: { some: { user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { rollNo: { contains: q, mode: "insensitive" } }] } } } },
    ] } : {}),
  };
  const projects = await prisma.project.findMany({
    where,
    include: { guide: { select: { name: true } }, members: { include: { user: { select: { name: true, rollNo: true } } } } },
    orderBy: [{ status: "asc" }, { teamName: "asc" }],
  });
  const summary = await summarizeProjects(projects.map((p) => p.id));
  const link = (s: string) => `/hod/projects?year=${year.id}${s !== "ALL" ? `&status=${s}` : ""}`;

  return (
    <div>
      <PageHeader title="Projects" subtitle={`${projects.length} project(s) in ${year.label}`} actions={<YearSwitcher years={years} current={year.id} />} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link key={s} href={link(s)} className={`rounded-full px-3 py-1 text-sm ${(status ?? "ALL") === s ? "bg-brand text-white" : "bg-surface border border-border text-muted hover:text-text"}`}>
            {s === "ALL" ? "All" : s === "PROPOSED" ? "Awaiting approval" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Link>
        ))}
        <form className="ml-auto flex flex-wrap gap-2">
          <input type="hidden" name="year" value={year.id} />
          {status && <input type="hidden" name="status" value={status} />}
          <select name="guide" defaultValue={sp.guide ?? ""} className="input w-auto">
            <option value="">All guides</option>
            <option value="none">No guide</option>
            {guides.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input name="q" defaultValue={q} placeholder="Search team, title, student…" className="input w-56" />
          <button className="btn-secondary">Filter</button>
        </form>
      </div>
      {projects.length === 0 ? <Empty title="No projects match" /> : <ProjectTable projects={projects} summary={summary} />}
    </div>
  );
}
