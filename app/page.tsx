import { redirect } from "next/navigation";

import { familyRolePath, getPageFamilyUser } from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getPageFamilyUser();
  redirect(user ? familyRolePath(user.role) : "/connexion");
}
