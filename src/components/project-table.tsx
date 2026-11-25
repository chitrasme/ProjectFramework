import Link from "next/link";
import { Progress, StateBadge, ProjectStatusBadge, Badge } from "@/components/ui";
import type { summarizeProjects } from "@/lib/data";

type Row = {
  id: string; teamName: string; title: string; status: string; domain: string;
  guide?: { name: string } | null; members: { user: { name: string; rollNo: string | null } }[];
};

export function ProjectTable({ projects, summary, showGuide = true }: { projects: Row[]; summary: Awaited<ReturnType<typeof summarizeProjects>>; showGuide?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr><th>Team / Title</th>{showGuide && <th>Guide</th>}<th>Current stage</th><th className="w-44">Progress</th><th>Status</th></tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const s = summary.get(p.id);
            return (
              <tr key={p.id}>
                <td>
                  <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.teamName}</Link>
                  <div className="max-w-sm truncate text-xs text-muted">{p.title}</div>
                  <div className="max-w-sm truncate text-xs text-muted">{p.members.map((m) => m.user.rollNo).filter(Boolean).join(", ")}</div>
                </td>
                {showGuide && <td className="text-sm">{p.guide?.name ?? <Badge tone="warn">Not allocated</Badge>}</td>}
                <td className="text-sm">
                  {p.status === "ACTIVE" && s?.current ? (
                    <div className="flex flex-col items-start gap-1"><span className="max-w-[14rem] truncate">{s.current.stage.order}. {s.current.stage.name}</span><StateBadge state={s.current.state} /></div>
                  ) : <span className="text-muted">—</span>}
                  {!!s?.overdue && <div className="mt-1 text-xs text-bad">{s.overdue} overdue</div>}
                </td>
                <td><Progress value={s?.progress ?? 0} size="sm" /></td>
                <td><ProjectStatusBadge status={p.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
