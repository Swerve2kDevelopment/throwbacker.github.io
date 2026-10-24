import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";

type TeamCardTeam = {
  id: string;
  slug: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  region: string | null;
  currentPlayers?: { id: string; displayName: string; slug: string }[];
  tournamentTeams?: { id: string; finalPlacement: number | null }[];
  matchWins?: { id: string }[];
};

export function TeamCard({ team }: { team: TeamCardTeam }) {
  const wins = team.tournamentTeams?.filter((entry) => entry.finalPlacement === 1).length ?? 0;

  return (
    <article className="panel panel-hover flex h-full flex-col p-4">
      <div className="flex items-start gap-3">
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={team.logoUrl} className="h-14 w-14 rounded-lg border border-metal-line bg-metal-row object-contain p-1" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-metal-line bg-metal-panel2 text-lg font-black">
            {team.tag || team.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <Link href={`/teams/${team.slug}`} className="text-lg font-black text-metal-text hover:text-metal-accent">
            {team.name}
          </Link>
          <p className="text-sm font-bold text-metal-muted">{team.tag || "No tag"} {team.region ? `- ${team.region}` : ""}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="subtle-panel p-3">
          <p className="label">Tournaments</p>
          <p className="mt-1 text-xl font-black">{team.tournamentTeams?.length ?? 0}</p>
        </div>
        <div className="subtle-panel p-3">
          <p className="label">Wins</p>
          <p className="mt-1 text-xl font-black">{wins}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="label mb-2">Current roster</p>
        {team.currentPlayers?.length ? (
          <div className="flex flex-wrap gap-2">
            {team.currentPlayers.map((player) => (
              <Link key={player.id} href={`/players/${player.slug}`} className="rounded-md border border-metal-line bg-metal-row px-2 py-1 text-sm font-bold hover:border-metal-accent">
                {player.displayName}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState message="No current roster set." />
        )}
      </div>
    </article>
  );
}
