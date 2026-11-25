import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * File storage with two drivers:
 *  - local:    files on disk under UPLOAD_DIR (development / single server)
 *  - supabase: private Supabase Storage bucket via its REST API (serverless hosting)
 * Files are never served directly; every download goes through /api/files/[id], which checks access.
 */

const driver = () => (process.env.STORAGE_DRIVER || "local").toLowerCase();
const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || "./uploads");

export function makeKey(projectId: string, fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return `${projectId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
}

function supa() {
  const url = process.env.SUPABASE_URL;
  const keyVal = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || "projecttrack";
  if (!url || !keyVal) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for supabase storage");
  return { url: url.replace(/\/$/, ""), key: keyVal, bucket };
}

export async function putFile(key: string, data: Buffer, contentType: string) {
  if (driver() === "supabase") {
    const s = supa();
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": contentType || "application/octet-stream", "x-upsert": "false" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
    return;
  }
  const full = path.join(uploadDir(), key);
  if (!full.startsWith(uploadDir())) throw new Error("Bad key");
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

export async function getFile(key: string): Promise<Buffer> {
  if (driver() === "supabase") {
    const s = supa();
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${key}`, { headers: { Authorization: `Bearer ${s.key}`, apikey: s.key } });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const full = path.join(uploadDir(), key);
  if (!full.startsWith(uploadDir())) throw new Error("Bad key");
  return fs.readFile(full);
}

export async function deleteFile(key: string) {
  try {
    if (driver() === "supabase") {
      const s = supa();
      await fetch(`${s.url}/storage/v1/object/${s.bucket}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${s.key}`, apikey: s.key, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [key] }),
      });
      return;
    }
    await fs.unlink(path.join(uploadDir(), key));
  } catch {
    /* already gone */
  }
}
