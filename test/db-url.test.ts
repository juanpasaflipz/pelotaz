import { describe, expect, it } from "vitest";
import { withVerifiedSsl } from "@/db/url";

describe("database URL", () => {
  const base = "postgresql://u:p@ep-x-pooler.c-8.us-east-2.aws.neon.tech/neondb";

  it("names verify-full where pg already applies it", () => {
    expect(withVerifiedSsl(`${base}?sslmode=require&channel_binding=require`)).toBe(
      `${base}?sslmode=verify-full&channel_binding=require`,
    );
    expect(withVerifiedSsl(`${base}?channel_binding=require&sslmode=prefer`)).toBe(
      `${base}?channel_binding=require&sslmode=verify-full`,
    );
  });

  it("leaves other modes and URLs without sslmode alone", () => {
    for (const url of [`${base}?sslmode=disable`, `${base}?sslmode=no-verify`, `${base}?sslmode=verify-full`, base]) {
      expect(withVerifiedSsl(url)).toBe(url);
    }
  });
});
