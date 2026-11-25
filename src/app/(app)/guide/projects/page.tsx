import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { summarizeProjects } from "@/lib/data";
import { PageHeader, Empty } from "@/components/ui";
import { ProjectTable } from "@/components/project-table";

export const metadata = { title: "My teams" };

export default async function GuideProjects() {
  const user = await requireUser("GUIDE");
  const projects = await prisma.project.findMany({
    where: { guideId: user.id, isDemo: user.isDemo },
    include: { members: { include: { user: { select: { name: true, rollNo: true } } } }, academicYear: true },
    orderBy: [{ academicYear: { startDate: "desc" } }, { teamName: "asc" }],
  });
  const summary = await summarizeProjects(projects.map((p) => p.id));
  const byYear = new Map<string, typeof projects>();
  for (const p of projects) byYear.set(p.academicYear.label, [...(byYear.get(p.academicYear.label) ?? []), p]);
  return (
    <div>
      <PageHeader title="My teams" subtitle="All teams allocated to you, grouped by academic year." />
      {projects.length === 0 ? <Empty title="No teams allocated yet" /> : (
        <div className="space-y-8">
          {[...byYear.entries()].map(([label, list]) => (
            <section key={label}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{label}</h2>
              <ProjectTable projects={list} summary={summary} showGuide={false} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
