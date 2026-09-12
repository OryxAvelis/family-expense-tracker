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
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("family-expense-theme")==="dark")document.documentElement.classList.add("dark")}catch{}`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
