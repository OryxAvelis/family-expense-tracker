import type { Metadata } from "next";

import { FamilyTracker } from "../family-tracker";

export const metadata: Metadata = {
  title: "Administration · Dépenses famille",
};

export default function AdminPage() {
  return <FamilyTracker role="admin" />;
}
