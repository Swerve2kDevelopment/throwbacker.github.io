import { NextResponse } from "next/server";

import { pushPlayerWidget } from "@/lib/discord-widget";
import { getAuthSession } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "oscl_widget_state";

function siteOrigin(request: Request) {
  return (process.env.NEXTAUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request) {
  const origin = siteOrigin(request);
  const url = new URL(request.url);
  const back = (status: string) => {
    const response = NextResponse.redirect(`${origin}/account?widget=${encodeURIComponent(status)}`);
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/discord/widget" });
    return response;
  };

  if (url.searchParams.get("error")) return back("cancelled");

  const state = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);
  const code = url.searchParams.get("code");
  if (!code || !state || state !== cookieState) return back("expired");

  const session = await getAuthSession();
  if (!session?.user?.discordId) return back("signed-out");

  // Swap the code for a token only to confirm which Discord account consented.
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${origin}/api/discord/widget/callback`,
      client_id: process.env.DISCORD_CLIENT_ID || "",
      client_secret: process.env.DISCORD_CLIENT_SECRET || ""
    })
  });
  if (!tokenResponse.ok) return back("discord-rejected");
  const token = (await tokenResponse.json()) as { access_token?: string; scope?: string };
  if (!token.access_token || !token.scope?.includes("application_identities.write")) return back("scope-missing");

  const meResponse = await fetch("https://discord.com/api/v10/users/@me", { headers: { authorization: `Bearer ${token.access_token}` } });
  const me = (await meResponse.json().catch(() => ({}))) as { id?: string };
  if (!me.id || me.id !== session.user.discordId) return back("wrong-account");

  const player = await prisma.player.findFirst({ where: { discordId: me.id }, select: { id: true } });
  if (!player) return back("no-player");

  await prisma.player.update({ where: { id: player.id }, data: { discordWidgetLinkedAt: new Date() } });
  const result = await pushPlayerWidget(player.id);
  return back(result.ok ? "linked" : `linked-sync-failed-${result.status}`);
}
