import dns from "node:dns";
import net from "node:net";

/**
 * Users paste arbitrary URLs and the server fetches them, so every outbound
 * request has to be kept away from the server's own network. Two layers:
 *
 * 1. `parsePublicUrl` rejects anything that is not plain http(s) on a default
 *    port to a public-looking host, before any network activity.
 * 2. `guardedLookup` is installed as the DNS resolver of the HTTP client, so
 *    the address that gets validated is the address that gets connected to.
 *    Checking DNS in a separate step would leave a rebinding window.
 */

export class UnsafeUrlError extends Error {
  constructor(
    public readonly reason: UnsafeUrlReason,
    detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "UnsafeUrlError";
  }
}

export type UnsafeUrlReason =
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_in_url"
  | "non_default_port"
  | "private_host"
  | "private_address";

const blocked = new net.BlockList();
// IPv4: unspecified, private, CGNAT, loopback, link-local (cloud metadata lives
// here), protocol assignments, documentation, benchmarking, multicast, reserved.
for (const [prefix, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv4");
}
// IPv6: unspecified, loopback, IPv4-mapped (checked separately below), NAT64,
// discard, documentation, unique-local, link-local, multicast.
for (const [prefix, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv6");
}

const MAPPED_V4 = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
const MAPPED_V4_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/** True only for addresses that are routable on the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family !== 6) return false;

  // An IPv4-mapped IPv6 address reaches the IPv4 host, so judge it as IPv4.
  const dotted = MAPPED_V4.exec(address);
  if (dotted) return isPublicAddress(dotted[1]);
  const hex = MAPPED_V4_HEX.exec(address);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return !blocked.check(address, "ipv6");
}

const PRIVATE_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet"];

/**
 * Parse user input into a URL that is safe to request. Accepts a bare domain
 * ("tacos.mx") and assumes https.
 */
export function parsePublicUrl(input: string, options: { allowAnyPort?: boolean } = {}): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new UnsafeUrlError("invalid_url");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new UnsafeUrlError("invalid_url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("unsupported_scheme", url.protocol);
  }
  if (url.username || url.password) throw new UnsafeUrlError("credentials_in_url");
  // `URL` drops the port when it is the scheme's default, so any value left is non-default.
  if (url.port && !options.allowAnyPort) throw new UnsafeUrlError("non_default_port", url.port);

  // WHATWG URL parsing has already normalised exotic IPv4 spellings
  // (decimal, octal, hex) into dotted form by this point.
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError("private_address", host);
  } else {
    if (!host.includes(".") || host.endsWith(".")) throw new UnsafeUrlError("private_host", host);
    if (host === "localhost" || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      throw new UnsafeUrlError("private_host", host);
    }
  }

  url.hash = "";
  return url;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/**
 * Drop-in replacement for `dns.lookup` that fails the connection if any
 * address the name resolves to is not public. Rejecting on *any* private
 * record (not just the first) closes the trick of mixing a public and a
 * private A record.
 */
export function guardedLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
): void {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const list = addresses as dns.LookupAddress[];
    const unsafe = list.find((entry) => !isPublicAddress(entry.address));
    if (unsafe || list.length === 0) {
      const rejection: NodeJS.ErrnoException = new UnsafeUrlError(
        "private_address",
        unsafe ? `${hostname} resolves to ${unsafe.address}` : `${hostname} did not resolve`,
      );
      rejection.code = "EUNSAFEADDRESS";
      return callback(rejection, []);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}
