import Link from "next/link";
import { MatchKind } from "@prisma/client";

import { TeamLogo } from "@/components/ui/TeamLogo";
import { formatDateTime, statusLabel } from "@/lib/format";
import { getMatchSideName, getMatchTitle } from "@/lib/match-utils";

type MatchCardMatch = {
  id: string;
  title?: string | null;
  customTeamAName?: string | null;
  customTeamBName?: string | null;
  format?: number;
  scoreA: number;
  scoreB: number;
  matchKind?: string;
  winnerSide?: string | null;
  status: string;
  playedAt: Date | null;
  teamA?: { name: string; slug: string; tag: string | null; logoUrl: string | null } | null;
  teamB?: { name: string; slug: string; tag: string | null; logoUrl: string | null } | null;
  tournament?: { name: string; slug: string } | null;
  league?: { name: string; slug: string; shortName: string | null; themeColor: string | null } | null;
  maps?: { id: string; mapName?: string }[];
  participants?: { id: string; side: string }[];
};

export function MatchCard({ match }: { match: MatchCardMatch }) {
  const league = match.matchKind === MatchKind.LEAGUE ? match.league : null;
  const sides = [
    { key: "A", name: getMatchSideName(match, "A"), team: match.teamA, score: match.scoreA },
    { key: "B", name: getMatchSideName(match, "B"), team: match.teamB, score: match.scoreB }
  ];
  const mapNames = match.maps?.map((map) => map.mapName).filter(Boolean) || [];

  return (
    <Link href={`/matches/${match.id}`} className="result-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {league ? <span className="league-pill">{league.shortName || league.name}</span> : match.matchKind === MatchKind.LEAGUE ? <span className="league-pill">League</span> : <span className="fun-pill">Fun</span>}
          <span className={`status-pill status-${match.status.toLowerCase()}`}>{statusLabel(match.status)}</span>
        </div>
        <span className="label">{formatDateTime(match.playedAt)}</span>
      </div>

      <div className="result-score">
        {sides.map((side, index) => (
          <div key={side.key} className={`result-side${match.winnerSide === side.key ? " is-winner" : ""}`} style={index === 1 ? { order: 3 } : undefined}>
            <TeamLogo team={side.team} />
            <span>{side.name}</span>
          </div>
        ))}
        <div className="result-numbers" style={{ order: 2, fontSize: "1.5rem" }}>
          {match.winnerSide === "A" ? <b>{match.scoreA}</b> : match.scoreA}
          <span className="mx-2 text-metal-muted">-</span>
          {match.winnerSide === "B" ? <b>{match.scoreB}</b> : match.scoreB}
        </div>
      </div>

      <div className="result-meta">
        {match.title ? <span className="text-metal-text">{getMatchTitle(match)}</span> : null}
        <span>{match.tournament?.name || "Standalone"}</span>
        <span>
          {match.format || 5}v{match.format || 5}
        </span>
        <span>{mapNames.length ? mapNames.join(", ") : `${match.maps?.length ?? 0} maps`}</span>
      </div>
    </Link>
  );
}
