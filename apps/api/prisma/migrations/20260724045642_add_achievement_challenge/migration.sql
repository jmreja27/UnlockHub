-- CreateEnum
CREATE TYPE "AchievementChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'RESOLVED_WIN', 'RESOLVED_DRAW');

-- CreateTable
CREATE TABLE "AchievementChallenge" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "challengedId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "status" "AchievementChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "pointsAwarded" INTEGER,

    CONSTRAINT "AchievementChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AchievementChallenge_challengedId_status_idx" ON "AchievementChallenge"("challengedId", "status");

-- CreateIndex
CREATE INDEX "AchievementChallenge_challengerId_status_idx" ON "AchievementChallenge"("challengerId", "status");

-- CreateIndex
CREATE INDEX "AchievementChallenge_status_expiresAt_idx" ON "AchievementChallenge"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AchievementChallenge_achievementId_idx" ON "AchievementChallenge"("achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementChallenge_challengerId_challengedId_achievementI_key" ON "AchievementChallenge"("challengerId", "challengedId", "achievementId");

-- AddForeignKey
ALTER TABLE "AchievementChallenge" ADD CONSTRAINT "AchievementChallenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementChallenge" ADD CONSTRAINT "AchievementChallenge_challengedId_fkey" FOREIGN KEY ("challengedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementChallenge" ADD CONSTRAINT "AchievementChallenge_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
