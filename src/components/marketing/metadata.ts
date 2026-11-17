import type { Metadata } from "next";
import { es } from "@/i18n/es";

export type LandingEntry = "root" | "beta" | "precios";

const t = es.marketing;
const headline = `${t.hero.titleBefore} ${t.hero.titleHighlight}`;

/**
 * Metadata for the public page and its short addresses. They are one page to
 * search engines: every address points its canonical at the root.
 */
export function landingMetadata(entry: LandingEntry): Metadata {
  const ogTitle = entry === "beta" ? t.meta.betaTitle : headline;
  return {
    title: { absolute: entry === "beta" ? t.meta.betaTitle : `${es.app.name}: ${headline}` },
    description: t.hero.lead,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "es_MX",
      siteName: es.app.name,
      url: entry === "root" ? "/" : `/${entry}`,
      title: ogTitle,
      description: entry === "beta" ? t.meta.betaDescription : t.hero.lead,
      // Named here because a page's own openGraph replaces the inherited image.
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: t.hero.artLabel }],
    },
  };
}
