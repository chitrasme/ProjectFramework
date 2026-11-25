/**
 * Full server-side backup: every table as JSON (including password hashes, so it can rebuild
 * accounts) plus, for local storage, a copy of the uploads folder.
 *   npm run backup                 -> ./backups/<timestamp>/
 *   npm run backup -- --out /mnt/backups
 * For point-in-time database backups also use `pg_dump` or Supabase's built-in backups (see README).
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { snapshot } from "../src/lib/backup";

const prisma = new PrismaClient();

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function main() {
  const i = process.argv.indexOf("--out");
  const base = path.resolve(i > -1 ? process.argv[i + 1] : "./backups");
  const dir = path.join(base, new Date().toISOString().replace(/[:.]/g, "-"));
  await fs.mkdir(dir, { recursive: true });
  const snap = await snapshot(prisma, { isDemo: null, includePasswordHashes: true });
  await fs.writeFile(path.join(dir, "database.json"), JSON.stringify(snap, null, 2));
  if ((process.env.STORAGE_DRIVER || "local") === "local") {
    const uploads = path.resolve(process.env.UPLOAD_DIR || "./uploads");
    try {
      await copyDir(uploads, path.join(dir, "uploads"));
    } catch {
      /* no uploads yet */
    }
  }
  await prisma.auditLog.create({ data: { action: "backup.full", entity: "System", details: { dir, ...snap.counts } } });
  console.log(`Backup written to ${dir}`, snap.counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
