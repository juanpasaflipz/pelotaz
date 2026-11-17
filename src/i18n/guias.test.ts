import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { guias, GUIDE_SLUGS } from "@/i18n/guias";

describe("public guides", () => {
  it("has a unique title and description for each, within search limits", () => {
    const titles = GUIDE_SLUGS.map((slug) => guias[slug].metaTitle);
    const descriptions = GUIDE_SLUGS.map((slug) => guias[slug].metaDescription);
    expect(new Set(titles).size).toBe(GUIDE_SLUGS.length);
    expect(new Set(descriptions).size).toBe(GUIDE_SLUGS.length);
    for (const slug of GUIDE_SLUGS) {
      expect(guias[slug].slug).toBe(slug);
      expect(guias[slug].metaTitle.length).toBeLessThanOrEqual(60);
      expect(guias[slug].metaDescription.length).toBeLessThanOrEqual(160);
    }
  });

  it("lists every guide in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const slug of GUIDE_SLUGS) expect(urls).toContain(`https://www.pelotaz.com/${slug}`);
  });

  it("makes no claim the pages cannot back up", () => {
    const all = JSON.stringify(guias);
    // No invented numbers, ratings or testimonials; no payment methods the product does not take; no competitor names.
    expect(all).not.toMatch(/\d+\s?%/);
    expect(all).not.toMatch(/estrellas de|opiniones de clientes|testimonio/i);
    expect(all).not.toMatch(/oxxo|spei|holo/i);
  });
});
