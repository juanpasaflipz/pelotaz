import type { MetadataRoute } from "next";

const SITE = "https://www.pelotaz.com";

/**
 * Search engines may read the public pages. The app, the admin pages and the
 * API are kept out. /empieza (paid ads only) and the sign-in pages carry their
 * own noindex, so they stay crawlable for that tag to be seen.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/brands/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
