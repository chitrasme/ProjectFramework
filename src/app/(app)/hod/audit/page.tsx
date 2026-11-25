import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader, fmtDate, Empty } from "@/components/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireUser("HOD");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const PAGE = 50;
  const where: Prisma.AuditLogWhereInput = {
    isDemo: user.isDemo,
    ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entity: { contains: q, mode: "insensitive" } }, { actor: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.auditLog.count({ where }),
  ]);
  const href = (p: number) => `/hod/audit?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  return (
    <div>
      <PageHeader title="Audit log" subtitle={`${total} recorded actions: sign-ins, uploads, downloads, reviews, deadline and account changes.`} />
      <form className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Filter by action, entity or person (e.g. submission, deadline, login)" className="input max-w-md" />
        <button className="btn-secondary">Filter</button>
      </form>
      {logs.length === 0 ? <Empty title="No matching entries" /> : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-xs">{fmtDate(l.createdAt, true)}</td>
                  <td className="text-sm">{l.actor?.name ?? "System"}<div className="text-xs text-muted">{l.actor?.role}</div></td>
                  <td><code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{l.action}</code><div className="text-xs text-muted">{l.entity}</div></td>
                  <td className="max-w-md break-words font-mono text-xs text-muted">{l.details ? JSON.stringify(l.details) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="mt-3 flex justify-between text-sm text-muted">
          <span>Page {page} of {Math.ceil(total / PAGE)}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-secondary" href={href(page - 1)}>Previous</Link>}
            {page * PAGE < total && <Link className="btn-secondary" href={href(page + 1)}>Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
