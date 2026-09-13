import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { familyRolePath, getPageFamilyUser } from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getPageFamilyUser();
  if (!user) redirect("/connexion");
  const directEntry = (await cookies()).get("family_direct_entry")?.value === "1";
  redirect(directEntry ? familyRolePath(user.role) : "/abonnement");
}
