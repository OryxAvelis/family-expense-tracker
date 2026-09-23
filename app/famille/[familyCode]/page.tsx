import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FamilyEntrance } from "@/app/family-entrance";
import { familyRolePath, getPageFamilyUser } from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrer dans ma famille · DarnaFlow",
  description: "Un accès simple et privé à votre espace familial DarnaFlow.",
};

export default async function FamilyEntrancePage({
  params,
}: {
  params: Promise<{ familyCode: string }>;
}) {
  const user = await getPageFamilyUser();
  if (user) {
    const directEntry = (await cookies()).get("family_direct_entry")?.value === "1";
    redirect(directEntry ? familyRolePath(user.role) : "/abonnement");
  }

  const { familyCode } = await params;
  return <FamilyEntrance familyCode={decodeURIComponent(familyCode)} />;
}
