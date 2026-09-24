import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyEntrance } from "@/app/family-entrance";
import {
  familyLoginPath,
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
    returnTo?: string | string[];
  }>;
}) {
  const user = await getPageFamilyUser();
  const parameters = await searchParams;
  const returnTo = Array.isArray(parameters.returnTo) ? parameters.returnTo[0] : parameters.returnTo;
  if (user) {
    redirect(familyLoginPath(user.role, returnTo));
  }
  const initialFamilyCode = Array.isArray(parameters.familyCode)
    ? parameters.familyCode[0]
    : parameters.familyCode;
  return <FamilyEntrance familyCode={initialFamilyCode} returnTo={returnTo} />;
}
