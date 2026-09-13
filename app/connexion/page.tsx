import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { familyRolePath, getPageFamilyUser } from "@/lib/family-auth";
import { LoginForm } from "../login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion · Dépenses famille",
};

export default async function LoginPage() {
  const user = await getPageFamilyUser();
  if (user) {
    const directEntry = (await cookies()).get("family_direct_entry")?.value === "1";
    redirect(directEntry ? familyRolePath(user.role) : "/abonnement");
  }
  return <LoginForm />;
}
