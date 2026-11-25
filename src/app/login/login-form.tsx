"use client";
import { startTransition, useActionState, useRef } from "react";
import { loginAction } from "@/app/actions/auth";

const DEMOS = [
  { label: "Student", email: "student1@demo.projecttrack" },
  { label: "Guide", email: "guide1@demo.projecttrack" },
  { label: "HOD", email: "hod@demo.projecttrack" },
];

export function LoginForm({ demo }: { demo: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
      >
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input ref={emailRef} id="email" name="email" type="email" autoComplete="username" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input ref={pwRef} id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="mt-4 text-xs text-muted">Forgot your password? Ask your HOD to reset it from the Users page.</p>
      {demo && (
        <div className="mt-8 rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-medium">Try a demo account</div>
          <p className="mt-0.5 text-xs text-muted">Sample data only, separate from real records. Password: Demo@123</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.email}
                type="button"
                className="btn-secondary px-2 text-xs"
                onClick={() => {
                  if (emailRef.current && pwRef.current) {
                    emailRef.current.value = d.email;
                    pwRef.current.value = "Demo@123";
                  }
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
