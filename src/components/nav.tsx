"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderKanban, CalendarDays, Bell, UserCircle, ClipboardCheck, Users, ListOrdered,
  CalendarRange, FileBarChart, ScrollText, DatabaseBackup, Menu, X,
} from "lucide-react";
import { useState } from "react";

const ICONS = {
  dashboard: LayoutDashboard, project: FolderKanban, calendar: CalendarDays, bell: Bell, user: UserCircle,
  review: ClipboardCheck, users: Users, stages: ListOrdered, years: CalendarRange, reports: FileBarChart,
  audit: ScrollText, backup: DatabaseBackup,
};
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean };

export function SideNav({ items, footer }: { items: NavItem[]; footer: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${active ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text"}`}
          >
            <Icon size={17} aria-hidden />
            <span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="rounded-full bg-bad px-1.5 text-xs font-semibold text-white tabular-nums">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <Brand />
        <button className="btn-secondary px-2 py-1.5" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open && <div className="border-b border-border bg-surface lg:hidden">{links}<div className="border-t border-border p-3">{footer}</div></div>}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="border-b border-border px-5 py-4"><Brand /></div>
        <div className="flex-1 overflow-y-auto">{links}</div>
        <div className="border-t border-border p-3">{footer}</div>
      </aside>
    </>
  );
}

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-bold text-white">PT</span>
      ProjectTrack
    </Link>
  );
}
