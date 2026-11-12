import http from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGuardedFetcher, FetchRejectedError } from "@/lib/crawl/fetcher";
import type { PageFetcher } from "@/lib/crawl/types";
import { UnsafeUrlError } from "@/lib/crawl/url-guard";

/**
 * These tests run the real fetcher against a real HTTP server. The only thing
 * replaced is DNS: `*.example` names resolve to the local server, so the
 * fetcher sees a public-looking hostname. All URL and redirect checks are live.
 */
let server: http.Server;
let port: number;
let fetcher: PageFetcher;
const hits: string[] = [];

const toLocalServer: LookupFunction = (_hostname, options, callback) => {
  if (typeof options === "object" && options.all) {
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
  } else {
    callback(null, "127.0.0.1", 4);
  }
};

const site = (path: string) => `http://sitio.example:${port}${path}`;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    const redirect = (location: string) => {
      res.writeHead(302, { location });
      res.end();
    };
    switch (req.url) {
      case "/":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end("<html><body>Hola</body></html>");
      case "/viejo":
        return redirect("/");
      case "/a-loopback":
        return redirect(`http://127.0.0.1:${port}/secreto`);
      case "/a-metadata":
        return redirect("http://169.254.169.254/latest/meta-data/");
      case "/a-localhost":
        return redirect(`http://localhost:${port}/secreto`);
      case "/a-archivo":
        return redirect("file:///etc/passwd");
      case "/bucle":
        return redirect("/bucle");
      case "/secreto":
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("datos internos");
      case "/imagen":
        res.writeHead(200, { "content-type": "image/png" });
        return res.end("PNG");
      case "/enorme":
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("x".repeat(2_500_000));
      case "/latin1":
        res.writeHead(200, { "content-type": "text/html; charset=ISO-8859-1" });
        return res.end(Buffer.from("<p>Señor Muñoz, jalapeño</p>", "latin1"));
      case "/agente":
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(req.headers["user-agent"]);
      default:
        res.writeHead(404, { "content-type": "text/html" });
        return res.end("no existe");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  fetcher = createGuardedFetcher({
    testOverrides: { lookup: toLocalServer, allowAnyPort: true },
  });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const rejection = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the fetch to be rejected");
};

describe("guarded fetcher", () => {
  it("fetches a page", async () => {
    const result = await fetcher.fetch(site("/"), "html");
    expect(result.status).toBe(200);
    expect(result.body).toContain("Hola");
  });

  it("follows a same-site redirect and reports the final URL", async () => {
    const result = await fetcher.fetch(site("/viejo"), "html");
    expect(result.url).toBe(site("/"));
    expect(result.body).toContain("Hola");
  });

  it("identifies itself", async () => {
    const result = await fetcher.fetch(site("/agente"), "html");
    expect(result.body).toMatch(/^PelotazBot\//);
  });

  it("returns non-200 responses without a body", async () => {
    const result = await fetcher.fetch(site("/no-hay"), "html");
    expect(result).toMatchObject({ status: 404, body: "" });
  });

  it.each([
    ["a loopback address", "/a-loopback", "private_address"],
    ["the cloud metadata address", "/a-metadata", "private_address"],
    ["localhost", "/a-localhost", "private_host"],
    ["a file URL", "/a-archivo", "unsupported_scheme"],
  ])("refuses a redirect to %s", async (_label, path, reason) => {
    hits.length = 0;
    const error = await rejection(() => fetcher.fetch(site(path), "html"));
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect((error as UnsafeUrlError).reason).toBe(reason);
    // The redirect target was never requested.
    expect(hits).toEqual([path]);
  });

  it("stops after too many redirects", async () => {
    const error = await rejection(() => fetcher.fetch(site("/bucle"), "html"));
    expect(error).toBeInstanceOf(FetchRejectedError);
    expect((error as FetchRejectedError).reason).toBe("too_many_redirects");
  });

  it("refuses a response that is not the expected kind", async () => {
    const error = await rejection(() => fetcher.fetch(site("/imagen"), "html"));
    expect((error as FetchRejectedError).reason).toBe("wrong_content_type");
  });

  it("refuses a body over the size cap", async () => {
    const error = await rejection(() => fetcher.fetch(site("/enorme"), "html"));
    expect((error as FetchRejectedError).reason).toBe("too_large");
  });

  it("decodes the charset the server declares", async () => {
    const result = await fetcher.fetch(site("/latin1"), "html");
    expect(result.body).toContain("Señor Muñoz, jalapeño");
  });
});

describe("guarded fetcher with production settings", () => {
  const production = createGuardedFetcher();

  it("refuses the local server by address", async () => {
    hits.length = 0;
    const error = await rejection(() => production.fetch("http://127.0.0.1/", "html"));
    expect((error as UnsafeUrlError).reason).toBe("private_address");
    expect(hits).toEqual([]);
  });

  it("refuses a non-default port", async () => {
    const error = await rejection(() => production.fetch(`http://sitio.example:${port}/`, "html"));
    expect((error as UnsafeUrlError).reason).toBe("non_default_port");
  });

  it("refuses a hostname that resolves to a private address at connect time", async () => {
    // `localhost.` variants are caught by name; this checks the DNS layer by
    // resolving a name the name-based rules do not know about.
    const viaDns = createGuardedFetcher({
      testOverrides: {
        allowAnyPort: true,
        lookup: ((hostname, options, callback) => {
          // Stand in for a public name whose A record points inward.
          import("@/lib/crawl/url-guard").then(({ guardedLookup }) =>
            guardedLookup("localhost", options as never, callback as never),
          );
        }) as LookupFunction,
      },
    });
    hits.length = 0;
    const error = await rejection(() => viaDns.fetch(`http://rebind.example:${port}/secreto`, "html"));
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect((error as UnsafeUrlError).reason).toBe("private_address");
    expect(hits).toEqual([]);
  });
});
