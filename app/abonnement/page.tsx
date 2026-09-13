import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPageFamilyUser } from "@/lib/family-auth";
import { SubscriptionPlans } from "@/app/subscription-plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Abonnement · Dépenses famille" };

export default async function SubscriptionPage() {
  const user = await getPageFamilyUser();
  if (!user) redirect("/connexion?returnTo=%2Fabonnement");
  return <SubscriptionPlans currentUser={user} />;
}
