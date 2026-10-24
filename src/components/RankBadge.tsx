import type { PlayerRank } from "@/lib/ranks";

export function RankBadge({ rank, compact = false }: { rank: PlayerRank; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 align-middle" title={`${rank.name} - ${rank.mmr} MMR`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={rank.image} className={compact ? "h-6 w-6 object-contain" : "h-9 w-9 object-contain"} />
      <span className={compact ? "text-xs font-black" : "font-black"} style={{ color: rank.color }}>
        {rank.name}
      </span>
      {!compact ? <span className="numeric text-sm font-bold text-metal-muted">{rank.mmr} MMR</span> : null}
    </span>
  );
}
