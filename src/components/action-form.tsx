"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { ok?: string; error?: string } | undefined;
type Action = (prev: ActionResult, data: FormData) => Promise<ActionResult>;

/**
 * Form bound to a server action; shows the returned message.
 * Submits manually (instead of <form action>) so React does not clear the fields when the
 * server returns a validation error. Fields are reset only after success.
 */
export function ActionForm({
  action, children, className = "", resetOnSuccess = true, confirm,
}: { action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; confirm?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext pending={pending}>{children}</PendingContext>
      {state?.error && <p className="mt-2 text-sm text-bad" role="alert">{state.error}</p>}
      {state?.ok && <p className="mt-2 text-sm whitespace-pre-wrap text-ok" role="status">{state.ok}</p>}
    </form>
  );
}

const Pending = createContext(false);
function PendingContext({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <Pending.Provider value={pending}>{children}</Pending.Provider>;
}

export function Submit({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const ctx = useContext(Pending);
  const { pending: native } = useFormStatus();
  const pending = ctx || native;
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}
