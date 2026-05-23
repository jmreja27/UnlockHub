export const FEATURES = {
  premium: false,        // Activar cuando Google Play Billing esté integrado (B7)
  challenges: false,     // Activar cuando los retos semanales estén listos para Fase 4
  wrapped: true,         // ✅ ACTIVO — wrapped.service.ts implementado
  pointsRedeem: true,    // ✅ ACTIVO — POST /api/v1/subscriptions/redeem-points implementado
  advancedStats: true,   // ✅ ACTIVO — GET /api/v1/users/me/stats implementado
  ugcGuides: true,       // ✅ ACTIVO — AchievementGuide endpoints implementados
  notifications: true,   // ✅ ACTIVO — tabla Notification + centro notificaciones implementado
} as const;
