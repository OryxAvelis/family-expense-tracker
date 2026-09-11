import type { Metadata } from "next";

import { requireFamilyRole } from "@/lib/family-auth";
import { FamilyTracker } from "../family-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administration · Dépenses famille",
};

export default async function AdminPage() {
  const user = await requireFamilyRole("admin", "/admin");
  return <FamilyTracker role="admin" currentUser={user} />;
}
