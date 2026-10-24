-- Player profile extras
ALTER TABLE "Player" ADD COLUMN "realName" TEXT;
ALTER TABLE "Player" ADD COLUMN "role" TEXT;
ALTER TABLE "Player" ADD COLUMN "status" TEXT;
ALTER TABLE "Player" ADD COLUMN "dateOfBirth" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN "socialLinks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Tournament editorial/admin extras
ALTER TABLE "Tournament" ADD COLUMN "mapVetoes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Tournament" ADD COLUMN "operatorBans" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Tournament" ADD COLUMN "mvpPlayerId" TEXT;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_mvpPlayerId_fkey" FOREIGN KEY ("mvpPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Match veto/ban extras, including standalone matches
ALTER TABLE "Match" ADD COLUMN "mapVetoes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Match" ADD COLUMN "operatorBans" TEXT[] DEFAULT ARRAY[]::TEXT[];
