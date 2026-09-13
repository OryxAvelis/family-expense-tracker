import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageFamilyUser } from "@/lib/family-auth";
import { HouseServices } from "@/app/house-services";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Missions maison · Dépenses famille" };

export default async function ServicesPage() {
  const user = await getPageFamilyUser();
  if (!user) redirect("/connexion?returnTo=%2Fservices");
  return <HouseServices currentUser={user} />;
}
