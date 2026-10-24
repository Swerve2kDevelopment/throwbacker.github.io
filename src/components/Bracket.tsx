import Link from "next/link";

import type { MatchView, SlotView, StageView } from "@/lib/bracket";

function Slot({ slot }: { slot: SlotView }) {
  return (
    <div className={`bracket-slot${slot.isWinner ? " is-winner" : ""}${slot.isPlaceholder ? " is-tbd" : ""}`}>
      <span className="text-[11px] font-black text-metal-muted">{slot.seed ?? ""}</span>
      <strong title={slot.label}>{slot.label}</strong>
      <em>{slot.score ?? ""}</em>
    </div>
  );
}

function BracketMatch({ match }: { match: MatchView }) {
  const body = (
    <>
      <span>
        {match.label}
        {match.status === "LIVE" ? <b className="ml-2 text-metal-accent">LIVE</b> : null}
      </span>
      <Slot slot={match.top} />
      <Slot slot={match.bottom} />
    </>
  );

  return match.matchId ? (
    <Link href={`/matches/${match.matchId}`} className="bracket-match">
      {body}
    </Link>
  ) : (
    <div className="bracket-match">{body}</div>
  );
}

export function Bracket({ stages }: { stages: StageView[] }) {
  return (
    <div>
      {stages.map((stage) => (
        <div key={stage.key} className="bracket-stage">
          {stages.length > 1 ? <h3>{stage.title}</h3> : null}
          <div className="bracket-board">
            {stage.rounds.map((round) => (
              <div key={round.name} className="bracket-round">
                <h4>{round.name}</h4>
                <div className="bracket-round-matches">
                  {round.matches.map((match) => (
                    <BracketMatch key={match.key} match={match} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
