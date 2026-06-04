-- DropIndex
DROP INDEX "Achievement_platform_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_platform_gameId_externalId_key" ON "Achievement"("platform", "gameId", "externalId");
