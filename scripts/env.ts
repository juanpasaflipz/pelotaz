/** Load .env.local for scripts run outside Next.js. Missing file is fine (CI sets real env vars). */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Not present.
    }
  }
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (or DATABASE_URL_MIGRATIONS) in .env.local first.");
    process.exit(1);
  }
  return url;
}
