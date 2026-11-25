import { FileSpreadsheet, FileText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { resolveYear } from "@/lib/data";
import { Card, PageHeader, Empty } from "@/components/ui";
import { YearSwitcher } from "@/components/year-switcher";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser("HOD");
  const sp = await searchParams;
  const year = await resolveYear(user.isDemo, sp.year);
  const years = await prisma.academicYear.findMany({ where: { isDemo: user.isDemo }, orderBy: { startDate: "desc" } });
  if (!year) return <Empty title="No academic year yet" />;
  const projects = await prisma.project.findMany({ where: { academicYearId: year.id }, select: { id: true, teamName: true, title: true }, orderBy: { teamName: "asc" } });
  return (
    <div>
      <PageHeader title="Reports" subtitle={`Exports for ${year.label}. Files are generated from live data when you click.`} actions={<YearSwitcher years={years} current={year.id} />} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Excel workbook">
          <p className="mb-4 text-sm text-muted">Five sheets: projects summary, stage-by-stage status matrix, deadlines, every submission with review comments and marks, and the student list.</p>
          <a className="btn-primary" href={`/api/reports?format=xlsx&year=${year.id}`}><FileSpreadsheet size={16} /> Download .xlsx</a>
        </Card>
        <Card title="PDF progress report">
          <p className="mb-4 text-sm text-muted">A printable department report: headline numbers, every project with its guide and current stage, and stage-wise completion against deadlines.</p>
          <a className="btn-primary" href={`/api/reports?format=pdf&year=${year.id}`}><FileText size={16} /> Download PDF</a>
        </Card>
      </div>
      <Card title="Individual project reports" className="mt-6">
        {projects.length === 0 ? <p className="text-sm text-muted">No projects in this year.</p> : (
          <ul className="divide-y divide-border">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate"><span className="font-medium">{p.teamName}</span> <span className="text-muted">– {p.title}</span></span>
                <a className="link shrink-0" href={`/api/reports?format=pdf&project=${p.id}`}>PDF</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
