ALTER TABLE "Player" ADD COLUMN "inGameName" TEXT;

CREATE TYPE "StatsSubmissionStatus" AS ENUM ('PENDING', 'IMPORTED', 'REJECTED');

CREATE TABLE "HostApiKey" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "HostApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HostApiKey_keyHash_key" ON "HostApiKey"("keyHash");

CREATE TABLE "StatsSubmission" (
    "id" TEXT NOT NULL,
    "hostKeyId" TEXT,
    "status" "StatsSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "StatsSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StatsSubmission_status_createdAt_idx" ON "StatsSubmission"("status", "createdAt");
ALTER TABLE "StatsSubmission" ADD CONSTRAINT "StatsSubmission_hostKeyId_fkey" FOREIGN KEY ("hostKeyId") REFERENCES "HostApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
