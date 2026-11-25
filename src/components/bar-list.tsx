// Single-series horizontal bar chart: one hue, thin bars with rounded data ends, values in text ink,
// native hover tooltip per bar. A data table is the same markup read row by row, so it stays accessible.
export function BarList({ rows, unit = "", emptyText = "No data" }: { rows: { label: string; value: number; hint?: string; href?: string }[]; unit?: string; emptyText?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="group" title={`${r.label}: ${r.value}${unit}${r.hint ? ` – ${r.hint}` : ""}`}>
            <td className="w-[45%] max-w-0 truncate py-1.5 pr-3 text-muted group-hover:text-text">{r.href ? <a href={r.href} className="hover:underline">{r.label}</a> : r.label}</td>
            <td className="py-1.5">
              <div className="flex items-center gap-2">
                <div className="h-3 flex-1">
                  <div className="h-full rounded-r-[4px] bg-brand transition-opacity group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 3 : 0 }} />
                </div>
                <span className="w-10 text-right tabular-nums text-text">{r.value}{unit}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
