/**
 * Seeds DEMO data (users, year, projects all flagged isDemo=true), and makes sure a real
 * academic year with the default 14 stages exists. Real user accounts are never created here;
 * use the /setup page or `npm run create-hod` for the first real HOD.
 *
 * Safe to re-run: existing demo data is wiped and recreated; real data is untouched.
 * SKIP_DEMO=true removes demo data without recreating it.
 */
import { PrismaClient } from "@prisma/client";
import { ensureRealYear, wipeDemo, seedDemo } from "../src/lib/seed-data";

const prisma = new PrismaClient();

async function main() {
  await ensureRealYear(prisma);
  await wipeDemo(prisma);
  if (process.env.SKIP_DEMO === "true") return;
  await seedDemo(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
