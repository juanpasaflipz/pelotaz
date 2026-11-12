import { describe, expect, it } from "vitest";
import { CrawlError, crawlSite } from "@/lib/crawl/crawl";
import { prioritize } from "@/lib/crawl/discover";
import { extractFonts, extractPage, extractPalette } from "@/lib/crawl/extract";
import { isAllowed, NO_RULES, parseRobots } from "@/lib/crawl/robots";
import { createFixtureFetcher, ORIGIN, ROUTES } from "./fixtures/site";

const paths = (urls: string[]) => urls.map((url) => new URL(url).pathname);

describe("crawlSite", () => {
  it("reads the home page first, then pages by how much they say about the brand", async () => {
    const result = await crawlSite(createFixtureFetcher(), ORIGIN);
    expect(paths(result.pages.map((p) => p.url))).toEqual([
      "/",
      "/nosotros",
      "/menu",
      "/promociones",
      "/sucursales",
      "/blog/como-asamos",
    ]);
  });

  it("never requests pages that robots.txt disallows, carts, or files", async () => {
    const fetcher = createFixtureFetcher();
    await crawlSite(fetcher, ORIGIN);
    const requested = paths(fetcher.requested);
    expect(requested).not.toContain("/privado/panel");
    expect(requested).not.toContain("/privado/reportes");
    expect(requested).not.toContain("/carrito");
    expect(requested).not.toContain("/menu.pdf");
    expect(fetcher.requested.every((url) => url.startsWith(ORIGIN))).toBe(true);
  });

  it("records pages that fail or leave the site and carries on", async () => {
    const result = await crawlSite(createFixtureFetcher(), ORIGIN);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        { url: `${ORIGIN}/contacto`, reason: "HTTP 500" },
        { url: `${ORIGIN}/reservar`, reason: "redirected_off_site" },
      ]),
    );
    expect(result.pages.some((p) => p.text.includes("Plataforma de reservas"))).toBe(false);
  });

  it("respects the page limit and still starts with the home page", async () => {
    const result = await crawlSite(createFixtureFetcher(), ORIGIN, { maxPages: 3 });
    expect(paths(result.pages.map((p) => p.url))).toEqual(["/", "/nosotros", "/menu"]);
  });

  it("derives the visual identity from markup and CSS", async () => {
    const { visuals } = await crawlSite(createFixtureFetcher(), ORIGIN);
    expect(visuals.palette).toEqual(["#b3261e", "#f2a900"]);
    expect(visuals.fonts).toEqual(["Bitter", "Work Sans"]);
    expect(visuals.logoUrl).toBe(`${ORIGIN}/img/logo-labrasa.png`);
    expect(visuals.referenceImages[0]).toBe(`${ORIGIN}/img/portada.jpg`);
    expect(visuals.socialLinks).toEqual({
      instagram: "https://www.instagram.com/labrasa.mx/",
      whatsapp: "https://wa.me/525500000000",
    });
  });

  it("stays out when robots.txt disallows everything, without touching the home page", async () => {
    const fetcher = createFixtureFetcher({
      ...ROUTES,
      "/robots.txt": { contentType: "text/plain", body: "User-agent: *\nDisallow: /\n" },
    });
    await expect(crawlSite(fetcher, ORIGIN)).rejects.toMatchObject({
      name: "CrawlError",
      reason: "blocked_by_robots",
    });
    expect(paths(fetcher.requested)).toEqual(["/robots.txt"]);
  });

  it("fails clearly when the home page is not reachable", async () => {
    const fetcher = createFixtureFetcher({ "/robots.txt": ROUTES["/robots.txt"] });
    const error = await crawlSite(fetcher, ORIGIN).catch((e) => e);
    expect(error).toBeInstanceOf(CrawlError);
    expect(error.reason).toBe("home_unreachable");
  });
});

describe("extractPage", () => {
  const home = extractPage(ROUTES["/"].body, `${ORIGIN}/`, 200);

  it("keeps the copy and drops navigation, footer and scripts", () => {
    expect(home.text).toContain("Desde 2011 asamos arrachera y pastor");
    expect(home.text).not.toContain("Carrito");
    expect(home.text).not.toContain("Aviso de privacidad");
    expect(home.text).not.toContain("no-debe-aparecer");
  });

  it("reads title, description, language and headings", () => {
    expect(home.title).toBe("Taquería La Brasa | Tacos al carbón en Guadalajara");
    expect(home.assets.description).toContain("tortilla hecha a mano");
    expect(home.assets.lang).toBe("es-MX");
    expect(home.headings).toEqual(["Tacos al carbón, como en casa de la abuela"]);
  });

  it("keeps content images and skips the logo, pixels and icons", () => {
    expect(home.assets.images.map((i) => i.url)).toEqual([`${ORIGIN}/img/tacos-arrachera.jpg`]);
    expect(home.assets.logoCandidates[0]).toBe(`${ORIGIN}/img/logo-labrasa.png`);
  });

  it("separates brand profiles from share links", () => {
    expect(home.assets.socialLinks.instagram).toBe("https://www.instagram.com/labrasa.mx/");
    expect(home.assets.socialLinks.facebook).toBeUndefined();
    expect(home.links.some((l) => l.includes("instagram.com"))).toBe(false);
  });

  it("ignores links that cannot be crawled", () => {
    const page = extractPage(
      `<a href="mailto:hola@x.mx">a</a><a href="tel:+52">b</a><a href="javascript:void(0)">c</a><a href="#top">d</a><a href="/ok">e</a>`,
      `${ORIGIN}/`,
      200,
    );
    expect(page.links).toEqual([`${ORIGIN}/`, `${ORIGIN}/ok`]);
  });
});

describe("palette and fonts", () => {
  it("ranks saturated colors by use and merges near-duplicates", () => {
    const css = ".a{color:#b3261e}.b{color:#B3261E}.c{color:#b5281f}.d{color:#0057b8}.e{color:#fff}.f{color:#222}";
    expect(extractPalette(css, null)).toEqual(["#b3261e", "#0057b8"]);
  });

  it("puts a declared theme color first", () => {
    expect(extractPalette(".a{color:#0057b8}.b{color:#0057b8}", "#F2A900")).toEqual([
      "#f2a900",
      "#0057b8",
    ]);
  });

  it("returns nothing rather than greys when a site has no brand color", () => {
    expect(extractPalette("body{color:#333;background:#fafafa}", null)).toEqual([]);
  });

  it("drops system fallbacks and icon fonts", () => {
    const css = `body{font-family:"Work Sans",Arial}h1{font-family:Arial}i{font-family:"Font Awesome 6 Free"}`;
    expect(extractFonts(css, [])).toEqual(["Work Sans"]);
  });
});

describe("robots.txt", () => {
  it("applies the wildcard group and collects sitemaps", () => {
    const rules = parseRobots(ROUTES["/robots.txt"].body);
    expect(rules.sitemaps).toEqual([`${ORIGIN}/sitemap.xml`]);
    expect(isAllowed(rules, "/menu")).toBe(true);
    expect(isAllowed(rules, "/privado/panel")).toBe(false);
  });

  it("ignores groups for other crawlers", () => {
    const rules = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /tmp\n");
    expect(isAllowed(rules, "/menu")).toBe(true);
    expect(isAllowed(rules, "/tmp/x")).toBe(false);
  });

  it("obeys a group that names this crawler", () => {
    const rules = parseRobots("User-agent: PelotazBot\nDisallow: /\n");
    expect(isAllowed(rules, "/")).toBe(false);
  });

  it("lets a longer Allow override a shorter Disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /tienda\nAllow: /tienda/menu\n");
    expect(isAllowed(rules, "/tienda/menu")).toBe(true);
    expect(isAllowed(rules, "/tienda/carrito")).toBe(false);
  });
});

describe("prioritize", () => {
  it("treats www and trailing slashes as the same page and drops tracking parameters", () => {
    const urls = prioritize(
      [
        "https://www.labrasa.example/menu/",
        "https://labrasa.example/menu?utm_source=ig",
        "https://labrasa.example/menu",
      ],
      ORIGIN,
      NO_RULES,
      10,
    );
    expect(urls).toEqual(["https://www.labrasa.example/menu"]);
  });

  it("ranks a section index above an item inside it", () => {
    const urls = prioritize(
      [`${ORIGIN}/productos/salsa-macha`, `${ORIGIN}/productos`, `${ORIGIN}/`],
      ORIGIN,
      NO_RULES,
      10,
    );
    expect(paths(urls)).toEqual(["/", "/productos", "/productos/salsa-macha"]);
  });
});
