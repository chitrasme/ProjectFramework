import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, PageHeader, Notice } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { changePasswordAction, updateProfileAction } from "@/app/actions/auth";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const user = await requireUser();
  const { first } = await searchParams;
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return (
    <div>
      <PageHeader title="Profile" subtitle={`${row.email} · ${row.department}`} />
      {(first || row.mustChangePassword) && !user.isDemo && <div className="mb-6"><Notice tone="warn">You are using a temporary password. Please choose a new one below.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Your details">
          <ActionForm action={updateProfileAction} resetOnSuccess={false} className="space-y-3">
            <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" defaultValue={row.name} className="input" required /></div>
            <div><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" defaultValue={row.phone ?? ""} className="input" /></div>
            {row.rollNo && <div><span className="label">Roll number</span><p className="text-sm">{row.rollNo}</p></div>}
            <Submit>Save</Submit>
          </ActionForm>
        </Card>
        <Card title="Change password">
          <ActionForm action={changePasswordAction} className="space-y-3">
            <div><label className="label" htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" className="input" required /></div>
            <div><label className="label" htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" className="input" required /></div>
            <div><label className="label" htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" required /></div>
            <p className="text-xs text-muted">At least 8 characters, with a letter and a number.</p>
            <Submit>Change password</Submit>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
