import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader, Empty, fmtDate } from "@/components/ui";
import { markAllReadAction, openNotificationAction } from "@/app/actions/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.read).length;
  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're up to date"}
        actions={unread > 0 && <form action={markAllReadAction}><button className="btn-secondary">Mark all as read</button></form>}
      />
      {items.length === 0 ? <Empty title="No notifications yet" /> : (
        <ul className="card divide-y divide-border">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotificationAction}>
                <input type="hidden" name="id" value={n.id} />
                <button className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 ${n.read ? "" : "bg-brand-soft/40"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`} aria-label={n.read ? undefined : "Unread"} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>{n.title}</span>
                    <span className="block text-sm text-muted">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{fmtDate(n.createdAt, true)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
