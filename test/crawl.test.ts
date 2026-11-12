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

  it("reports no languages for a site without language prefixes", async () => {
    const result = await crawlSite(createFixtureFetcher(), ORIGIN, { language: "es" });
    expect(result.siteLanguages).toEqual([]);
    expect(result.languageRead).toBeNull();
  });

  it("reports the languages of a bilingual site and which one it read", async () => {
    const html = (body: string) => ({ contentType: "text/html", body: `<html><body><main>${body}</main></body></html>` });
    const nav = `<a href="/es/menu">Menú</a><a href="/es/historia">Historia</a><a href="/es/contacto">Contacto</a><a href="/en">English</a><a href="/en/menu">Menu</a>`;
    const fetcher = createFixtureFetcher({
      "/es": html(`<h1>Hola</h1>${nav}`),
      "/es/menu": html("<h1>Menú</h1>"),
      "/es/historia": html("<h1>Historia</h1>"),
      "/es/contacto": html("<h1>Contacto</h1>"),
      "/en": html("<h1>Hello</h1>"),
      "/en/menu": html("<h1>Menu</h1>"),
    });
    const result = await crawlSite(fetcher, `${ORIGIN}/es`, { language: "es" });
    expect(result.siteLanguages).toEqual(["en", "es"]);
    expect(result.languageRead).toBe("es");
    expect(fetcher.requested.some((url) => new URL(url).pathname.startsWith("/en"))).toBe(false);
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

describe("extraction details found on real sites", () => {
  it("keeps side-by-side buttons from fusing into one word", () => {
    const page = extractPage(
      `<main><div><a href="/order">Ordenar ahora</a><a href="/menu">Ver el menú</a></div><p>Con <a href="/x">papas</a>.</p></main>`,
      `${ORIGIN}/`,
      200,
    );
    expect(page.text).toContain("Ordenar ahora Ver el menú");
    // A link inside a sentence is left alone.
    expect(page.text).toContain("Con papas.");
  });

  it("separates fused labels without splitting ordinary words", () => {
    const page = extractPage(
      `<main>
         <div><span>Refresco</span><span>Consulta sabores.</span></div>
         <p><span>nuevo</span>Taquitos dorados rellenos de queso.</p>
         <p>Pide por WhatsApp o por <strong>DiDi</strong>Food. Agua de Fresa-<span>Limón</span>.</p>
       </main>`,
      `${ORIGIN}/`,
      200,
    );
    expect(page.text).toContain("Refresco Consulta sabores.");
    expect(page.text).toContain("nuevo Taquitos dorados");
    expect(page.text).toContain("WhatsApp");
    expect(page.text).toContain("Fresa-Limón.");
  });

  it("uses the original file behind an image optimiser URL", () => {
    const page = extractPage(
      `<img class="logo" src="/_next/image?url=%2Fbrand%2Flogo.png&w=96&q=75" alt="Logo">
       <img src="/_next/image?url=%2Ffotos%2Fburrito.jpg&w=640&q=75" width="640" height="480" alt="Burrito">`,
      `${ORIGIN}/`,
      200,
    );
    expect(page.assets.logoCandidates[0]).toBe(`${ORIGIN}/brand/logo.png`);
    expect(page.assets.images.map((i) => i.url)).toEqual([`${ORIGIN}/fotos/burrito.jpg`]);
  });

  it("does not take a tinted page background for a brand color", () => {
    const css = "body{background:#faf6ee}main{background:#faf6ee}.a{background:#faf6ee}.cta{color:#f47b20}.noche{background:#14100a}";
    expect(extractPalette(css, null)).toEqual(["#f47b20"]);
  });

  it("keeps a declared theme color even when it is very light", () => {
    expect(extractPalette(".cta{color:#f47b20}", "#faf6ee")).toEqual(["#faf6ee", "#f47b20"]);
  });

  it("drops the fallback faces Next.js generates", () => {
    const css = `h1{font-family:"Permanent Marker","Permanent Marker Fallback"}p{font-family:"Permanent Marker Fallback"}`;
    expect(extractFonts(css, [])).toEqual(["Permanent Marker"]);
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

  // Path layout taken from a real bilingual restaurant site.
  const bilingual = [
    "/es", "/es/menu", "/es/ingredients", "/es/story", "/es/locations", "/es/order",
    "/es/burritos-roma-sur", "/es/burrito-vs-burger",
    "/en", "/en/menu", "/en/ingredients", "/en/story", "/en/locations",
  ].map((path) => `${ORIGIN}${path}`);

  it("reads one language of a bilingual site, in the brand's language", () => {
    const urls = paths(prioritize(bilingual, `${ORIGIN}/es`, NO_RULES, 20, "es"));
    expect(urls.some((path) => path.startsWith("/en"))).toBe(false);
    expect(urls.slice(0, 5)).toEqual(["/es", "/es/story", "/es/menu", "/es/ingredients", "/es/locations"]);
  });

  it("does not treat a language prefix as depth", () => {
    const urls = paths(prioritize([`${ORIGIN}/es/menu`, `${ORIGIN}/blog`], ORIGIN, NO_RULES, 10));
    expect(urls).toEqual(["/es/menu", "/blog"]);
  });

  it("keeps the other language when the site barely exists in the wanted one", () => {
    const urls = paths(
      prioritize([`${ORIGIN}/en`, `${ORIGIN}/en/menu`, `${ORIGIN}/en/story`, `${ORIGIN}/es`], ORIGIN, NO_RULES, 10, "es"),
    );
    expect(urls).toContain("/en/menu");
  });

  it("does not mistake a two-letter section for a language", () => {
    const urls = paths(prioritize([`${ORIGIN}/mx/menu`, `${ORIGIN}/tv`], ORIGIN, NO_RULES, 10, "es"));
    expect(urls).toEqual(["/mx/menu", "/tv"]);
  });
});
