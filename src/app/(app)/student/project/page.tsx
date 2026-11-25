import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getActiveYear } from "@/lib/data";
import { Card, PageHeader, Notice, ProjectStatusBadge } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { createProjectAction } from "@/app/actions/student";

export const metadata = { title: "My project" };

export default async function MyProject() {
  const user = await requireUser("STUDENT");
  const year = await getActiveYear(user.isDemo);
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: { project: { include: { academicYear: true } } },
    orderBy: { project: { createdAt: "desc" } },
  });
  const current = memberships.find((m) => m.project.academicYearId === year?.id && m.project.status !== "REJECTED");
  if (current) redirect(`/projects/${current.projectId}`);
  const past = memberships.filter((m) => m !== current);
  const max = Number(process.env.MAX_TEAM_SIZE || 4);

  return (
    <div>
      <PageHeader title="Register your project" subtitle={`Academic year ${year?.label ?? "—"}. The team leader registers once for the whole team.`} />
      {!year ? <Notice tone="warn">No academic year is open yet. Please check back later.</Notice> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Project proposal" className="lg:col-span-2">
            <ActionForm action={createProjectAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="teamName">Team name</label><input id="teamName" name="teamName" className="input" required /></div>
                <div><label className="label" htmlFor="domain">Domain</label><input id="domain" name="domain" className="input" placeholder="e.g. Machine Learning" /></div>
              </div>
              <div><label className="label" htmlFor="title">Project title</label><input id="title" name="title" className="input" required /></div>
              <div><label className="label" htmlFor="technologies">Technologies</label><input id="technologies" name="technologies" className="input" placeholder="e.g. Python, React, PostgreSQL" /></div>
              <div><label className="label" htmlFor="abstract">Abstract</label><textarea id="abstract" name="abstract" rows={5} className="input" placeholder="Problem, objectives, approach and expected outcome" /></div>
              <div>
                <label className="label" htmlFor="members">Team members&apos; roll numbers</label>
                <input id="members" name="members" className="input" placeholder="e.g. 21CS045, 21CS052" />
                <p className="mt-1 text-xs text-muted">You are added automatically as team leader. Up to {max} members in total. Members must already have accounts.</p>
              </div>
              <Submit>Submit proposal</Submit>
            </ActionForm>
          </Card>
          <Card title="What happens next">
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted">
              <li>The HOD reviews your proposal.</li>
              <li>A project guide is allocated to your team.</li>
              <li>Stage uploads open, starting with the title proposal.</li>
              <li>Your guide reviews each upload and gives feedback.</li>
            </ol>
          </Card>
        </div>
      )}
      {past.length > 0 && (
        <Card title="Previous projects" className="mt-6">
          <ul className="space-y-2 text-sm">
            {past.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <Link href={`/projects/${m.projectId}`} className="link">{m.project.title}</Link>
                <span className="flex items-center gap-2 text-xs text-muted">{m.project.academicYear.label}<ProjectStatusBadge status={m.project.status} /></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
