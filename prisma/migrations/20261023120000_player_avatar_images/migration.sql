CREATE TABLE "PlayerAvatarImage" (
    "playerId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sourceUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerAvatarImage_pkey" PRIMARY KEY ("playerId")
);

ALTER TABLE "PlayerAvatarImage" ADD CONSTRAINT "PlayerAvatarImage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
