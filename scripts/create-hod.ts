/**
 * Creates (or resets the password of) a real Head of Department account.
 *   npm run create-hod -- --email hod@college.edu --name "Dr. Name" --password "StrongPass#1"
 * The HOD then adds guides and students from the Users page.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase().trim();
  const name = arg("name") ?? "Head of Department";
  const password = arg("password");
  const department = arg("department") ?? "Computer Science";
  if (!email || !password) throw new Error('Usage: npm run create-hod -- --email you@college.edu --name "Dr. Name" --password "StrongPass#1"');
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: "HOD", department, isDemo: false },
    update: { passwordHash, role: "HOD", active: true, name },
  });
  await prisma.auditLog.create({ data: { actorId: null, action: "user.create_hod", entity: "User", entityId: user.id, details: { email } } });
  console.log(`HOD account ready: ${email}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
