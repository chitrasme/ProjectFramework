import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const demo = process.env.DEMO_MODE === "true";
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-white text-sm font-bold text-brand">PT</span>
          ProjectTrack
        </div>
        <div>
          <h1 className="text-3xl font-semibold leading-tight">Every final-year project,<br />from team formation to final submission.</h1>
          <p className="mt-4 max-w-md text-white/80">
            Students upload stage documents, guides review and give feedback, and the department tracks every team&apos;s progress against deadlines in one place.
          </p>
        </div>
        <p className="text-sm text-white/60">Final Year Project Management System</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use the account given to you by your department.</p>
          <LoginForm demo={demo} />
        </div>
      </div>
    </div>
  );
}
