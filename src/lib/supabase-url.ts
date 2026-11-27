/**
 * Accepts the project URL as people tend to paste it ("https://x.supabase.co", with a trailing
 * slash, or the Data API URL ".../rest/v1/") and returns the bare project origin.
 */
export function supabaseBaseUrl(raw: string | undefined) {
  if (!raw) return "";
  let u = raw.trim().replace(/^["']|["']$/g, "");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    return new URL(u).origin;
  } catch {
    return u.replace(/\/+$/, "");
  }
}
