import type { Metadata } from "next";

import { FamilyTracker } from "../family-tracker";

export const metadata: Metadata = {
  title: "Espace membre · Dépenses famille",
};

export default function MemberPage() {
  return <FamilyTracker role="member" />;
}
