import { notFound } from "next/navigation";
import { setupIsOpen, setupAction } from "@/app/actions/setup";
import { ActionForm, Submit } from "@/components/action-form";

export const metadata = { title: "First-time setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await setupIsOpen())) notFound();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-lg p-6">
        <div className="mb-4 flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-bold text-white">PT</span>
          ProjectTrack setup
        </div>
        <h1 className="text-xl font-semibold">Create the Head of Department account</h1>
        <p className="mt-1 text-sm text-muted">
          This page works once. After the HOD account exists it disappears, and the HOD adds guides and students from the Users page.
        </p>
        <ActionForm action={setupAction} resetOnSuccess={false} className="mt-6 space-y-3">
          <div><label className="label" htmlFor="token">Setup token</label><input id="token" name="token" type="password" className="input" required /><p className="mt-1 text-xs text-muted">The SETUP_TOKEN value you set in Vercel.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="name">Your name</label><input id="name" name="name" className="input" required /></div>
            <div><label className="label" htmlFor="department">Department</label><input id="department" name="department" defaultValue="Computer Science" className="input" required /></div>
          </div>
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" className="input" required /></div>
            <div><label className="label" htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" className="input" required /></div>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="demo" defaultChecked className="mt-1" /> <span>Also load the demo accounts (sample teams for trying the system; kept separate from real data)</span></label>
          <Submit pendingText="Setting up…">Create HOD account</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
