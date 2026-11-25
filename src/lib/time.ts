// Date-time inputs are entered in the department's timezone (APP_TIMEZONE, default Asia/Kolkata),
// whatever timezone the server runs in.

export const APP_TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

/** Offset in minutes of `tz` from UTC at the given instant (e.g. +330 for IST). */
function offsetMinutes(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-12-01T17:00" (or "2026-12-01") typed in APP_TZ → Date. Returns null when invalid. */
export function parseLocalInput(raw: string | null | undefined, tz = APP_TZ): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h = "23", mi = "59"] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  const off = offsetMinutes(new Date(guess), tz);
  const result = new Date(guess - off * 60000);
  return isNaN(result.getTime()) ? null : result;
}

/** Date → "YYYY-MM-DDTHH:mm" in APP_TZ, for <input type="datetime-local">. */
export function toLocalInput(d: Date | null | undefined, tz = APP_TZ) {
  if (!d) return "";
  const shifted = new Date(d.getTime() + offsetMinutes(d, tz) * 60000);
  return shifted.toISOString().slice(0, 16);
}
