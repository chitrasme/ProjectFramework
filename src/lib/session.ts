import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "./db";

const COOKIE = "pt_session";
const MAX_AGE = 60 * 60 * 12; // 12 hours

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isDemo: boolean;
  rollNo: string | null;
  department: string;
  mustChangePassword: boolean;
};

/** Current user, re-read from the database on every request so deactivation takes effect at once. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, name: true, email: true, role: true, isDemo: true,
        rollNo: true, department: true, active: true, mustChangePassword: true,
      },
    });
    if (!user || !user.active) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { active, ...rest } = user;
    return rest;
  } catch {
    return null;
  }
});

export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

export function homeFor(role: Role) {
  return role === "HOD" ? "/hod" : role === "GUIDE" ? "/guide" : "/student";
}
