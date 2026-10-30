import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getAuthSession } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "oscl_widget_state";

function siteOrigin(request: Request) {
  return (process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
}

/**
 * Starts the one-time Discord consent for the profile stats widget. Kept apart
 * from sign-in so the extra scope can never get in the way of logging in.
 */
export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const session = await getAuthSession();
  if (!session?.user?.discordId) {
    return NextResponse.redirect(`${origin}/login?callbackUrl=/account`);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(`${origin}/account?widget=not-configured`);

  const state = randomBytes(24).toString("hex");
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", `${origin}/api/discord/widget/callback`);
  authorize.searchParams.set("scope", "identify application_identities.write");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "consent");

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: origin.startsWith("https://"), sameSite: "lax", path: "/api/discord/widget", maxAge: 600 });
  return response;
}
