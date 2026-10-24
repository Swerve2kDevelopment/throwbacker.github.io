import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthButton } from "@/components/ui/AuthButton";
import { getAuthSession } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Login"
};

// NextAuth sends failed sign-ins back here with ?error=<code>.
const errorMessages: Record<string, string> = {
  OAuthCallback: "Discord sent you back, but the site couldn't finish signing you in. Usually the Discord client ID or secret on the server is wrong.",
  OAuthSignin: "Couldn't start the Discord sign-in. Check the Discord client ID on the server.",
  OAuthCreateAccount: "Discord accepted you, but the site couldn't create your account in the database.",
  Callback: "Something failed while saving your sign-in. Check the server logs for details.",
  OAuthAccountNotLinked: "That email is already linked to a different sign-in. Ask an admin to link your accounts.",
  AccessDenied: "Sign-in was cancelled or denied.",
  Configuration: "The site's sign-in settings are incomplete (NEXTAUTH_SECRET or NEXTAUTH_URL)."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getAuthSession();
  if (session?.user) {
    redirect(resolvedSearchParams.callbackUrl || "/account");
  }

  const error = resolvedSearchParams.error;

  return (
    <main className="page-shell">
      <section className="mx-auto max-w-xl panel p-6">
        <p className="eyebrow">Account</p>
        <h1 className="mt-1 text-3xl font-black">Sign in with Discord</h1>
        <p className="mt-3 text-metal-muted">Signing in lets you follow players, answer transfer requests and, for staff, open the admin panel. Browsing stays open without an account.</p>
        {error ? (
          <div className="mt-4 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm font-semibold text-red-100">
            {errorMessages[error] || "Sign-in failed."} <span className="text-red-300">(code: {error})</span>
          </div>
        ) : null}
        <div className="mt-5">
          <AuthButton signedIn={false} callbackUrl={resolvedSearchParams.callbackUrl || "/account"} />
        </div>
      </section>
    </main>
  );
}
