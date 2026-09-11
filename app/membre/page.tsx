import type { Metadata } from "next";

import { requireFamilyRole } from "@/lib/family-auth";
import { FamilyTracker } from "../family-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Espace membre · Dépenses famille",
};

export default async function MemberPage() {
  const user = await requireFamilyRole("member", "/membre");
  return <FamilyTracker role="member" currentUser={user} />;
}
