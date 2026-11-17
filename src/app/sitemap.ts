import type { MetadataRoute } from "next";

const SITE = "https://www.pelotaz.com";

/**
 * The pages meant to be found. /beta and /precios are the home page under
 * another address (their canonical is the root) and /empieza is noindex, so
 * none of them is listed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/jonas`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/terminos`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
