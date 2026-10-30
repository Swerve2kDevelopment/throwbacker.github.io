-- The Discord Game Stats Widget needs a claimed game, which OSCL can't have.
ALTER TABLE "Player" DROP COLUMN "discordWidgetLinkedAt";
ALTER TABLE "Player" DROP COLUMN "discordWidgetSyncedAt";
