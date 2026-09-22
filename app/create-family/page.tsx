import type { Metadata } from "next";

import { CreateFamilyForm } from "./create-family-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Créer une famille · DarnaFlow",
  description: "Créez un espace DarnaFlow privé pour votre foyer.",
  robots: { index: false, follow: false },
};

export default function CreateFamilyPage() {
  return <CreateFamilyForm />;
}
