import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { es } from "@/i18n/es";

export const metadata: Metadata = { title: es.auth.signIn };

export default function Page({ searchParams }: PageProps<"/auth/sign-in">) {
  return (
    <main className="wall min-h-[70dvh]">
      <div className="mx-auto max-w-4xl px-5 pb-14 pt-10">
        <h1 className="display text-5xl sm:text-6xl">{es.auth.signInTitle}</h1>
        <Suspense fallback={null}>
          <ResetNotice searchParams={searchParams} />
        </Suspense>
        <AuthForm mode="sign-in" />
      </div>
    </main>
  );
}

/** After a password reset, say so above the form. */
async function ResetNotice({ searchParams }: Pick<PageProps<"/auth/sign-in">, "searchParams">) {
  const { restablecida } = await searchParams;
  return restablecida ? (
    <p role="status" className="mt-6 max-w-md rounded bg-raya px-3 py-2 font-medium text-cancha">
      {es.auth.resetDone}
    </p>
  ) : null;
}
