import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthButton } from "@/components/ui/AuthButton";
import { getAuthSession } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login"
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getAuthSession();
  if (session?.user) {
    redirect(resolvedSearchParams.callbackUrl || "/account");
  }

  return (
    <main className="page-shell">
      <section className="mx-auto max-w-xl panel p-6">
        <p className="label text-metal-accent">Account verification</p>
        <h1 className="mt-1 text-3xl font-black">Sign in with Discord</h1>
        <p className="mt-3 text-metal-muted">
          Your account uses Discord OAuth and keeps you signed in with a server-side session. Public browsing stays open without logging in.
        </p>
        <div className="mt-5">
          <AuthButton signedIn={false} callbackUrl={resolvedSearchParams.callbackUrl || "/account"} />
        </div>
      </section>
    </main>
  );
}
