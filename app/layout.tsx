import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="fr" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
