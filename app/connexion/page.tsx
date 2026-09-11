import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { familyRolePath, getPageFamilyUser } from "@/lib/family-auth";
import { LoginForm } from "../login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion · Dépenses famille",
};

export default async function LoginPage() {
  const user = await getPageFamilyUser();
  if (user) redirect(familyRolePath(user.role));
  return <LoginForm />;
}
