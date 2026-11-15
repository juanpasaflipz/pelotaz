/**
 * Vercel runs this before `next build` (see vercel.json). Only production deploys migrate:
 * preview builds can carry the same DATABASE_URL, and an unmerged branch must never change
 * the production schema. A failed migration fails the build, so new code never goes live
 * against a database that lacks its columns.
 */
if (process.env.VERCEL_ENV === "production") {
  import("./migrate");
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
}
