import type dns from "node:dns";
import { describe, expect, it } from "vitest";
import {
  guardedLookup,
  isPublicAddress,
  parsePublicUrl,
  UnsafeUrlError,
} from "@/lib/crawl/url-guard";

const reasonFor = (input: string) => {
  try {
    parsePublicUrl(input);
  } catch (error) {
    if (error instanceof UnsafeUrlError) return error.reason;
    throw error;
  }
  return "accepted";
};

describe("parsePublicUrl", () => {
  it("accepts a bare domain and assumes https", () => {
    expect(parsePublicUrl("tacos.mx").toString()).toBe("https://tacos.mx/");
  });

  it("keeps path and query and drops the fragment", () => {
    expect(parsePublicUrl("http://tacos.mx/menu?dia=martes#promo").toString()).toBe(
      "http://tacos.mx/menu?dia=martes",
    );
  });

  it.each([
    ["", "invalid_url"],
    ["http://", "invalid_url"],
    ["ftp://tacos.mx/menu", "unsupported_scheme"],
    ["file:///etc/passwd", "unsupported_scheme"],
    ["gopher://tacos.mx", "unsupported_scheme"],
    ["https://admin:secret@tacos.mx", "credentials_in_url"],
    ["https://tacos.mx:8443", "non_default_port"],
    ["http://tacos.mx:6379", "non_default_port"],
    ["http://localhost", "private_host"],
    ["http://intranet", "private_host"],
    ["http://db.internal", "private_host"],
    ["http://impresora.local", "private_host"],
    ["http://127.0.0.1", "private_address"],
    ["http://10.0.0.5", "private_address"],
    ["http://172.16.4.1", "private_address"],
    ["http://192.168.1.1", "private_address"],
    ["http://169.254.169.254/latest/meta-data", "private_address"],
    ["http://100.64.0.1", "private_address"],
    ["http://0.0.0.0", "private_address"],
    ["http://[::1]", "private_address"],
    ["http://[fd00::1]", "private_address"],
    ["http://[fe80::1]", "private_address"],
    ["http://[::ffff:127.0.0.1]", "private_address"],
    ["http://[::ffff:a00:1]", "private_address"],
    // Alternate spellings of 127.0.0.1 that URL parsing normalises.
    ["http://2130706433", "private_address"],
    ["http://0x7f.0.0.1", "private_address"],
    ["http://017700000001", "private_address"],
    ["http://127.1", "private_address"],
  ])("rejects %s as %s", (input, reason) => {
    expect(reasonFor(input)).toBe(reason);
  });
});

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "201.144.0.1", "2606:4700:4700::1111"])("treats %s as public", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.10",
    "169.254.169.254",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fe80::abcd",
    "ff02::1",
    "::ffff:10.0.0.1",
    "::ffff:0a00:0001",
    "64:ff9b::a00:1",
    "not-an-ip",
  ])("treats %s as not public", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("guardedLookup", () => {
  const lookup = (hostname: string, options: dns.LookupOptions) =>
    new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>((resolve) => {
      guardedLookup(hostname, options, (error, address) => resolve({ error, address }));
    });

  it("fails a name that resolves to a loopback address", async () => {
    const { error } = await lookup("localhost", {});
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect(error?.code).toBe("EUNSAFEADDRESS");
  });

  it("fails the same way when the caller asks for all addresses", async () => {
    const { error, address } = await lookup("localhost", { all: true });
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect(address).toEqual([]);
  });
});
