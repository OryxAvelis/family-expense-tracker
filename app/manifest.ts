import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dépenses famille",
    short_name: "Dépenses",
    description: "Courses, commandes et dépenses de la famille.",
    start_url: "/connexion",
    scope: "/",
    lang: "fr",
    dir: "auto",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "any",
    background_color: "#f3f8f6",
    theme_color: "#087f64",
    categories: ["finance", "shopping", "productivity"],
    shortcuts: [
      {
        name: "Nouvelle commande",
        short_name: "Commander",
        description: "Ouvrir le catalogue familial",
        url: "/membre",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "File d’achats",
        short_name: "Livraison",
        description: "Voir les commandes à acheter",
        url: "/livreur",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
