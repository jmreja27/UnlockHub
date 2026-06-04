-- AlterTable
ALTER TABLE "PlatformAccount" ADD COLUMN "requiresReauth" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformAccount" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
