import type { Metadata, Viewport } from "next";
import "./globals.css";

import { FAMILY_THEME_STORAGE_KEY } from "@/lib/family-theme";
import { PwaInstaller } from "@/app/pwa-installer";

export const metadata: Metadata = {
  applicationName: "Dépenses famille",
  title: "Dépenses famille",
  description: "Courses, demandes et dépenses mensuelles de la famille.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dépenses",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icons/icon-192.png",
    shortcut: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#08121a" },
  ],
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
      <body className="antialiased">
        {children}
        <PwaInstaller />
      </body>
    </html>
  );
}
