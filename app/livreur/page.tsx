import type { Metadata } from "next";

import { FamilyTracker } from "../family-tracker";

export const metadata: Metadata = {
  title: "Espace livreur · Dépenses famille",
};

export default function DeliveryPage() {
  return <FamilyTracker role="delivery" />;
}
