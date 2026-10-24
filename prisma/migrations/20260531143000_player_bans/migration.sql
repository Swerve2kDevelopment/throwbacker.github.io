CREATE TABLE "PlayerBan" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "matchText" TEXT NOT NULL,
  "issuedBy" TEXT,
  "liftedBy" TEXT,
  "liftedAt" TIMESTAMP(3),
  "liftReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlayerBan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlayerBan_playerId_liftedAt_idx" ON "PlayerBan"("playerId", "liftedAt");

ALTER TABLE "PlayerBan" ADD CONSTRAINT "PlayerBan_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
