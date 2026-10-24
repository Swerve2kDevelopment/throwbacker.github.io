import { MatchKind, MatchStatus, PrismaClient, TournamentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const avatars = {
  ember: "https://api.dicebear.com/9.x/identicon/svg?seed=Ember",
  rivet: "https://api.dicebear.com/9.x/identicon/svg?seed=Rivet",
  ashline: "https://api.dicebear.com/9.x/identicon/svg?seed=Ashline",
  torque: "https://api.dicebear.com/9.x/identicon/svg?seed=Torque",
  flux: "https://api.dicebear.com/9.x/identicon/svg?seed=Flux",
  cinder: "https://api.dicebear.com/9.x/identicon/svg?seed=Cinder",
  slate: "https://api.dicebear.com/9.x/identicon/svg?seed=Slate",
  vex: "https://api.dicebear.com/9.x/identicon/svg?seed=Vex",
  bolt: "https://api.dicebear.com/9.x/identicon/svg?seed=Bolt",
  quench: "https://api.dicebear.com/9.x/identicon/svg?seed=Quench"
};

async function main() {
  await prisma.favoriteTournament.deleteMany();
  await prisma.favoritePlayer.deleteMany();
  await prisma.playerMapStats.deleteMany();
  await prisma.mapGame.deleteMany();
  await prisma.match.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.adminUser.deleteMany();

  const oscl = await prisma.league.upsert({
    where: { slug: "oscl" },
    create: {
      slug: "oscl",
      name: "Old Siege Challengers League",
      shortName: "OSCL",
      logoUrl: "/league-logos/OSCL.png",
      themeColor: "#b6ff2e",
      description: null
    },
    update: {
      name: "Old Siege Challengers League",
      shortName: "OSCL",
      logoUrl: "/league-logos/OSCL.png",
      themeColor: "#b6ff2e",
      description: null
    }
  });

  const moltenCore = await prisma.team.create({
    data: {
      slug: "molten-core",
      name: "Molten Core",
      tag: "MC",
      region: "United Kingdom",
      description: "Seed team for testing OSCL pages.",
      logoUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=MoltenCore"
    }
  });

  const steelWardens = await prisma.team.create({
    data: {
      slug: "steel-wardens",
      name: "Steel Wardens",
      tag: "SW",
      region: "Europe",
      description: "Fake seed team built for testing tournament standings.",
      logoUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=SteelWardens"
    }
  });

  const forgeFive = await prisma.team.create({
    data: {
      slug: "forge-five",
      name: "Forge Five",
      tag: "F5",
      region: "North America",
      description: "Fake seed team for testing match history and stat tables.",
      logoUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=ForgeFive"
    }
  });

  const playerData = [
    ["ember", "Ember", "United Kingdom", moltenCore.id, ["Em"]],
    ["rivet", "Rivet", "Ireland", moltenCore.id, ["Riv"]],
    ["ashline", "Ashline", "France", moltenCore.id, []],
    ["torque", "Torque", "Germany", steelWardens.id, []],
    ["flux", "Flux", "Netherlands", steelWardens.id, ["Fx"]],
    ["cinder", "Cinder", "Sweden", steelWardens.id, []],
    ["slate", "Slate", "United States", forgeFive.id, []],
    ["vex", "Vex", "Canada", forgeFive.id, []],
    ["bolt", "Bolt", "Brazil", forgeFive.id, []],
    ["quench", "Quench", "Denmark", forgeFive.id, []]
  ] as const;

  const players = new Map<string, { id: string; currentTeamId: string }>();

  for (const [slug, displayName, nationality, currentTeamId, aliases] of playerData) {
    const player = await prisma.player.create({
      data: {
        slug,
        displayName,
        nationality,
        currentTeamId,
        aliases: [...aliases],
        avatarUrl: avatars[slug],
        discordUsername: `${displayName.toLowerCase()}#0000`,
        notes: "Fake seed player, safe to replace."
      }
    });
    players.set(slug, { id: player.id, currentTeamId });
    await prisma.teamMembership.create({
      data: {
        playerId: player.id,
        teamId: currentTeamId,
        startDate: new Date("2026-05-01T00:00:00.000Z"),
        isCurrent: true
      }
    });
  }

  const tournament = await prisma.tournament.create({
    data: {
      slug: "oscl-invitational",
      name: "OSCL Invitational",
      description: "Fake seed tournament for testing public pages, admin editing, match pages, and leaderboards.",
      status: TournamentStatus.COMPLETED,
      startDate: new Date("2026-05-10T18:00:00.000Z"),
      endDate: new Date("2026-05-12T22:00:00.000Z"),
      prizePool: "$500",
      featured: true,
      logoUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=HMI",
      bannerUrl: "https://api.dicebear.com/9.x/glass/svg?seed=OSCLInvitational"
    }
  });

  await prisma.tournamentTeam.createMany({
    data: [
      { tournamentId: tournament.id, teamId: moltenCore.id, seed: 1, finalPlacement: 1 },
      { tournamentId: tournament.id, teamId: steelWardens.id, seed: 2, finalPlacement: 2 },
      { tournamentId: tournament.id, teamId: forgeFive.id, seed: 3, finalPlacement: 3 }
    ]
  });

  async function createMatchWithMaps(input: {
    teamAId: string;
    teamBId: string;
    scoreA: number;
    scoreB: number;
    winnerTeamId: string;
    playedAt: string;
    maps: { mapName: string; teamAScore: number; teamBScore: number; winnerTeamId: string }[];
  }) {
    const match = await prisma.match.create({
      data: {
        tournamentId: tournament.id,
        leagueId: oscl.id,
        matchKind: MatchKind.LEAGUE,
        teamAId: input.teamAId,
        teamBId: input.teamBId,
        scoreA: input.scoreA,
        scoreB: input.scoreB,
        winnerTeamId: input.winnerTeamId,
        status: MatchStatus.COMPLETED,
        playedAt: new Date(input.playedAt)
      }
    });

    const maps = [];
    for (const [index, map] of input.maps.entries()) {
      maps.push(
        await prisma.mapGame.create({
          data: {
            matchId: match.id,
            mapName: map.mapName,
            teamAScore: map.teamAScore,
            teamBScore: map.teamBScore,
            winnerTeamId: map.winnerTeamId,
            order: index + 1
          }
        })
      );
    }

    return { match, maps };
  }

  const final = await createMatchWithMaps({
    teamAId: moltenCore.id,
    teamBId: steelWardens.id,
    scoreA: 2,
    scoreB: 1,
    winnerTeamId: moltenCore.id,
    playedAt: "2026-05-12T20:30:00.000Z",
    maps: [
      { mapName: "Clubhouse", teamAScore: 7, teamBScore: 5, winnerTeamId: moltenCore.id },
      { mapName: "Bank", teamAScore: 4, teamBScore: 7, winnerTeamId: steelWardens.id },
      { mapName: "Oregon", teamAScore: 8, teamBScore: 6, winnerTeamId: moltenCore.id }
    ]
  });

  const semi = await createMatchWithMaps({
    teamAId: forgeFive.id,
    teamBId: moltenCore.id,
    scoreA: 0,
    scoreB: 2,
    winnerTeamId: moltenCore.id,
    playedAt: "2026-05-11T19:00:00.000Z",
    maps: [
      { mapName: "Kafe Dostoyevsky", teamAScore: 3, teamBScore: 7, winnerTeamId: moltenCore.id },
      { mapName: "Chalet", teamAScore: 5, teamBScore: 7, winnerTeamId: moltenCore.id }
    ]
  });

  function statLine(slug: string, mapGameId: string, matchId: string, teamId: string, seed: number) {
    const player = players.get(slug);
    if (!player) throw new Error(`Missing player ${slug}`);
    const kills = 5 + ((seed * 3) % 10);
    const deaths = 3 + ((seed * 5) % 8);
    const roundsPlayed = 12 + (seed % 4);

    return {
      playerId: player.id,
      teamId,
      tournamentId: tournament.id,
      matchId,
      mapGameId,
      kills,
      deaths,
      assists: seed % 6,
      headshots: Math.floor(kills * (0.34 + (seed % 3) * 0.08)),
      plants: seed % 2,
      defuses: seed % 3 === 0 ? 1 : 0,
      oneVX: seed % 5 === 0 ? 1 : 0,
      openingKills: seed % 4,
      openingDeaths: seed % 3,
      roundsPlayed,
      kostRounds: Math.min(roundsPlayed, 7 + (seed % 7)),
      ratingOverride: seed % 4 === 0 ? 1.05 + (seed % 5) * 0.04 : null
    };
  }

  const moltenPlayers = ["ember", "rivet", "ashline"];
  const steelPlayers = ["torque", "flux", "cinder"];
  const forgePlayers = ["slate", "vex", "bolt", "quench"];
  let seed = 1;

  for (const map of final.maps) {
    for (const slug of moltenPlayers) {
      await prisma.playerMapStats.create({ data: statLine(slug, map.id, final.match.id, moltenCore.id, seed++) });
    }
    for (const slug of steelPlayers) {
      await prisma.playerMapStats.create({ data: statLine(slug, map.id, final.match.id, steelWardens.id, seed++) });
    }
  }

  for (const map of semi.maps) {
    for (const slug of forgePlayers) {
      await prisma.playerMapStats.create({ data: statLine(slug, map.id, semi.match.id, forgeFive.id, seed++) });
    }
    for (const slug of moltenPlayers) {
      await prisma.playerMapStats.create({ data: statLine(slug, map.id, semi.match.id, moltenCore.id, seed++) });
    }
  }

  await prisma.adminUser.createMany({
    data: [
      { discordId: "1134526681265217576", addedBy: "seed" },
      { discordId: "165915426960834561", addedBy: "seed" }
    ],
    skipDuplicates: true
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
