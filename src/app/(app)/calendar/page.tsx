import Link from "next/link";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getActiveYear } from "@/lib/data";
import { APP_TZ } from "@/lib/time";
import { Card, PageHeader, fmtDate, Badge } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { addEventAction, deleteEventAction } from "@/app/actions/review";

export const metadata = { title: "Calendar" };

type Item = { id: string; date: Date; title: string; kind: "DEADLINE" | "EVENT" | "REVIEW" | "MEETING" | "HOLIDAY"; sub?: string; eventId?: string; canDelete?: boolean };
const KIND_STYLE: Record<Item["kind"], string> = {
  DEADLINE: "bg-bad-soft text-bad", REVIEW: "bg-info-soft text-info", MEETING: "bg-brand-soft text-brand", EVENT: "bg-ok-soft text-ok", HOLIDAY: "bg-surface-2 text-muted",
};
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: APP_TZ }); // YYYY-MM-DD in department time

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; project?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = dayKey(new Date());
  const [ty, tm] = (/^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7)).split("-").map(Number);
  const first = new Date(Date.UTC(ty, tm - 1, 1));
  const rangeStart = new Date(first.getTime() - 8 * 86_400_000);
  const rangeEnd = new Date(Date.UTC(ty, tm, 1) + 8 * 86_400_000);

  // What this user may see
  let yearIds: string[] = [];
  let projectFilter: { id: { in: string[] } } | null = null;
  let extensions: { stageId: string; newDeadline: Date }[] = [];
  let myProjects: { id: string; teamName: string }[] = [];
  if (user.role === "STUDENT") {
    const m = await prisma.teamMember.findMany({ where: { userId: user.id, project: { status: { not: "REJECTED" } } }, include: { project: { include: { extensions: true } } } });
    yearIds = [...new Set(m.map((x) => x.project.academicYearId))];
    projectFilter = { id: { in: m.map((x) => x.projectId) } };
    extensions = m.flatMap((x) => x.project.extensions);
  } else {
    const y = await getActiveYear(user.isDemo);
    yearIds = y ? [y.id] : [];
    myProjects = await prisma.project.findMany({
      where: { isDemo: user.isDemo, status: "ACTIVE", ...(user.role === "GUIDE" ? { guideId: user.id } : {}), ...(y ? { academicYearId: y.id } : {}) },
      select: { id: true, teamName: true }, orderBy: { teamName: "asc" },
    });
    if (user.role === "GUIDE") projectFilter = { id: { in: myProjects.map((p) => p.id) } };
  }

  const [stages, events] = await Promise.all([
    prisma.stage.findMany({ where: { academicYearId: { in: yearIds }, isActive: true, deadline: { not: null } } }),
    prisma.calendarEvent.findMany({
      where: {
        academicYearId: { in: yearIds }, startsAt: { gte: rangeStart, lt: rangeEnd },
        ...(projectFilter ? { OR: [{ projectId: null }, { project: projectFilter }] } : {}),
      },
      include: { project: { select: { teamName: true } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const items: Item[] = [
    ...stages.map((s) => {
      const ext = extensions.find((e) => e.stageId === s.id);
      return { id: s.id, date: ext?.newDeadline ?? s.deadline!, title: `${s.name} due`, kind: "DEADLINE" as const, sub: ext ? "extended for your team" : `Stage ${s.order}` };
    }),
    ...events.map((e) => ({
      id: e.id, eventId: e.id, date: e.startsAt, title: e.title, kind: e.kind as Item["kind"], sub: e.project?.teamName ?? "Department",
      canDelete: user.role === "HOD" || e.createdById === user.id,
    })),
  ].filter((i) => i.date >= rangeStart && i.date < rangeEnd);

  const byDay = new Map<string, Item[]>();
  for (const it of items) byDay.set(dayKey(it.date), [...(byDay.get(dayKey(it.date)) ?? []), it]);

  // Monday-first grid
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${ty}-${String(tm).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const prev = tm === 1 ? `${ty - 1}-12` : `${ty}-${String(tm - 1).padStart(2, "0")}`;
  const next = tm === 12 ? `${ty + 1}-01` : `${ty}-${String(tm + 1).padStart(2, "0")}`;
  const monthName = first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const upcoming = items.filter((i) => dayKey(i.date) >= today).sort((a, b) => +a.date - +b.date).slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Stage deadlines, reviews and meetings."
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?month=${prev}`} className="btn-secondary px-2" aria-label="Previous month"><ChevronLeft size={16} /></Link>
            <span className="w-36 text-center font-medium">{monthName}</span>
            <Link href={`/calendar?month=${next}`} className="btn-secondary px-2" aria-label="Next month"><ChevronRight size={16} /></Link>
            <Link href="/calendar" className="btn-secondary">Today</Link>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs font-semibold text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((c, i) => (
              <div key={i} className={`min-h-24 border-b border-r border-border p-1 text-xs ${c ? "" : "bg-surface-2/50"}`}>
                {c && (
                  <>
                    <div className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full ${c === today ? "bg-brand font-semibold text-white" : "text-muted"}`}>{Number(c.slice(8))}</div>
                    <div className="space-y-1">
                      {(byDay.get(c) ?? []).map((it) => (
                        <div key={it.id} title={`${it.title} – ${it.sub ?? ""}`} className={`truncate rounded px-1 py-0.5 ${KIND_STYLE[it.kind]}`}>{it.title}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <Card title="Coming up">
            {upcoming.length === 0 ? <p className="text-sm text-muted">Nothing this month.</p> : (
              <ul className="space-y-3 text-sm">
                {upcoming.map((it) => (
                  <li key={it.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{it.title}</div>
                      <div className="text-xs text-muted">{fmtDate(it.date, true)} · {it.sub}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge tone={it.kind === "DEADLINE" ? "bad" : it.kind === "REVIEW" ? "info" : "brand"}>{it.kind.toLowerCase()}</Badge>
                      {it.canDelete && it.eventId && (
                        <form action={deleteEventAction}><input type="hidden" name="eventId" value={it.eventId} /><button className="p-1 text-muted hover:text-bad" aria-label="Delete event"><Trash2 size={14} /></button></form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {user.role !== "STUDENT" && (
            <Card title="Schedule">
              <ActionForm action={addEventAction} className="space-y-3">
                <input name="title" className="input" placeholder="e.g. Review 1 – Lab 3" required />
                <input name="startsAt" type="datetime-local" className="input" required />
                <select name="kind" className="input" defaultValue="MEETING">
                  <option value="MEETING">Meeting</option><option value="REVIEW">Review</option><option value="EVENT">Event</option>{user.role === "HOD" && <option value="HOLIDAY">Holiday</option>}
                </select>
                <select name="projectId" className="input" defaultValue={sp.project ?? (user.role === "GUIDE" ? myProjects[0]?.id : "")} required={user.role === "GUIDE"}>
                  {user.role === "HOD" && <option value="">Whole department</option>}
                  {myProjects.map((p) => <option key={p.id} value={p.id}>{p.teamName}</option>)}
                </select>
                <textarea name="description" rows={2} className="input" placeholder="Details (optional)" />
                <Submit>Add to calendar</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
