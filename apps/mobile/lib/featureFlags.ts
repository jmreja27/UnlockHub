export const FEATURES = {
  premium: false,        // 🚩 Desactivado — activar en Fase 4 tras configurar RevenueCat (B18/B19/B20)
  challenges: false,     // Activar cuando los retos semanales estén listos para Fase 4
  wrapped: true,         // ✅ ACTIVO — wrapped.service.ts implementado
  pointsRedeem: false,   // 🚩 Desactivado — sin destino útil sin premium activo
  advancedStats: false,  // 🚩 Desactivado — feature premium
  ugcGuides: true,       // ✅ ACTIVO — AchievementGuide endpoints implementados
  notifications: true,   // ✅ ACTIVO — tabla Notification + centro notificaciones implementado
} as const;
