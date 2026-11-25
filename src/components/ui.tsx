import type { ReactNode } from "react";
import type { StageState } from "@/lib/progress";
import { STATE_LABEL } from "@/lib/progress";
import { APP_TZ } from "@/lib/time";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "ok" | "warn" | "bad" }) {
  const color = { default: "text-text", ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const TONES = {
  gray: "bg-surface-2 text-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export const STATE_TONE: Record<StageState, keyof typeof TONES> = {
  APPROVED: "ok",
  UNDER_REVIEW: "info",
  CHANGES_REQUESTED: "warn",
  REJECTED: "bad",
  OVERDUE: "bad",
  OPEN: "brand",
  LOCKED: "gray",
};

export function StateBadge({ state }: { state: StageState }) {
  return <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>;
}

export function SubmissionBadge({ status }: { status: string }) {
  const map: Record<string, [keyof typeof TONES, string]> = {
    PENDING: ["info", "Pending review"],
    APPROVED: ["ok", "Approved"],
    CHANGES_REQUESTED: ["warn", "Changes requested"],
    REJECTED: ["bad", "Rejected"],
  };
  const [tone, label] = map[status] ?? ["gray", status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const map: Record<string, [keyof typeof TONES, string]> = {
    PROPOSED: ["warn", "Awaiting approval"],
    ACTIVE: ["brand", "Active"],
    COMPLETED: ["ok", "Completed"],
    REJECTED: ["bad", "Rejected"],
  };
  const [tone, label] = map[status] ?? ["gray", status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Progress({ value, size = "md" }: { value: number; size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-full overflow-hidden rounded-full bg-surface-2 ${size === "sm" ? "h-1.5" : "h-2"}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted">{value}%</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  const cls = { info: "border-brand/30 bg-brand-soft", ok: "border-ok/30 bg-ok-soft", warn: "border-warn/30 bg-warn-soft", bad: "border-bad/30 bg-bad-soft" }[tone];
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function fmtDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: APP_TZ,
  });
}

export function fmtSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DaysLeft({ days, state }: { days: number | null; state: StageState }) {
  if (days == null || state === "APPROVED" || state === "UNDER_REVIEW" || state === "LOCKED") return null;
  if (days < 0) return <span className="text-xs font-medium text-bad">{-days} day{days === -1 ? "" : "s"} overdue</span>;
  if (days === 0) return <span className="text-xs font-medium text-warn">Due today</span>;
  return <span className={`text-xs ${days <= 3 ? "font-medium text-warn" : "text-muted"}`}>{days} day{days === 1 ? "" : "s"} left</span>;
}
