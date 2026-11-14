import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ResetWithToken } from "@/components/reset-password";
import { es } from "@/i18n/es";

export const metadata: Metadata = { title: es.auth.resetTitle };

/** Landing page for an emailed reset link (`?token=`). Without a token, start over. */
export default function ResetPasswordPage({ searchParams }: PageProps<"/auth/restablecer">) {
  return (
    <main className="wall min-h-[70dvh]">
      <div className="mx-auto max-w-4xl px-5 pb-14 pt-10">
        <h1 className="display text-5xl sm:text-6xl">{es.auth.resetTitle}</h1>
        <Suspense fallback={null}>
          <TokenForm searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function TokenForm({ searchParams }: Pick<PageProps<"/auth/restablecer">, "searchParams">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) redirect("/auth/olvide");
  return <ResetWithToken token={token} />;
}
