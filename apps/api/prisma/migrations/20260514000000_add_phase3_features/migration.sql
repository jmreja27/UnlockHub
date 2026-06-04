-- Fase 3: streakShields, birthDate, deletedAt, role, Notification, AchievementGuide,
--          enums UserRole / REDEEM / POINTS_REDEEM / INTERNAL

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- AlterEnum: añadir REDEEM a PointReason
ALTER TYPE "PointReason" ADD VALUE 'REDEEM';

-- AlterEnum: añadir POINTS_REDEEM a SubscriptionPlan
ALTER TYPE "SubscriptionPlan" ADD VALUE 'POINTS_REDEEM';

-- AlterEnum: añadir INTERNAL a StoreProvider
ALTER TYPE "StoreProvider" ADD VALUE 'INTERNAL';

-- AlterTable: nuevos campos en User
ALTER TABLE "User"
  ADD COLUMN "birthDate"     TIMESTAMP(3),
  ADD COLUMN "deletedAt"     TIMESTAMP(3),
  ADD COLUMN "streakShields" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "role"          "UserRole" NOT NULL DEFAULT 'USER';

-- CreateIndex nuevos en User
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "User_role_idx"      ON "User"("role");

-- CreateTable: Notification
CREATE TABLE "Notification" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex para Notification
CREATE INDEX "Notification_userId_idx"    ON "Notification"("userId");
CREATE INDEX "Notification_read_idx"      ON "Notification"("read");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey para Notification
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AchievementGuide
CREATE TABLE "AchievementGuide" (
    "id"            TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "content"       TEXT NOT NULL,
    "upvotes"       INTEGER NOT NULL DEFAULT 0,
    "reported"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex para AchievementGuide
CREATE INDEX "AchievementGuide_achievementId_idx" ON "AchievementGuide"("achievementId");
CREATE INDEX "AchievementGuide_userId_idx"        ON "AchievementGuide"("userId");
CREATE INDEX "AchievementGuide_reported_idx"      ON "AchievementGuide"("reported");
CREATE INDEX "AchievementGuide_upvotes_idx"       ON "AchievementGuide"("upvotes");

-- AddForeignKey para AchievementGuide → Achievement
ALTER TABLE "AchievementGuide"
  ADD CONSTRAINT "AchievementGuide_achievementId_fkey"
  FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey para AchievementGuide → User
ALTER TABLE "AchievementGuide"
  ADD CONSTRAINT "AchievementGuide_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
