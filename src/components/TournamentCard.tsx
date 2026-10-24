import Link from "next/link";

import { formatDate, statusLabel } from "@/lib/format";

type TournamentCardTournament = {
  id: string;
  slug: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  prizePool: string | null;
  logoUrl: string | null;
  tournamentTeams?: { id: string; finalPlacement: number | null; team: { name: string; slug: string } }[];
};

export function TournamentCard({ tournament }: { tournament: TournamentCardTournament }) {
  const winner = tournament.tournamentTeams?.find((entry) => entry.finalPlacement === 1)?.team;

  return (
    <article className="panel panel-hover p-4">
      <div className="flex items-start gap-3">
        {tournament.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={tournament.logoUrl} className="h-12 w-12 rounded-lg border border-metal-line object-contain" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-metal-line bg-metal-panel2 text-sm font-black text-metal-accent">T</div>
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/tournaments/${tournament.slug}`} className="text-lg font-black text-metal-text hover:text-metal-accent">
            {tournament.name}
          </Link>
          <p className="mt-1 text-sm text-metal-muted">
            {formatDate(tournament.startDate)} {tournament.endDate ? `- ${formatDate(tournament.endDate)}` : ""}
          </p>
        </div>
        <span className={`status-pill status-${tournament.status.toLowerCase()}`}>{statusLabel(tournament.status)}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="subtle-panel p-3">
          <p className="label">Prize</p>
          <p className="mt-1 font-black">{tournament.prizePool || "-"}</p>
        </div>
        <div className="subtle-panel p-3">
          <p className="label">Teams</p>
          <p className="mt-1 font-black">{tournament.tournamentTeams?.length ?? 0}</p>
        </div>
        <div className="subtle-panel p-3">
          <p className="label">Winner</p>
          <p className="mt-1 truncate font-black">{winner ? winner.name : "-"}</p>
        </div>
      </div>
    </article>
  );
}
