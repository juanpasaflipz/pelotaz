import type { MetadataRoute } from "next";
import { GUIDE_SLUGS } from "@/i18n/guias";

const SITE = "https://www.pelotaz.com";

/**
 * The pages meant to be found, the public guides included. /beta and /precios are the home page under
 * another address (their canonical is the root) and /empieza is noindex, so
 * none of them is listed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/jonas`, changeFrequency: "monthly", priority: 0.6 },
    ...GUIDE_SLUGS.map((slug) => ({ url: `${SITE}/${slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/terminos`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
