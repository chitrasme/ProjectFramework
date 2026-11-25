import { DatabaseBackup } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Backup" };

export default async function BackupPage() {
  const user = await requireUser("HOD");
  const last = await prisma.auditLog.findFirst({ where: { action: { in: ["backup.download", "backup.full"] }, isDemo: user.isDemo }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } });
  return (
    <div>
      <PageHeader title="Backup" subtitle="Keep copies of department records outside the application." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Download a records export">
          <p className="mb-4 text-sm text-muted">
            A JSON file with every academic year, stage, project, team, submission record, review, remark, event and audit entry. Password hashes are left out. Uploaded documents are not included; they stay in file storage.
          </p>
          <a href="/api/backup" className="btn-primary"><DatabaseBackup size={16} /> Download export</a>
          <p className="mt-3 text-xs text-muted">Last backup: {last ? `${fmtDate(last.createdAt, true)} by ${last.actor?.name ?? "server script"}` : "never"}</p>
        </Card>
        <Card title="Full server backups">
          <ul className="list-disc space-y-2 pl-4 text-sm text-muted">
            <li><span className="text-text">Database:</span> Supabase takes daily backups automatically. For your own copy, run <code className="rounded bg-surface-2 px-1">pg_dump</code> with the connection string (see README).</li>
            <li><span className="text-text">Everything incl. uploads:</span> run <code className="rounded bg-surface-2 px-1">npm run backup</code> on the server; it writes the database and the uploads folder to <code className="rounded bg-surface-2 px-1">./backups</code>.</li>
            <li>Schedule one of these weekly and keep copies off the server.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
