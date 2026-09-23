import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FamilyEntrance } from "@/app/family-entrance";
import {
  familyRolePath,
  getPageFamilyUser,
} from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ma famille · DarnaFlow",
  description: "Choisissez votre profil familial et entrez avec votre code personnel.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    familyCode?: string | string[];
  }>;
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
  return <FamilyEntrance familyCode={initialFamilyCode} />;
}
