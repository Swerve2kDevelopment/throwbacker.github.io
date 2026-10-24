ALTER TABLE "Team" ADD COLUMN "themeColor" TEXT;

UPDATE "Team"
SET "themeColor" = CASE
  WHEN LOWER("slug") = 'apexis' THEN '#ff8a1f'
  WHEN LOWER("slug") = 'visn' THEN '#16a34a'
  WHEN LOWER("slug") = 'dvs' THEN '#8b5cf6'
  WHEN LOWER("slug") = 'est' THEN '#22d3ee'
  ELSE '#e11d2e'
END
WHERE "themeColor" IS NULL;
