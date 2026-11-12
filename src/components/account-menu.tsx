import { signOut } from "@/app/auth/actions";
import { es } from "@/i18n/es";
import { isNeonAuthConfigured } from "@/lib/auth/neon";
import { getAccessOrSetup } from "@/lib/auth/session";

/** Who is signed in, and the way out. Renders nothing in dev mode or when signed out. */
export async function AccountMenu() {
  if (!isNeonAuthConfigured()) return null;
  const access = await getAccessOrSetup();
  if (access.kind === "setup" || access.kind === "signed_out") return null;
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-[16rem] truncate opacity-85 sm:inline">{access.email}</span>
      <button type="submit" className="font-medium underline-offset-4 hover:underline">
        {es.auth.signOut}
      </button>
    </form>
  );
}
