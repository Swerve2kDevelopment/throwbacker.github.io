ALTER TABLE "MapGame" ADD COLUMN "replay" JSONB;

ALTER TABLE "PlayerMapStats" ADD COLUMN "teamKills" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "OperatorGameId" (
    "gameId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'replay',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperatorGameId_pkey" PRIMARY KEY ("gameId")
);
