CREATE TABLE "TeamRecruitmentPost" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" TEXT,
    "note" TEXT,
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TeamRecruitmentPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamRecruitmentPost_teamId_closedAt_idx" ON "TeamRecruitmentPost"("teamId", "closedAt");

ALTER TABLE "TeamRecruitmentPost" ADD CONSTRAINT "TeamRecruitmentPost_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
