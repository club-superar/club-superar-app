import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Club SUPER.AR",
    short_name: "Club SUPER.AR",
    description: "Sorteos, beneficios y comunidad de SUPER.AR.",
    start_url: "/",
    display: "standalone",
    background_color: "#050708",
    theme_color: "#050708",
    lang: "es-AR",
  };
}
