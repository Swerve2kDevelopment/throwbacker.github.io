import Link from "next/link";

import { AdminForm, AdminStatusBanner } from "@/components/admin/AdminForm";
import { HostKeyCreator } from "@/components/admin/HostKeyCreator";
import { rejectSubmissionAction, revokeHostKeyAction } from "@/lib/admin-actions";
import { absoluteSiteUrl } from "@/lib/site-settings";
import { assertAdminUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const examplePayload = `{
  "build": "Y2S4",
  "teamA": { "name": "Kanine APEXIS" },
  "teamB": { "name": "Night Owls" },
  "maps": [
    {
      "name": "Bank",
      "scoreA": 7,
      "scoreB": 5,
      "players": [
        { "name": "Fancy", "side": "A", "kills": 11, "deaths": 6, "assists": 3, "headshots": 7, "plants": 2, "rounds": 12 }
      ]
    }
  ]
}`;

export default async function AdminUploadsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await assertAdminUser();
  const resolvedSearchParams = await searchParams;

  const [pending, recent, keys] = await Promise.all([
    prisma.statsSubmission.findMany({ where: { status: "PENDING" }, include: { hostKey: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.statsSubmission.findMany({ where: { status: { not: "PENDING" } }, include: { hostKey: true }, orderBy: { reviewedAt: "desc" }, take: 15 }),
    prisma.hostApiKey.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { submissions: true } } } })
  ]);
  const endpoint = absoluteSiteUrl("/api/ingest/match") || "/api/ingest/match";

  return (
    <div className="grid gap-5">
      <AdminStatusBanner searchParams={resolvedSearchParams} />

      <AdminForm title="Tracker uploads" description="Scoreboards sent by hosts' in-game trackers. Nothing goes live until you review and save it.">
        {pending.length ? (
          <div className="table-scroll">
            <table className="wiki-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Host</th>
                  <th>Match</th>
                  <th className="numeric">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((submission) => (
                  <tr key={submission.id}>
                    <td>{submission.createdAt.toLocaleString("en-GB")}</td>
                    <td>{submission.hostKey?.label || "Deleted key"}</td>
                    <td>{submission.summary}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Link className="button button-primary" href={`/admin/matches?submission=${submission.id}`}>
                          Review
                        </Link>
                        <form action={rejectSubmissionAction.bind(null, submission.id)}>
                          <button className="button" type="submit">
                            Reject
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-metal-muted">No uploads waiting.</p>
        )}

        {recent.length ? (
          <details className="mt-3">
            <summary className="cursor-pointer font-bold">Recently reviewed</summary>
            <ul className="mt-2 grid gap-1 text-sm">
              {recent.map((submission) => (
                <li key={submission.id}>
                  <strong>{submission.status === "IMPORTED" ? "Imported" : "Rejected"}</strong> · {submission.summary} · {submission.hostKey?.label || "Deleted key"}
                  {submission.matchId ? (
                    <>
                      {" "}
                      · <Link href={`/matches/${submission.matchId}`}>view match</Link>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </AdminForm>

      <AdminForm title="Host keys" description="Give a key only to trusted hosts. Their tracker sends it with each upload. Revoke a key if it leaks.">
        <HostKeyCreator />
        <div className="table-scroll mt-3">
          <table className="wiki-table">
            <thead>
              <tr>
                <th>Host</th>
                <th>Key</th>
                <th className="numeric">Uploads</th>
                <th>Last used</th>
                <th className="numeric">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.length ? (
                keys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.label}</td>
                    <td>
                      <code>{key.keyPrefix}…</code>
                    </td>
                    <td className="numeric">{key._count.submissions}</td>
                    <td>{key.lastUsedAt?.toLocaleString("en-GB") || "Never"}</td>
                    <td>
                      <div className="flex justify-end">
                        {key.revokedAt ? (
                          <span className="text-metal-muted">Revoked</span>
                        ) : (
                          <form action={revokeHostKeyAction.bind(null, key.id)}>
                            <button className="button" type="submit">
                              Revoke
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-metal-muted">
                    No host keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminForm>

      <AdminForm title="Tracker API" description="What the in-game tracker sends.">
        <div className="grid gap-2 text-sm">
          <p>
            <code>POST {endpoint}</code> with the header <code>Authorization: Bearer &lt;host key&gt;</code> and a JSON body.{" "}
            <code>GET</code> on the same address checks a key.
          </p>
          <p>
            <code>side</code> is <code>A</code> or <code>B</code>. Players are matched by their in-game name, then display name, Discord username and aliases. Up to 7
            maps and 16 players per map; 30 uploads per key per hour.
          </p>
          <pre className="overflow-x-auto rounded-md border border-metal-line bg-black/40 p-3 text-xs">{examplePayload}</pre>
        </div>
      </AdminForm>
    </div>
  );
}
