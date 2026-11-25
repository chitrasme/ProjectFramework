import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { unreadCount } from "@/lib/data";
import { prisma } from "@/lib/db";
import { SideNav, type NavItem } from "@/components/nav";
import { logoutAction } from "@/app/actions/auth";
import { LogOut } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const unread = await unreadCount(user.id);

  let items: NavItem[];
  if (user.role === "STUDENT") {
    items = [
      { href: "/student", label: "Dashboard", icon: "dashboard", exact: true },
      { href: "/student/project", label: "My Project", icon: "project" },
    ];
  } else if (user.role === "GUIDE") {
    const pending = await prisma.submission.count({ where: { status: "PENDING", project: { guideId: user.id, isDemo: user.isDemo } } });
    items = [
      { href: "/guide", label: "Dashboard", icon: "dashboard", exact: true },
      { href: "/guide/reviews", label: "Review Queue", icon: "review", badge: pending },
      { href: "/guide/projects", label: "My Teams", icon: "project" },
    ];
  } else {
    const proposals = await prisma.project.count({ where: { status: "PROPOSED", isDemo: user.isDemo } });
    items = [
      { href: "/hod", label: "Dashboard", icon: "dashboard", exact: true },
      { href: "/hod/projects", label: "Projects", icon: "project", badge: proposals },
      { href: "/hod/users", label: "Users", icon: "users" },
      { href: "/hod/stages", label: "Stages & Deadlines", icon: "stages" },
      { href: "/hod/years", label: "Academic Years", icon: "years" },
      { href: "/hod/reports", label: "Reports", icon: "reports" },
      { href: "/hod/audit", label: "Audit Log", icon: "audit" },
      { href: "/hod/backup", label: "Backup", icon: "backup" },
    ];
  }
  items.push(
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/notifications", label: "Notifications", icon: "bell", badge: unread },
    { href: "/profile", label: "Profile", icon: "user" },
  );

  const roleLabel = { STUDENT: "Student", GUIDE: "Project Guide", HOD: "Head of Department" }[user.role];
  const footer = (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs text-muted">{roleLabel}</div>
      </div>
      <form action={logoutAction}>
        <button className="btn-secondary px-2 py-1.5" title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <SideNav items={items} footer={footer} />
      <main className="min-w-0 flex-1">
        {user.isDemo && (
          <div className="border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
            Demo account – you are seeing sample data only. Nothing here affects real department records.
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
