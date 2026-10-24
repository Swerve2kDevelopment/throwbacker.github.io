CREATE TYPE "MatchKind" AS ENUM ('FUN', 'LEAGUE');

CREATE TABLE "League" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "logoUrl" TEXT,
  "themeColor" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

ALTER TABLE "Match" ADD COLUMN "leagueId" TEXT;
ALTER TABLE "Match" ADD COLUMN "matchKind" "MatchKind" NOT NULL DEFAULT 'FUN';

ALTER TABLE "Match" ADD CONSTRAINT "Match_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "League" (
  "id",
  "slug",
  "name",
  "shortName",
  "logoUrl",
  "themeColor",
  "description",
  "updatedAt"
)
VALUES (
  'oscl',
  'oscl',
  'Old Siege Challengers League',
  'OSCL',
  '/league-logos/OSCL.png',
  '#b6ff2e',
  'A lime-green competitive league inside Heated Metal Ten Mans.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

UPDATE "Match"
SET "matchKind" = 'LEAGUE',
    "leagueId" = (SELECT "id" FROM "League" WHERE "slug" = 'oscl')
WHERE "format" IN (4, 5);
