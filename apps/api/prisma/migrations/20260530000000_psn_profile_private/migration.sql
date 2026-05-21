-- AddColumn: psnProfilePrivate en PlatformAccount
-- Permite distinguir "perfil PSN privado" (sincronización bloqueada) de "token expirado" (requiresReauth)
ALTER TABLE "PlatformAccount" ADD COLUMN "psnProfilePrivate" BOOLEAN NOT NULL DEFAULT false;
