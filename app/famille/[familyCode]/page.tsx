import type { Metadata } from "next";
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
    redirect(familyRolePath(user.role));
  }

  const { familyCode } = await params;
  return <FamilyEntrance familyCode={decodeURIComponent(familyCode)} />;
}
