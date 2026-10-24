import Link from "next/link";

import { avatarFallback } from "@/lib/format";

type AvatarPlayer = { displayName: string; avatarUrl?: string | null };

export function Avatar({ player, size = "md" }: { player: AvatarPlayer; size?: "md" | "lg" }) {
  return (
    <span className={size === "lg" ? "avatar avatar-lg" : "avatar"}>
      {avatarFallback(player.displayName)}
      {player.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={player.avatarUrl} loading="lazy" />
      ) : null}
    </span>
  );
}

/** Avatar + username, with the real name underneath when one is set. */
export function PlayerCell({
  player,
  href,
  subtitle
}: {
  player: AvatarPlayer & { slug: string; realName?: string | null };
  href?: string | null;
  subtitle?: string | null;
}) {
  const body = (
    <>
      <Avatar player={player} />
      <span className="min-w-0">
        <strong>{player.displayName}</strong>
        {player.realName || subtitle ? <em>{player.realName || subtitle}</em> : null}
      </span>
    </>
  );

  if (href === null) return <span className="player-cell">{body}</span>;
  return (
    <Link href={href || `/players/${player.slug}`} className="player-cell">
      {body}
    </Link>
  );
}
