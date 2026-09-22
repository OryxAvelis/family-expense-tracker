import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { familyRolePath, getPageFamilyUser } from "@/lib/family-auth";
import { LoginForm } from "../login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion · Dépenses famille",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ familyCode?: string | string[]; mode?: string | string[] }>;
}) {
  const user = await getPageFamilyUser();
  if (user) {
    const directEntry = (await cookies()).get("family_direct_entry")?.value === "1";
    redirect(directEntry ? familyRolePath(user.role) : "/abonnement");
  }
  const parameters = await searchParams;
  const initialFamilyCode = Array.isArray(parameters.familyCode)
    ? parameters.familyCode[0]
    : parameters.familyCode;
  const requestedMode = Array.isArray(parameters.mode) ? parameters.mode[0] : parameters.mode;
  return (
    <LoginForm
      initialFamilyCode={initialFamilyCode}
      initialMode={requestedMode === "signup" ? "signup" : "login"}
    />
  );
}
