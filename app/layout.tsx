import type { Metadata } from "next";
import "./globals.css";

import { FAMILY_THEME_STORAGE_KEY } from "@/lib/family-theme";

export const metadata: Metadata = {
  title: "Dépenses famille",
  description: "Courses, demandes et dépenses mensuelles de la famille.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const theme=localStorage.getItem(${JSON.stringify(FAMILY_THEME_STORAGE_KEY)});document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.style.colorScheme=theme==="dark"?"dark":"light"}catch{}`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
