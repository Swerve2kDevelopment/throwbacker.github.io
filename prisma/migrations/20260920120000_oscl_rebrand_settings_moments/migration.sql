CREATE TABLE "PlayerKeyMoment" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerKeyMoment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerOfWeek" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerOfWeek_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorIcon" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorIcon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "PlayerKeyMoment_playerId_createdAt_idx" ON "PlayerKeyMoment"("playerId", "createdAt");
CREATE INDEX "PlayerKeyMoment_matchId_idx" ON "PlayerKeyMoment"("matchId");
CREATE UNIQUE INDEX "PlayerOfWeek_weekStart_key" ON "PlayerOfWeek"("weekStart");
CREATE INDEX "PlayerOfWeek_playerId_idx" ON "PlayerOfWeek"("playerId");
CREATE UNIQUE INDEX "OperatorIcon_name_key" ON "OperatorIcon"("name");

ALTER TABLE "PlayerKeyMoment" ADD CONSTRAINT "PlayerKeyMoment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerKeyMoment" ADD CONSTRAINT "PlayerKeyMoment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerOfWeek" ADD CONSTRAINT "PlayerOfWeek_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "BracketStage" AS ENUM ('UPPER', 'LOWER', 'GRAND_FINAL', 'GROUP');

ALTER TABLE "Match" ADD COLUMN "title" TEXT;
ALTER TABLE "Match" ADD COLUMN "bracketStage" "BracketStage";
ALTER TABLE "Match" ADD COLUMN "bracketRound" INTEGER;
ALTER TABLE "Match" ADD COLUMN "bracketPosition" INTEGER;

INSERT INTO "League" ("id", "slug", "name", "shortName", "logoUrl", "themeColor", "description", "createdAt", "updatedAt")
VALUES ('oscl', 'oscl', 'Old Siege: Challengers League', 'OSCL', '/league-logos/OSCL.png', '#b6ff2e', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "shortName" = EXCLUDED."shortName",
  "logoUrl" = COALESCE("League"."logoUrl", EXCLUDED."logoUrl"),
  "themeColor" = EXCLUDED."themeColor",
  "description" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;
