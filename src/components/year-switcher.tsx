"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function YearSwitcher({ years, current }: { years: { id: string; label: string; isActive: boolean }[]; current?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label="Academic year"
      className="input w-auto"
      value={current}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.set("year", e.target.value);
        router.push(`${path}?${p.toString()}`);
      }}
    >
      {years.map((y) => <option key={y.id} value={y.id}>{y.label}{y.isActive ? " (active)" : ""}</option>)}
    </select>
  );
}
