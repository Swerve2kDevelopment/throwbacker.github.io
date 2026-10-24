type LogoTeam = { name: string; logoUrl?: string | null; tag?: string | null } | null | undefined;

/**
 * Logo for a registered team. Custom side names (no Team record) render
 * nothing, so a made-up "Red Side" never borrows someone else's badge.
 */
export function TeamLogo({ team, className = "team-logo" }: { team: LogoTeam; className?: string }) {
  if (!team?.logoUrl) return null;

  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={`${team.name} logo`} src={team.logoUrl} loading="lazy" />
    </span>
  );
}
