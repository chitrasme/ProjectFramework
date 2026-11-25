import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Badge, fmtDate } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { createUserAction, importUsersAction, toggleUserActiveAction, resetPasswordAction, updateUserAction } from "@/app/actions/hod";

export const metadata = { title: "Users" };
const ROLES: Role[] = ["STUDENT", "GUIDE", "HOD"];
const ROLE_LABEL = { STUDENT: "Student", GUIDE: "Guide", HOD: "HOD" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string; page?: string }> }) {
  const me = await requireUser("HOD");
  const sp = await searchParams;
  const role = ROLES.includes(sp.role as Role) ? (sp.role as Role) : undefined;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.UserWhereInput = {
    isDemo: me.isDemo,
    ...(role ? { role } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { rollNo: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const PAGE = 50;
  const [users, total, counts] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [{ role: "asc" }, { name: "asc" }], skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { guidedProjects: true, memberships: true } } } }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ["role"], where: { isDemo: me.isDemo }, _count: true }),
  ]);
  const count = (r: Role) => counts.find((c) => c.role === r)?._count ?? 0;
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ role, q, ...extra }).forEach(([k, v]) => v && p.set(k, v));
    return `/hod/users?${p}`;
  };

  return (
    <div>
      <PageHeader title="Users" subtitle={`${count("STUDENT")} students · ${count("GUIDE")} guides · ${count("HOD")} HOD`} />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Add a user">
          <ActionForm action={createUserAction} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Name</label><input name="name" className="input" required /></div>
            <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
            <div>
              <label className="label">Role</label>
              <select name="role" className="input" defaultValue="STUDENT">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </div>
            <div><label className="label">Roll number (students)</label><input name="rollNo" className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Initial password (leave blank to generate)</label><input name="password" className="input" autoComplete="new-password" /></div>
            <div className="sm:col-span-2"><Submit>Create account</Submit></div>
          </ActionForm>
        </Card>
        <Card title="Bulk import (CSV)">
          <ActionForm action={importUsersAction} className="space-y-3">
            <p className="text-sm text-muted">Columns: <code className="rounded bg-surface-2 px-1">name,email,role,rollNo</code>. Role is STUDENT, GUIDE or HOD (default STUDENT). A header row is optional.</p>
            <input type="file" name="file" accept=".csv,text/csv" className="input" />
            <textarea name="csv" rows={4} className="input font-mono text-xs" placeholder={"Asha R,asha@college.edu,STUDENT,21CS001\nProf. Ravi,ravi@college.edu,GUIDE,"} />
            <Submit pendingText="Importing…">Import</Submit>
          </ActionForm>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[undefined, ...ROLES].map((r) => (
          <Link key={r ?? "all"} href={qs({ role: r, page: undefined })} className={`rounded-full px-3 py-1 text-sm ${role === r ? "bg-brand text-white" : "border border-border bg-surface text-muted hover:text-text"}`}>
            {r ? ROLE_LABEL[r] + "s" : "All"}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {role && <input type="hidden" name="role" value={role} />}
          <input name="q" defaultValue={q} placeholder="Search name, email, roll no…" className="input w-60" />
          <button className="btn-secondary">Search</button>
        </form>
      </div>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Role</th><th>Roll no.</th><th>Teams</th><th>Status</th><th>Added</th><th className="w-1"></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><div className="font-medium">{u.name}</div><div className="text-xs text-muted">{u.email}</div></td>
                <td><Badge tone={u.role === "HOD" ? "info" : u.role === "GUIDE" ? "brand" : "gray"}>{ROLE_LABEL[u.role]}</Badge></td>
                <td className="text-sm">{u.rollNo ?? "—"}</td>
                <td className="text-sm tabular-nums">{u.role === "GUIDE" ? u._count.guidedProjects : u._count.memberships}</td>
                <td>{u.active ? <Badge tone="ok">Active</Badge> : <Badge tone="bad">Deactivated</Badge>}{u.mustChangePassword && <div className="mt-1 text-xs text-muted">Temp password</div>}</td>
                <td className="text-xs whitespace-nowrap text-muted">{fmtDate(u.createdAt)}</td>
                <td>
                  <details className="relative">
                    <summary className="btn-secondary cursor-pointer list-none px-2 py-1 text-xs">Manage</summary>
                    <div className="absolute right-0 z-20 mt-1 w-80 space-y-3 rounded-lg border border-border bg-surface p-3 shadow-lg">
                      <ActionForm action={updateUserAction} resetOnSuccess={false} className="space-y-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input name="name" defaultValue={u.name} className="input" />
                        <input name="email" defaultValue={u.email} className="input" />
                        <div className="flex gap-2">
                          <select name="role" defaultValue={u.role} className="input">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                          <input name="rollNo" defaultValue={u.rollNo ?? ""} placeholder="Roll no." className="input" />
                        </div>
                        <Submit className="btn-secondary w-full text-xs">Save changes</Submit>
                      </ActionForm>
                      <div className="flex gap-2 border-t border-border pt-3">
                        <ActionForm action={resetPasswordAction} confirm={`Reset the password for ${u.email}?`} className="flex-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <Submit className="btn-secondary w-full text-xs">Reset password</Submit>
                        </ActionForm>
                        {u.id !== me.id && (
                          <ActionForm action={toggleUserActiveAction} confirm={u.active ? `Deactivate ${u.name}? They will no longer be able to sign in.` : undefined} className="flex-1">
                            <input type="hidden" name="userId" value={u.id} />
                            <Submit className={`${u.active ? "btn-danger" : "btn-ok"} w-full text-xs`}>{u.active ? "Deactivate" : "Activate"}</Submit>
                          </ActionForm>
                        )}
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>Page {page} of {Math.ceil(total / PAGE)}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-secondary" href={qs({ page: String(page - 1) })}>Previous</Link>}
            {page * PAGE < total && <Link className="btn-secondary" href={qs({ page: String(page + 1) })}>Next</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
