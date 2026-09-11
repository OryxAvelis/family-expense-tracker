import type { Metadata } from "next";

import { requireFamilyRole } from "@/lib/family-auth";
import { FamilyTracker } from "../family-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace livreur · Dépenses famille",
};

export default async function DeliveryPage() {
  const user = await requireFamilyRole("delivery", "/livreur");
  return <FamilyTracker role="delivery" currentUser={user} />;
}
