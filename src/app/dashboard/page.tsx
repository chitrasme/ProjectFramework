import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/session";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { denied } = await searchParams;
  redirect(homeFor(user.role) + (denied ? "?denied=1" : ""));
}
