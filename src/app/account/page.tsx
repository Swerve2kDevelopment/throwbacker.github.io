import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthButton } from "@/components/ui/AuthButton";
import { getAuthSession } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { RECRUITMENT_ROLES } from "@/lib/validators";
import {
  benchPlayerAction,
  closeRecruitmentPostAction,
  createRecruitmentPostAction,
  releasePlayerAction,
  respondTransferRequestAction,
  sendTransferRequestAction
} from "@/lib/viewer-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account"
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ admin?: string; transfer?: string; recruit?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login?callbackUrl=/account");

  const [user, managedTeams, signablePlayers, incomingRequests] = await Promise.all([
    prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      favoritePlayers: {
        include: {
          player: {
            include: { currentTeam: true }
          }
        },
        orderBy: { createdAt: "desc" }
      },
      favoriteTournaments: {
        include: { tournament: true },
        orderBy: { createdAt: "desc" }
      }
    }
    }),
    session.user.discordId
      ? prisma.teamManager.findMany({
          where: { discordId: session.user.discordId },
          include: {
            team: {
              include: {
                currentPlayers: { orderBy: { displayName: "asc" } },
                transferRequests: {
                  where: { status: "PENDING" },
                  include: { player: true },
                  orderBy: { createdAt: "desc" },
                  take: 8
                },
                recruitmentPosts: {
                  where: { closedAt: null },
                  orderBy: { createdAt: "desc" }
                }
              }
            }
          },
          orderBy: { createdAt: "asc" }
        })
      : [],
    prisma.player.findMany({
      where: { discordId: { not: null } },
      include: { currentTeam: true },
      orderBy: { displayName: "asc" }
    }),
    session.user.discordId
      ? prisma.transferRequest.findMany({
          where: {
            status: "PENDING",
            player: { discordId: session.user.discordId }
          },
          include: {
            team: true,
            player: true,
            requestedBy: true
          },
          orderBy: { createdAt: "desc" }
        })
      : []
  ]);

  return (
    <main className="page-shell">
      {resolvedSearchParams.admin === "denied" ? (
        <div className="mb-4 border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-100">
          Your Discord account is signed in, but it has not been approved for admin access.
        </div>
      ) : null}
      {resolvedSearchParams.recruit ? (
        <div className="notice-banner">
          {{
            posted: "Recruitment post published and announced on Discord.",
            "posted-not-announced": "Recruitment post published. It wasn't announced on Discord (no webhook set, or Discord rejected it).",
            "already-open": "You already have an open post for that role. Close it first to post again.",
            closed: "Recruitment post closed."
          }[resolvedSearchParams.recruit] || `Recruitment: ${decodeURIComponent(resolvedSearchParams.recruit)}`}
        </div>
      ) : null}
      {resolvedSearchParams.transfer ? (
        <div className="mb-4 border border-metal-line bg-metal-panel2 p-3 text-sm font-bold text-metal-muted">
          Transfer status: {resolvedSearchParams.transfer.replace(/-/g, " ")}.
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="panel h-fit overflow-hidden">
          <div className="bg-metal-head px-4 py-3 text-center text-xl font-black">Discord Account</div>
          {session.user.avatar || session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={session.user.avatar || session.user.image || ""} className="h-64 w-full object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center bg-metal-row text-4xl font-black">DC</div>
          )}
          <div className="space-y-3 p-4">
            <div>
              <p className="label">Display name</p>
              <p className="font-black">{session.user.name || session.user.username}</p>
            </div>
            <div>
              <p className="label">Discord ID</p>
              <p className="break-all font-mono text-sm text-metal-muted">{session.user.discordId || "Not available"}</p>
            </div>
            <div>
              <p className="label">Access</p>
              <p className="font-black">{session.user.isAdmin ? "Admin" : "Viewer"}</p>
            </div>
            <AuthButton signedIn />
          </div>
        </aside>

        <div className="space-y-6">
          {incomingRequests.length ? (
            <section className="panel p-4">
              <p className="label text-metal-accent">Transfer notifications</p>
              <h2 className="mt-1 text-2xl font-black">Pending Sign Requests</h2>
              <div className="mt-4 grid gap-3">
                {incomingRequests.map((request) => (
                  <div key={request.id} className="subtle-panel p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-black">
                          {request.team.name} wants to sign {request.player.displayName}
                        </p>
                        <p className="mt-1 text-sm text-metal-muted">
                          Requested by {request.requestedBy?.name || request.requestedBy?.username || "team manager"} on {request.createdAt.toLocaleDateString("en-GB")}
                        </p>
                        {request.note ? <p className="mt-2 text-sm font-semibold text-metal-text">{request.note}</p> : null}
                      </div>
                      <div className="flex gap-2">
                        <form action={respondTransferRequestAction.bind(null, request.id, "accept")}>
                          <button className="button button-primary" type="submit">Accept</button>
                        </form>
                        <form action={respondTransferRequestAction.bind(null, request.id, "decline")}>
                          <button className="button" type="submit">Decline</button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {managedTeams.length ? (
            <section className="panel p-4">
              <p className="label text-metal-accent">Team manager tools</p>
              <h2 className="mt-1 text-2xl font-black">Managed Teams</h2>
              <div className="mt-4 grid gap-5">
                {managedTeams.map(({ team }) => (
                  <div key={team.id} className="subtle-panel p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <Link href={`/teams/${team.slug}`} className="text-xl font-black hover:text-metal-accent">{team.name}</Link>
                        <p className="mt-1 text-sm font-semibold text-metal-muted">{team.currentPlayers.length} active player{team.currentPlayers.length === 1 ? "" : "s"}</p>
                      </div>
                      <form action={sendTransferRequestAction.bind(null, team.id)} className="grid gap-2 md:min-w-[320px]">
                        <select className="input" name="playerId" required defaultValue="">
                          <option value="">Choose player to sign</option>
                          {signablePlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.displayName}{player.currentTeam ? ` - currently ${player.currentTeam.name}` : " - free agent"}
                            </option>
                          ))}
                        </select>
                        <input className="input" name="note" placeholder="Optional note to player" />
                        <button className="button button-primary" type="submit">Send sign request</button>
                      </form>
                    </div>

                    <div className="mt-4 table-scroll">
                      <table className="wiki-table">
                        <thead>
                          <tr>
                            <th>Current Player</th>
                            <th>Status</th>
                            <th className="numeric">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {team.currentPlayers.length ? (
                            team.currentPlayers.map((player) => (
                              <tr key={player.id}>
                                <td>
                                  <Link href={`/players/${player.slug}`} className="font-black hover:text-metal-accent">{player.displayName}</Link>
                                </td>
                                <td>{player.status || "Active"}</td>
                                <td>
                                  <div className="flex justify-end gap-2">
                                    <form action={benchPlayerAction.bind(null, team.id, player.id)}>
                                      <button className="button" type="submit">Bench</button>
                                    </form>
                                    <form action={releasePlayerAction.bind(null, team.id, player.id)}>
                                      <button className="button button-danger" type="submit">Release</button>
                                    </form>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="text-metal-muted">No current players.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="form-section mt-4">
                      <h3>Looking for a player</h3>
                      <form action={createRecruitmentPostAction.bind(null, team.id)} className="grid gap-2 md:grid-cols-[200px_1fr_auto] md:items-end">
                        <label className="grid gap-1">
                          <span className="label">Role</span>
                          <select className="input" name="role" defaultValue="">
                            <option value="">Any role</option>
                            {RECRUITMENT_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className="label">Note (optional, public)</span>
                          <input className="input" name="note" maxLength={400} placeholder="e.g. EU evenings, 5v5 league nights, DM the manager" />
                        </label>
                        <button className="button button-primary" type="submit">
                          Post &amp; announce
                        </button>
                      </form>
                      <span className="form-hint">Shows on your team page and the Teams page, and posts to the league Discord.</span>
                      {team.recruitmentPosts.length ? (
                        <div className="grid gap-2">
                          {team.recruitmentPosts.map((post) => (
                            <div key={post.id} className="feed-row" style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
                              <span>
                                Looking for: {post.role || "Any role"}
                                {post.note ? <span className="ml-2 font-semibold text-metal-muted">{post.note}</span> : null}
                              </span>
                              <em>{post.createdAt.toLocaleDateString("en-GB")}</em>
                              <form action={closeRecruitmentPostAction.bind(null, post.id)}>
                                <button className="button" type="submit">
                                  Close
                                </button>
                              </form>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {team.transferRequests.length ? (
                      <div className="mt-4">
                        <p className="label mb-2">Pending outgoing requests</p>
                        <div className="flex flex-wrap gap-2">
                          {team.transferRequests.map((request) => (
                            <span key={request.id} className="border border-metal-line bg-metal-row px-2 py-1 text-sm font-bold">
                              {request.player.displayName}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <p className="label text-metal-accent">Viewer features</p>
            <h1 className="mt-1 text-3xl font-black">Your Watchlist</h1>
            <p className="mt-2 text-metal-muted">
              Logged-in viewers can keep a personal watchlist of players and tournaments. Admin approval is separate from normal Discord login.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-black">Favorite Players</h2>
            <div className="table-scroll">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {user?.favoritePlayers.length ? (
                    user.favoritePlayers.map((favorite) => (
                      <tr key={favorite.id}>
                        <td>
                          <Link href={`/players/${favorite.player.slug}`} className="font-black hover:text-metal-accent">
                            {favorite.player.displayName}
                          </Link>
                        </td>
                        <td>{favorite.player.currentTeam?.name || "Free agent"}</td>
                        <td>{favorite.createdAt.toLocaleDateString("en-GB")}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-metal-muted">
                        No favorite players yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-black">Favorite Tournaments</h2>
            <div className="table-scroll">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>Tournament</th>
                    <th>Status</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {user?.favoriteTournaments.length ? (
                    user.favoriteTournaments.map((favorite) => (
                      <tr key={favorite.id}>
                        <td>
                          <Link href={`/tournaments/${favorite.tournament.slug}`} className="font-black hover:text-metal-accent">
                            {favorite.tournament.name}
                          </Link>
                        </td>
                        <td>{favorite.tournament.status}</td>
                        <td>{favorite.createdAt.toLocaleDateString("en-GB")}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-metal-muted">
                        No favorite tournaments yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
