import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chief of Staff",
    short_name: "Chief",
    description: "Your tasks, habits, journal, money and notes in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EDF0EE",
    theme_color: "#1E5A7A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
