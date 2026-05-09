/**
 * UnlockHub — Servidor Mock completo para pruebas en emulador
 *
 * Cubre TODAS las pantallas de la app sin necesitar PostgreSQL, Redis ni APIs externas.
 *
 * Uso:
 *   cd apps/api && node mock-server.js
 *   adb reverse tcp:3000 tcp:3000    ← ejecutar en otro terminal
 *
 * ─── CUENTA DE PRUEBA ─────────────────────────────────────────────────────────
 *   Email:    demo@unlockhub.test
 *   Password: Demo1234!
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require('express');

const app = express();
app.use(express.json());

// ─── CORS — necesario para el cliente mobile ────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── DATOS MOCK ─────────────────────────────────────────────────────────────

const DEMO_USER = {
  id: 'u_demo',
  username: 'demo_player',
  email: 'demo@unlockhub.test',
  avatar: null,
  banner: null,
  bio: 'Cazador de logros desde 2019 🎮',
  level: 15,
  xp: 12500,
  streakDays: 7,
  countryCode: 'ES',
  isPremium: false,
  premiumUntil: null,
  lastSyncAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  createdAt: '2024-01-15T10:00:00.000Z',
};

const ACCESS_TOKEN = 'mock-access-token-demo';
const REFRESH_TOKEN = 'mock-refresh-token-demo';

const MOCK_USERS = [
  { id: 'u1', username: 'gamer_pro',     avatar: null, level: 22, xp: 31000, countryCode: 'ES' },
  { id: 'u2', username: 'retro_hunter',  avatar: null, level: 18, xp: 24000, countryCode: 'ES' },
  { id: 'u3', username: 'xboxlord',      avatar: null, level: 9,  xp: 7800,  countryCode: 'US' },
  { id: 'u4', username: 'platina_queen', avatar: null, level: 35, xp: 65000, countryCode: 'FR' },
  { id: 'u5', username: 'steamroller',   avatar: null, level: 28, xp: 45000, countryCode: 'DE' },
  { id: 'u6', username: 'trophyhunter',  avatar: null, level: 20, xp: 28500, countryCode: 'IT' },
  { id: 'u7', username: 'ach_master',    avatar: null, level: 12, xp: 10200, countryCode: 'ES' },
  { id: 'u8', username: 'indie_gamer',   avatar: null, level: 7,  xp: 5300,  countryCode: 'MX' },
  { id: 'u9', username: 'retrogod',      avatar: null, level: 41, xp: 92000, countryCode: 'JP' },
  { id: 'u10', username: 'consolewar',   avatar: null, level: 6,  xp: 4100,  countryCode: 'US' },
];

// ─── Juegos ─────────────────────────────────────────────────────────────────

const MOCK_GAMES = [
  {
    id: 'g_hl2',
    platform: 'STEAM',
    externalId: '220',
    title: 'Half-Life 2',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 20,
  },
  {
    id: 'g_portal2',
    platform: 'STEAM',
    externalId: '620',
    title: 'Portal 2',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 51,
  },
  {
    id: 'g_witcher3',
    platform: 'STEAM',
    externalId: '292030',
    title: 'The Witcher 3: Wild Hunt',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 78,
  },
  {
    id: 'g_darksouls',
    platform: 'STEAM',
    externalId: '570940',
    title: 'Dark Souls: Remastered',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 41,
  },
  {
    id: 'g_smb3',
    platform: 'RA',
    externalId: '1481',
    title: 'Super Mario Bros. 3',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 40,
  },
  {
    id: 'g_megamanx',
    platform: 'RA',
    externalId: '2124',
    title: 'Mega Man X',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 30,
  },
  {
    id: 'g_soniccd',
    platform: 'RA',
    externalId: '9824',
    title: 'Sonic CD',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 15,
  },
  {
    id: 'g_celeste',
    platform: 'STEAM',
    externalId: '504230',
    title: 'Celeste',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 25,
  },
  // ─── PSN ───
  {
    id: 'g_lastofus2',
    platform: 'PSN',
    externalId: 'CUSA07820',
    title: 'The Last of Us Part II',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 26,
  },
  {
    id: 'g_spiderman',
    platform: 'PSN',
    externalId: 'CUSA11995',
    title: "Marvel's Spider-Man",
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 51,
  },
  {
    id: 'g_bloodborne',
    platform: 'PSN',
    externalId: 'CUSA00207',
    title: 'Bloodborne',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 36,
  },
  {
    id: 'g_godofwar',
    platform: 'PSN',
    externalId: 'CUSA11993',
    title: 'God of War',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 37,
  },
  {
    id: 'g_horizon',
    platform: 'PSN',
    externalId: 'CUSA05572',
    title: 'Horizon Zero Dawn',
    iconUrl: null,
    headerUrl: null,
    totalAchievements: 56,
  },
];

// ─── Logros de ejemplo por juego ─────────────────────────────────────────────

function makeMockAchievements(gameId, count) {
  const names = [
    'Primera sangre', 'Sin marcha atrás', 'Explorador nato', 'Coleccionista',
    'Maestro del tiempo', 'Speedrunner', 'Pacifista', 'Berserker',
    'Curioso irremediable', 'Perseverante', 'Leyenda', 'Sin daño',
    'Completista', 'Secreto bien guardado', 'Al límite', 'Combo maestro',
    'Invencible', 'El elegido', 'Veterano', 'Glitchhunter',
    'Mago de las estadísticas', 'Jugador nocturno', 'Madrugador', 'Crítico',
    'Speedster', 'Ninja silencioso', 'El último', 'Héroe olvidado',
    'Desafiante', 'Imparable',
  ];

  return Array.from({ length: Math.min(count, names.length) }, (_, i) => ({
    id: `${gameId}_a${i + 1}`,
    gameId,
    platform: MOCK_GAMES.find(g => g.id === gameId)?.platform ?? 'STEAM',
    externalId: `ach_${i + 1}`,
    title: names[i] ?? `Logro ${i + 1}`,
    description: i % 3 === 0 ? null : `Completa el objetivo ${i + 1} del juego sin ayuda externa.`,
    iconUrl: null,
    rawValue: null,
    normalizedPoints: [10, 25, 50, 100][i % 4],
    rarity: parseFloat((Math.random() * 95 + 1).toFixed(1)),
    externalUrl: null,
  }));
}

// ─── Plataformas vinculadas del demo ────────────────────────────────────────

const DEMO_PLATFORMS = [
  {
    id: 'pa_steam',
    userId: DEMO_USER.id,
    platform: 'STEAM',
    externalId: '76561198000000001',
    username: 'demo_player_steam',
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'pa_ra',
    userId: DEMO_USER.id,
    platform: 'RA',
    externalId: 'demo_retro',
    username: 'demo_retro_player',
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'pa_psn',
    userId: DEMO_USER.id,
    platform: 'PSN',
    externalId: 'demo_psn_id',
    username: 'demo_player_psn',
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];

// ─── Amigos ─────────────────────────────────────────────────────────────────

const DEMO_FRIENDS = [
  {
    id: 'fr_1',
    senderId: DEMO_USER.id,
    receiverId: 'u1',
    status: 'ACCEPTED',
    createdAt: '2024-03-01T10:00:00Z',
    sender: { id: DEMO_USER.id, username: DEMO_USER.username, avatar: null, level: DEMO_USER.level, xp: DEMO_USER.xp },
    receiver: { id: 'u1', username: 'gamer_pro', avatar: null, level: 22, xp: 31000 },
  },
  {
    id: 'fr_2',
    senderId: 'u2',
    receiverId: DEMO_USER.id,
    status: 'ACCEPTED',
    createdAt: '2024-04-10T14:00:00Z',
    sender: { id: 'u2', username: 'retro_hunter', avatar: null, level: 18, xp: 24000 },
    receiver: { id: DEMO_USER.id, username: DEMO_USER.username, avatar: null, level: DEMO_USER.level, xp: DEMO_USER.xp },
  },
];

const DEMO_PENDING = [
  {
    id: 'fr_pending_1',
    senderId: 'u3',
    receiverId: DEMO_USER.id,
    status: 'PENDING',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    sender: { id: 'u3', username: 'xboxlord', avatar: null, level: 9, xp: 7800 },
    receiver: { id: DEMO_USER.id, username: DEMO_USER.username, avatar: null, level: DEMO_USER.level, xp: DEMO_USER.xp },
  },
];

// ─── Feed de actividad ───────────────────────────────────────────────────────

const now = Date.now();
const DEMO_FEED = [
  {
    id: 'ev_1',
    userId: 'u1',
    type: 'ACHIEVEMENT_UNLOCKED',
    payload: { achievementTitle: 'Maestro del tiempo', gameName: 'Portal 2', xp: 50 },
    createdAt: new Date(now - 1000 * 60 * 15).toISOString(),
    user: { id: 'u1', username: 'gamer_pro', avatar: null },
  },
  {
    id: 'ev_2',
    userId: DEMO_USER.id,
    type: 'LEVEL_UP',
    payload: { newLevel: 15, previousLevel: 14 },
    createdAt: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
    user: { id: DEMO_USER.id, username: DEMO_USER.username, avatar: null },
  },
  {
    id: 'ev_3',
    userId: 'u2',
    type: 'ACHIEVEMENT_UNLOCKED',
    payload: { achievementTitle: 'Sin marcha atrás', gameName: 'Mega Man X', xp: 25 },
    createdAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
    user: { id: 'u2', username: 'retro_hunter', avatar: null },
  },
  {
    id: 'ev_4',
    userId: 'u1',
    type: 'GAME_COMPLETED',
    payload: { gameName: 'Celeste', platform: 'STEAM', totalAchievements: 25 },
    createdAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
    user: { id: 'u1', username: 'gamer_pro', avatar: null },
  },
  {
    id: 'ev_5',
    userId: DEMO_USER.id,
    type: 'STREAK_MILESTONE',
    payload: { streakDays: 7 },
    createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
    user: { id: DEMO_USER.id, username: DEMO_USER.username, avatar: null },
  },
  {
    id: 'ev_6',
    userId: 'u2',
    type: 'FRIEND_ADDED',
    payload: { friendUsername: 'indie_gamer' },
    createdAt: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
    user: { id: 'u2', username: 'retro_hunter', avatar: null },
  },
];

// ─── Rankings ────────────────────────────────────────────────────────────────

const ALL_RANKING_USERS = [
  { userId: 'u9',       username: 'retrogod',      avatar: null, xp: 92000, rank: 1,  countryCode: 'JP' },
  { userId: 'u4',       username: 'platina_queen',  avatar: null, xp: 65000, rank: 2,  countryCode: 'FR' },
  { userId: 'u5',       username: 'steamroller',    avatar: null, xp: 45000, rank: 3,  countryCode: 'DE' },
  { userId: 'u1',       username: 'gamer_pro',      avatar: null, xp: 31000, rank: 4,  countryCode: 'ES' },
  { userId: 'u6',       username: 'trophyhunter',   avatar: null, xp: 28500, rank: 5,  countryCode: 'IT' },
  { userId: 'u2',       username: 'retro_hunter',   avatar: null, xp: 24000, rank: 6,  countryCode: 'ES' },
  { userId: DEMO_USER.id, username: DEMO_USER.username, avatar: null, xp: DEMO_USER.xp, rank: 7, countryCode: 'ES' },
  { userId: 'u7',       username: 'ach_master',     avatar: null, xp: 10200, rank: 8,  countryCode: 'ES' },
  { userId: 'u3',       username: 'xboxlord',       avatar: null, xp: 7800,  rank: 9,  countryCode: 'US' },
  { userId: 'u8',       username: 'indie_gamer',    avatar: null, xp: 5300,  rank: 10, countryCode: 'MX' },
  { userId: 'u10',      username: 'consolewar',     avatar: null, xp: 4100,  rank: 11, countryCode: 'US' },
];

// ─── Reto semanal ────────────────────────────────────────────────────────────

const monday = new Date();
monday.setDate(monday.getDate() - monday.getDay() + 1);
monday.setHours(0, 0, 0, 0);
const nextMonday = new Date(monday);
nextMonday.setDate(monday.getDate() + 7);

const ACTIVE_CHALLENGE = {
  id: 'ch_w1',
  title: 'Cazador de logros',
  description: 'Desbloquea 10 logros esta semana en cualquier plataforma.',
  metric: 'ACHIEVEMENTS_UNLOCKED',
  targetValue: 10,
  xpReward: 500,
  startAt: monday.toISOString(),
  endAt: nextMonday.toISOString(),
};

const MY_CHALLENGE_STATUS = {
  id: 'uc_demo_w1',
  userId: DEMO_USER.id,
  challengeId: ACTIVE_CHALLENGE.id,
  progress: 4,
  completedAt: null,
  challenge: ACTIVE_CHALLENGE,
};

// ─── Puntos ──────────────────────────────────────────────────────────────────

const DEMO_POINTS = [
  { id: 'pt_1', userId: DEMO_USER.id, amount: 50,  reason: 'STREAK',      createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString() },
  { id: 'pt_2', userId: DEMO_USER.id, amount: 25,  reason: 'ACHIEVEMENT',  createdAt: new Date(now - 1000 * 60 * 60 * 48).toISOString() },
  { id: 'pt_3', userId: DEMO_USER.id, amount: 100, reason: 'CHALLENGE',    createdAt: new Date(now - 1000 * 60 * 60 * 72).toISOString() },
  { id: 'pt_4', userId: DEMO_USER.id, amount: 25,  reason: 'ACHIEVEMENT',  createdAt: new Date(now - 1000 * 60 * 60 * 96).toISOString() },
  { id: 'pt_5', userId: DEMO_USER.id, amount: 50,  reason: 'STREAK',      createdAt: new Date(now - 1000 * 60 * 60 * 120).toISOString() },
];

// ─── Gaming Wrapped ──────────────────────────────────────────────────────────

const WRAPPED_2024 = {
  year: 2024,
  totalAchievements: 247,
  totalXpGained: 8900,
  topGame: { title: 'God of War', iconUrl: null, achievementsCount: 37, platform: 'PSN' },
  rarestAchievement: { title: 'Al límite', iconUrl: null, rarity: 0.8, gameName: 'Bloodborne' },
  bestStreak: 14,
  previousYear: { totalAchievements: 130, totalXpGained: 4200, bestStreak: 8 },
};

// ─── MIDDLEWARE AUTH ─────────────────────────────────────────────────────────

function auth(req, res, next) {
  const header = req.headers['authorization'] ?? '';
  const token = header.replace('Bearer ', '');
  if (token !== ACCESS_TOKEN) {
    return res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED' });
  }
  req.userId = DEMO_USER.id;
  next();
}

// ─── HEALTH ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', maintenance: false, timestamp: new Date().toISOString() });
});

// ─── AUTH ────────────────────────────────────────────────────────────────────

app.post('/api/v1/auth/register', (req, res) => {
  const { username, email } = req.body ?? {};
  if (!username || !email) return res.status(400).json({ error: 'Faltan campos', code: 'VALIDATION_ERROR' });
  res.status(201).json({
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    user: { ...DEMO_USER, username, email },
  });
});

app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (email !== DEMO_USER.email || password !== 'Demo1234!') {
    return res.status(401).json({ error: 'Credenciales incorrectas', code: 'INVALID_CREDENTIALS' });
  }
  res.json({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, user: DEMO_USER });
});

app.post('/api/v1/auth/refresh', (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (refreshToken !== REFRESH_TOKEN) {
    return res.status(401).json({ error: 'Refresh token inválido', code: 'INVALID_REFRESH_TOKEN' });
  }
  res.json({ accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN });
});

app.post('/api/v1/auth/logout', (_req, res) => res.sendStatus(204));
app.post('/api/v1/auth/logout-all', auth, (_req, res) => res.sendStatus(204));
app.get('/api/v1/auth/me', auth, (_req, res) => res.json(DEMO_USER));

// ─── USERS ───────────────────────────────────────────────────────────────────

app.get('/api/v1/users/me', auth, (_req, res) => res.json(DEMO_USER));
app.patch('/api/v1/users/me', auth, (req, res) => {
  const updated = { ...DEMO_USER, ...req.body };
  res.json(updated);
});
app.get('/api/v1/users/me/streak-milestone', auth, (_req, res) => {
  res.json({ milestone: 7, xpAwarded: 150 });
});

// Perfil público — /api/v1/users/:username
app.get('/api/v1/users/:username', (req, res) => {
  const { username } = req.params;
  // El propio usuario demo
  if (username === DEMO_USER.username || username === 'me') {
    return res.json({ ...DEMO_USER, friendCount: 2 });
  }
  const found = MOCK_USERS.find(u => u.username === username);
  if (!found) return res.status(404).json({ error: 'Usuario no encontrado', code: 'NOT_FOUND' });
  return res.json({ ...found, email: `${found.username}@example.com`, bio: null, banner: null, streakDays: Math.floor(Math.random() * 20), isPremium: false, premiumUntil: null, lastSyncAt: null, createdAt: '2024-01-01T00:00:00Z', friendCount: Math.floor(Math.random() * 30) });
});

// Plataformas vinculadas — ruta real
app.get('/api/v1/platforms', auth, (_req, res) => res.json(DEMO_PLATFORMS));
// Ruta alternativa que también llama el perfil
app.get('/api/v1/users/me/platforms', auth, (_req, res) => res.json(DEMO_PLATFORMS));

app.post('/api/v1/platforms/steam/link', auth, (req, res) => {
  res.status(201).json({ message: 'Steam vinculado', account: { ...DEMO_PLATFORMS[0], username: req.body.username ?? 'steam_user' } });
});
app.delete('/api/v1/platforms/steam/unlink', auth, (_req, res) => res.sendStatus(204));
app.post('/api/v1/platforms/ra/link', auth, (req, res) => {
  res.status(201).json({ message: 'RetroAchievements vinculado', account: { ...DEMO_PLATFORMS[1], username: req.body.username ?? 'ra_user' } });
});
app.delete('/api/v1/platforms/ra/unlink', auth, (_req, res) => res.sendStatus(204));
app.post('/api/v1/platforms/psn/link', auth, (req, res) => {
  res.status(201).json({ message: 'PSN vinculado', account: { id: 'pa_psn', userId: DEMO_USER.id, platform: 'PSN', externalId: 'psn_demo', username: req.body.psnId ?? 'psn_user', lastSyncedAt: null } });
});
app.delete('/api/v1/platforms/psn/unlink', auth, (_req, res) => res.sendStatus(204));
app.post('/api/v1/platforms/xbox/link', auth, (req, res) => {
  res.status(201).json({ message: 'Xbox vinculado', account: { id: 'pa_xbox', userId: DEMO_USER.id, platform: 'XBOX', externalId: 'xbox_demo', username: req.body.gamertag ?? 'xbox_user', lastSyncedAt: null } });
});
app.delete('/api/v1/platforms/xbox/unlink', auth, (_req, res) => res.sendStatus(204));

// ─── RANKINGS ────────────────────────────────────────────────────────────────

function paginatedRanking(entries, req, res) {
  const page = parseInt(req.query.page ?? '1');
  const limit = parseInt(req.query.limit ?? '20');
  const start = (page - 1) * limit;
  const data = entries.slice(start, start + limit);
  res.json({ data, total: entries.length, page, limit });
}

app.get('/api/v1/rankings/global', (req, res) => paginatedRanking(ALL_RANKING_USERS, req, res));
app.get('/api/v1/rankings/country/:country', (req, res) => {
  const filtered = ALL_RANKING_USERS.filter(u => u.countryCode === req.params.country.toUpperCase()).map((u, i) => ({ ...u, rank: i + 1 }));
  paginatedRanking(filtered, req, res);
});
app.get('/api/v1/rankings/platform/:platform', (req, res) => {
  paginatedRanking(ALL_RANKING_USERS.map((u, i) => ({ ...u, rank: i + 1 })), req, res);
});
app.get('/api/v1/rankings/me', auth, (_req, res) => {
  const entry = ALL_RANKING_USERS.find(u => u.userId === DEMO_USER.id);
  res.json({ rank: entry?.rank ?? null, xp: DEMO_USER.xp });
});

// ─── BÚSQUEDA ────────────────────────────────────────────────────────────────

app.get('/api/v1/search', (req, res) => {
  const q = (req.query.q ?? '').toLowerCase().trim();
  const type = req.query.type ?? 'all';

  if (q.length < 2) return res.json({ games: [], users: [], total: 0 });

  const games = type !== 'users'
    ? MOCK_GAMES.filter(g => g.title.toLowerCase().includes(q)).map(g => ({ type: 'game', ...g }))
    : [];
  const users = type !== 'games'
    ? [...MOCK_USERS, DEMO_USER].filter(u => u.username.toLowerCase().includes(q)).map(u => ({ type: 'user', id: u.id, username: u.username, avatar: u.avatar, level: u.level, xp: u.xp }))
    : [];

  res.json({ games, users, total: games.length + users.length });
});

app.get('/api/v1/search/games/:id', (req, res) => {
  const game = MOCK_GAMES.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Juego no encontrado', code: 'NOT_FOUND' });
  res.json({ ...game, achievements: makeMockAchievements(game.id, game.totalAchievements) });
});

// ─── AMIGOS ──────────────────────────────────────────────────────────────────

app.get('/api/v1/friends', auth, (req, res) => {
  const page = parseInt(req.query.page ?? '1');
  const limit = parseInt(req.query.limit ?? '20');
  const data = DEMO_FRIENDS.slice((page - 1) * limit, page * limit);
  res.json({ data, total: DEMO_FRIENDS.length, page, limit });
});

app.get('/api/v1/friends/pending', auth, (req, res) => {
  const page = parseInt(req.query.page ?? '1');
  const limit = parseInt(req.query.limit ?? '20');
  const data = DEMO_PENDING.slice((page - 1) * limit, page * limit);
  res.json({ data, total: DEMO_PENDING.length, page, limit });
});

app.post('/api/v1/friends', auth, (req, res) => {
  const { targetUserId } = req.body ?? {};
  const target = MOCK_USERS.find(u => u.id === targetUserId);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado', code: 'NOT_FOUND' });
  res.status(201).json({
    id: `fr_new_${Date.now()}`,
    senderId: DEMO_USER.id,
    receiverId: targetUserId,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    sender: { id: DEMO_USER.id, username: DEMO_USER.username, avatar: null, level: DEMO_USER.level, xp: DEMO_USER.xp },
    receiver: { id: target.id, username: target.username, avatar: null, level: target.level, xp: target.xp },
  });
});

app.post('/api/v1/friends/:friendshipId/accept', auth, (req, res) => {
  const pending = DEMO_PENDING.find(f => f.id === req.params.friendshipId);
  if (!pending) return res.status(404).json({ error: 'Solicitud no encontrada', code: 'NOT_FOUND' });
  res.json({ ...pending, status: 'ACCEPTED' });
});

app.delete('/api/v1/friends/:friendshipId/reject', auth, (_req, res) => res.sendStatus(204));
app.delete('/api/v1/friends/:friendshipId', auth, (_req, res) => res.sendStatus(204));

// ─── ACTIVIDAD ───────────────────────────────────────────────────────────────

app.get('/api/v1/activity/feed', auth, (req, res) => {
  const page = parseInt(req.query.page ?? '1');
  const limit = parseInt(req.query.limit ?? '20');
  const data = DEMO_FEED.slice((page - 1) * limit, page * limit);
  res.json({ data, total: DEMO_FEED.length, page, limit });
});

app.get('/api/v1/activity/public', (req, res) => {
  const page = parseInt(req.query.page ?? '1');
  const limit = parseInt(req.query.limit ?? '20');
  const data = DEMO_FEED.slice((page - 1) * limit, page * limit);
  res.json({ data, total: DEMO_FEED.length, page, limit });
});

// ─── RETOS ───────────────────────────────────────────────────────────────────

app.get('/api/v1/challenges/active', (_req, res) => res.json(ACTIVE_CHALLENGE));
app.get('/api/v1/challenges/me', auth, (_req, res) => res.json(MY_CHALLENGE_STATUS));

// ─── SYNC ────────────────────────────────────────────────────────────────────

app.post('/api/v1/sync/:platform', auth, (req, res) => {
  const platform = req.params.platform.toUpperCase();
  res.json({
    platform,
    achievementsSynced: Math.floor(Math.random() * 10) + 1,
    gamesUpdated: Math.floor(Math.random() * 3) + 1,
    syncedAt: new Date().toISOString(),
  });
});

app.get('/api/v1/sync/:platform/status', auth, (req, res) => {
  const platform = req.params.platform.toUpperCase();
  res.json({
    platform,
    lastSyncedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    cooldownUntil: null,
    dailyManualSyncsUsed: 1,
    dailyManualSyncLimit: 5,
  });
});

// ─── PUNTOS ──────────────────────────────────────────────────────────────────

app.get('/api/v1/users/me/points', auth, (req, res) => {
  const page = parseInt(req.query.page ?? '1');
  const limit = parseInt(req.query.limit ?? '20');
  const data = DEMO_POINTS.slice((page - 1) * limit, page * limit);
  res.json({ data, total: DEMO_POINTS.length, page, limit, totalPoints: DEMO_POINTS.reduce((s, p) => s + p.amount, 0) });
});

// ─── NOTIFICACIONES ──────────────────────────────────────────────────────────

app.get('/api/v1/notifications', auth, (req, res) => {
  const page = parseInt(req.query.page ?? '1');
  const limit = parseInt(req.query.limit ?? '20');
  res.json({ data: [], total: 0, page, limit });
});
app.post('/api/v1/notifications/token', auth, (_req, res) => res.sendStatus(201));
app.patch('/api/v1/notifications/:id/read', auth, (_req, res) => res.sendStatus(204));

// ─── GAMING WRAPPED ──────────────────────────────────────────────────────────

app.get('/api/v1/wrapped/:year', auth, (req, res) => {
  const year = parseInt(req.params.year);
  if (year === 2024) return res.json(WRAPPED_2024);
  res.json({ year, totalAchievements: 0, totalXpGained: 0, topGame: null, rarestAchievement: null, bestStreak: 0, previousYear: null });
});

// ─── SUSCRIPCIÓN ─────────────────────────────────────────────────────────────

app.get('/api/v1/subscriptions/me', auth, (_req, res) => {
  res.json({ active: false, plan: null, provider: null, expiresAt: null });
});
app.post('/api/v1/subscriptions/verify-google', auth, (_req, res) => {
  res.json({ success: true, message: 'Mock: suscripción verificada' });
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────

app.get('/api/v1/admin/stats', auth, (_req, res) => {
  res.json({ totalUsers: 42, totalGames: MOCK_GAMES.length, totalAchievements: 3200 });
});

// ─── ARRANQUE ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     UnlockHub — Servidor Mock Completo       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  URL:      http://localhost:${PORT}              ║`);
  console.log('║                                              ║');
  console.log('║  CUENTA DE PRUEBA                            ║');
  console.log('║  Email:    demo@unlockhub.test               ║');
  console.log('║  Password: Demo1234!                         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Recuerda ejecutar en otro terminal:         ║');
  console.log('║  adb reverse tcp:3000 tcp:3000               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
