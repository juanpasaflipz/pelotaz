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
  const name = process.env.DATABASE_URL_MIGRATIONS ? "DATABASE_URL_MIGRATIONS" : "DATABASE_URL";
  const url = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  if (!url) {
    console.error("Set DATABASE_URL (or DATABASE_URL_MIGRATIONS) in .env.local first.");
    process.exit(1);
  }
  // Without this the driver fails later with an unrelated-looking DNS error.
  // The value is a secret, so describe the problem without printing it.
  if (!/^postgres(ql)?:\/\/[^\s]+@[^\s]+\/[^\s]+$/.test(url)) {
    console.error(
      `${name} in .env.local is not a Postgres connection string. It must be one line that starts with ` +
        '"postgresql://" and looks like postgresql://user:password@host/database?sslmode=require. ' +
        'In the Neon Console, use Connect and copy only the URL, without "psql" or quotes around it.',
    );
    process.exit(1);
  }
  return url;
}
