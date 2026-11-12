import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only `migrate`, `push` and `studio` connect. `generate` works offline.
    url: process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL ?? "",
  },
});
