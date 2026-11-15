import Link from "next/link";
import { connection } from "next/server";
import { AccountMenu } from "@/components/account-menu";
import { es } from "@/i18n/es";
import { systemDb } from "@/db/client";
import { countPendingAccessRequests, isAdmin } from "@/lib/access-requests";
import { getAccessOrSetup } from "@/lib/auth/session";

const link = "text-sm font-medium underline-offset-4 hover:underline";

/** The header's links: a way in for visitors, the workspace for everyone else. */
export async function HeaderNav() {
  await connection();
  const access = await getAccessOrSetup();
  if (access.kind === "signed_out") {
    return (
      <nav className="flex items-center gap-5">
        <Link href="/auth/sign-in" className={link}>
          {es.auth.signIn}
        </Link>
      </nav>
    );
  }
  const admin = access.kind === "ok" && isAdmin(access.email);
  // New requests have no other notice, so the admin sees the count on every page.
  const waiting = admin ? await countPendingAccessRequests(systemDb()) : 0;
  return (
    <nav className="flex items-center gap-5">
      <Link href="/" className={link}>
        {es.app.brands}
      </Link>
      {admin && (
        <Link href="/admin/solicitudes" className={link}>
          {es.app.requests}
          {waiting > 0 && ` (${waiting})`}
        </Link>
      )}
      <AccountMenu />
    </nav>
  );
}
