import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dépenses famille",
    short_name: "Dépenses",
    description: "Courses, commandes et dépenses de la famille.",
    start_url: "/connexion",
    display: "standalone",
    background_color: "#f3f8f6",
    theme_color: "#087f64",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
