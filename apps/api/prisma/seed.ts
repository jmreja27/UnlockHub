import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Calcula puntos normalizados a partir de la rareza (% de jugadores que lo tienen)
function normalizedPts(rarityPct: number): number {
  if (rarityPct >= 80) return 10;
  if (rarityPct >= 50) return 20;
  if (rarityPct >= 20) return 50;
  if (rarityPct >= 10) return 75;
  if (rarityPct >= 5)  return 100;
  if (rarityPct >= 1)  return 200;
  return 400;
}

// Catálogo de juegos Steam con sus logros
const STEAM_GAMES: Array<{
  externalId: string;
  title: string;
  iconUrl: string;
  headerUrl: string;
  achievements: Array<{ externalId: string; title: string; description: string; rarity: number }>;
}> = [
  {
    externalId: '220',
    title: 'Half-Life 2',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/220/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/220/header.jpg',
    achievements: [
      { externalId: 'HL2_BEAT_GAME', title: 'What Cat?', description: 'Finish Half-Life 2.', rarity: 42.3 },
      { externalId: 'HL2_BEAT_ANTICITIZEN1', title: 'A Red Letter Day', description: 'Finish the chapter "Red Letter Day".', rarity: 61.2 },
      { externalId: 'HL2_KILL_ENEMIES_WITH_SAWBLADE', title: 'Zombie Chopper', description: 'Play through Ravenholm using only the Gravity Gun.', rarity: 12.4 },
      { externalId: 'HL2_KILL_COMBINING_ADVISOR', title: 'Anchor\'s Aweigh!', description: 'Kill an enemy with a barnacle.', rarity: 24.7 },
      { externalId: 'HL2_FIND_ALL_LAMBDA', title: 'Lambda Locator', description: 'Find all Lambda caches in Half-Life 2.', rarity: 3.1 },
    ],
  },
  {
    externalId: '400',
    title: 'Portal',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/400/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg',
    achievements: [
      { externalId: 'PORTAL_BEAT_GAME', title: 'Fratricide', description: 'Do whatever it takes to survive.', rarity: 52.1 },
      { externalId: 'PORTAL_BEAT_ADV_CHAMBERS', title: 'Curiousity Captured the Cat', description: 'Complete all six advanced test chambers.', rarity: 7.8 },
      { externalId: 'PORTAL_BEAT_TWO_PLUS_TWO', title: 'Overclocker', description: 'Complete Test Chamber 18 in 70 seconds.', rarity: 14.3 },
      { externalId: 'PORTAL_TRANSMISSION_RECEIVED', title: 'Transmission Received', description: 'Discover the hidden messages.', rarity: 2.9 },
    ],
  },
  {
    externalId: '620',
    title: 'Portal 2',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/620/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg',
    achievements: [
      { externalId: 'SP_COMPLETE', title: 'The Part Where He Kills You', description: 'This is that part.', rarity: 55.7 },
      { externalId: 'COOP_COMPLETE', title: 'Friends List With Benefits', description: 'Complete all co-op courses.', rarity: 18.4 },
      { externalId: 'SP_SAVE_FIVE_TURRETS', title: 'Fratricide', description: 'Save a turret from going through a material emancipation grid.', rarity: 21.6 },
      { externalId: 'SP_WAKE_UP', title: 'Wake Up Call', description: 'Survive the manual override.', rarity: 72.3 },
      { externalId: 'SP_COMPLETE_SPEEDRUN', title: 'Speed of Science', description: 'Complete Test Shaft 09 in 60 seconds.', rarity: 6.2 },
    ],
  },
  {
    externalId: '413150',
    title: 'Stardew Valley',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg',
    achievements: [
      { externalId: 'GRANDPA_EVALUATION', title: 'A Complete Harvest', description: 'Complete the Grandpa Evaluation with a perfect score.', rarity: 16.8 },
      { externalId: 'COMMUNITY_CENTER', title: 'Local Legend', description: 'Complete the Community Center.', rarity: 32.4 },
      { externalId: 'SHIPPING_ALL_ITEMS', title: 'Full Shipment', description: 'Ship every item in the game.', rarity: 5.1 },
      { externalId: 'LEVEL_10_COMBAT', title: 'Danger In The Deep', description: 'Reach Level 10 Combat.', rarity: 44.7 },
      { externalId: 'ALL_COOKING_RECIPES', title: 'Sous Chef', description: 'Cook every recipe.', rarity: 8.3 },
      { externalId: 'CATCH_EVERY_FISH', title: 'Mother Catch', description: 'Catch every type of fish.', rarity: 7.6 },
    ],
  },
  {
    externalId: '105600',
    title: 'Terraria',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/105600/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg',
    achievements: [
      { externalId: 'DEFEAT_MOONLORD', title: 'Obsessive Devotion', description: 'Defeat the Moon Lord.', rarity: 22.5 },
      { externalId: 'KILL_PLANTERA', title: 'Lihzahrd', description: 'Defeat Plantera.', rarity: 31.7 },
      { externalId: 'HARD_MODE', title: 'It\'s Hard!', description: 'Kill the Wall of Flesh, thus unleashing Hardmode.', rarity: 41.2 },
      { externalId: 'DEFEAT_ALL_BOSSES', title: 'Champion of Terraria', description: 'Defeat all bosses.', rarity: 4.3 },
      { externalId: 'GET_ALL_ITEMS', title: 'Slayer of Worlds', description: 'Defeat every boss in the game.', rarity: 3.8 },
    ],
  },
  {
    externalId: '367520',
    title: 'Hollow Knight',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/367520/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/367520/header.jpg',
    achievements: [
      { externalId: 'HK_COMPLETE_GAME', title: 'Sealed Siblings', description: 'Reveal the true nature of the Hollow Knight.', rarity: 30.1 },
      { externalId: 'HK_TRUE_ENDING', title: 'Pure Vessel', description: 'Bind the Hollow Knight to the Seal of Binding.', rarity: 14.2 },
      { externalId: 'HK_DREAM_NAIL', title: 'Dream Master', description: 'Obtain the Dream Nail.', rarity: 40.8 },
      { externalId: 'HK_PANTHEON_5', title: 'Embrace the Void', description: 'Complete the Pantheon of Hallownest.', rarity: 1.9 },
      { externalId: 'HK_110_PERCENT', title: '112%', description: 'Attain 112% game completion.', rarity: 2.4 },
      { externalId: 'HK_COMPLETE_RADIANCE', title: 'Delicate Flower', description: 'Obtain the Radiant achievement.', rarity: 4.7 },
    ],
  },
  {
    externalId: '374320',
    title: 'Dark Souls III',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/374320/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/374320/header.jpg',
    achievements: [
      { externalId: 'DS3_CLEAR_GAME', title: 'The End of Fire', description: 'Reach "The End of Fire" ending.', rarity: 24.6 },
      { externalId: 'DS3_ALL_RINGS', title: 'Master of Rings', description: 'Acquire all rings.', rarity: 3.2 },
      { externalId: 'DS3_ALL_WEAPONS', title: 'Master of Infusion', description: 'Perform all forms of infusion.', rarity: 5.4 },
      { externalId: 'DS3_BOSS_YHORM', title: 'Yhorm the Giant', description: 'Defeat Yhorm the Giant, Lord of Cinder.', rarity: 35.7 },
      { externalId: 'DS3_BOSS_NAMELESS', title: 'Nameless King', description: 'Defeat the Nameless King.', rarity: 28.9 },
    ],
  },
  {
    externalId: '1245620',
    title: 'Elden Ring',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/header.jpg',
    achievements: [
      { externalId: 'ER_ERDTREE', title: 'Elden Ring', description: 'Become the Elden Lord. Arise, Lord of Chaos.', rarity: 31.4 },
      { externalId: 'ER_DRAGON', title: 'Lichdragon Fortissax', description: 'Defeat Lichdragon Fortissax.', rarity: 18.3 },
      { externalId: 'ER_MALENIA', title: 'Malenia the Severed', description: 'Defeat Malenia, Blade of Miquella.', rarity: 22.7 },
      { externalId: 'ER_MALIKETH', title: 'Maliketh the Black Blade', description: 'Defeat Maliketh, the Black Blade.', rarity: 38.6 },
      { externalId: 'ER_ALL_REMEMBRANCE', title: 'Shardbearer Morgott', description: 'Defeat Shardbearer Morgott.', rarity: 45.1 },
    ],
  },
  {
    externalId: '1145360',
    title: 'Hades',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1145360/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1145360/header.jpg',
    achievements: [
      { externalId: 'HADES_CLEAR_1', title: 'Escaped Tartarus', description: 'You made it out of Tartarus for the first time.', rarity: 62.3 },
      { externalId: 'HADES_CLEAR_10', title: 'Escaped Elysium', description: 'You made it out of the final boss.', rarity: 40.7 },
      { externalId: 'HADES_FULL_CLEAR', title: 'Escaped Hades', description: 'Clear the full game.', rarity: 21.4 },
      { externalId: 'HADES_HEAT_32', title: 'Conquered Hades', description: 'Escape at Heat 32.', rarity: 4.8 },
      { externalId: 'HADES_TRUE_ENDING', title: 'Final Witness', description: 'See the true ending.', rarity: 11.2 },
    ],
  },
  {
    externalId: '504230',
    title: 'Celeste',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/504230/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/504230/header.jpg',
    achievements: [
      { externalId: 'CELESTE_CLEAR', title: 'Reach the Summit', description: 'Beat the game.', rarity: 50.3 },
      { externalId: 'CELESTE_ALL_BERRIES', title: 'Strawberry Jam', description: 'Collect 175 strawberries.', rarity: 6.1 },
      { externalId: 'CELESTE_ALL_CRYST', title: 'Crystal Heart Collector', description: 'Collect all Crystal Hearts.', rarity: 8.9 },
      { externalId: 'CELESTE_FAREWELL', title: 'A Farewell', description: 'Complete the farewell chapter.', rarity: 13.7 },
    ],
  },
  {
    externalId: '588650',
    title: 'Dead Cells',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/588650/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/588650/header.jpg',
    achievements: [
      { externalId: 'DC_KILL_BOSS', title: 'The Hand of the King', description: 'Kill the Hand of the King.', rarity: 36.2 },
      { externalId: 'DC_5BC', title: '5 Boss Cells', description: 'Complete a run with 5 Boss Cells active.', rarity: 7.4 },
      { externalId: 'DC_NO_HIT', title: 'Flawless', description: 'Kill a boss without taking damage.', rarity: 32.8 },
      { externalId: 'DC_ALL_WEAPONS', title: 'Master Collector', description: 'Collect all scrolls.', rarity: 4.5 },
    ],
  },
  {
    externalId: '268910',
    title: 'Cuphead',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/268910/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/268910/header.jpg',
    achievements: [
      { externalId: 'CH_ALL_BOSSES', title: 'Good Dog', description: 'Defeat a boss without getting hit.', rarity: 29.6 },
      { externalId: 'CH_EXPERT', title: 'It\'s Expert, Pal!', description: 'Clear a boss on Expert mode.', rarity: 18.4 },
      { externalId: 'CH_PACIFIST', title: 'Pacifist', description: 'Clear a platforming run without firing.', rarity: 6.7 },
      { externalId: 'CH_ALL_GRADES', title: 'Aces High', description: 'Earn an A-Rank on all bosses.', rarity: 3.9 },
    ],
  },
  {
    externalId: '292030',
    title: 'The Witcher 3: Wild Hunt',
    iconUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/292030/capsule_sm_120.jpg',
    headerUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/292030/header.jpg',
    achievements: [
      { externalId: 'W3_FINISH_GAME', title: 'Something More', description: 'Finish the game on Death March! difficulty.', rarity: 9.3 },
      { externalId: 'W3_MAX_LEVEL', title: 'Master Marksman', description: 'Reach character level 35.', rarity: 23.1 },
      { externalId: 'W3_FIND_CIRI', title: 'Skilled Hunter', description: 'Kill 50 enemies using crossbow.', rarity: 17.8 },
      { externalId: 'W3_GOOD_ENDING', title: 'Kingmaker', description: 'Help Ciri become a witcher.', rarity: 11.4 },
      { externalId: 'W3_COMPLETE_BLOOD_WINE', title: 'Touissant Mutton Leg', description: 'Complete Blood and Wine.', rarity: 27.6 },
    ],
  },
];

// Catálogo de juegos RetroAchievements con sus logros
const RA_GAMES: Array<{
  externalId: string;
  title: string;
  iconUrl: string;
  achievements: Array<{ externalId: string; title: string; description: string; rarity: number }>;
}> = [
  {
    externalId: '1448',
    title: 'Sonic the Hedgehog',
    iconUrl: 'https://media.retroachievements.org/Images/021991.png',
    achievements: [
      { externalId: '9371', title: 'Spring Yard Champion', description: 'Complete Spring Yard Zone without losing a life.', rarity: 23.4 },
      { externalId: '9372', title: 'Sky High', description: 'Complete Star Light Zone.', rarity: 35.7 },
      { externalId: '9373', title: 'Chaos Emerald Collector', description: 'Collect all 6 Chaos Emeralds.', rarity: 12.1 },
      { externalId: '9374', title: 'Scrap Brain Survivor', description: 'Complete Scrap Brain Zone.', rarity: 27.8 },
      { externalId: '9375', title: 'Speed Demon', description: 'Complete Green Hill Zone in under 30 seconds.', rarity: 4.6 },
    ],
  },
  {
    externalId: '1986',
    title: 'Mega Man 2',
    iconUrl: 'https://media.retroachievements.org/Images/015974.png',
    achievements: [
      { externalId: '14569', title: 'Air Man Got None', description: 'Beat Air Man without getting hit.', rarity: 8.3 },
      { externalId: '14570', title: 'Metal Man Down', description: 'Defeat Metal Man.', rarity: 48.2 },
      { externalId: '14571', title: 'Wood Man Cleared', description: 'Defeat Wood Man.', rarity: 51.4 },
      { externalId: '14572', title: 'Dr. Wily Defeated', description: 'Beat the final boss.', rarity: 31.7 },
      { externalId: '14573', title: 'All Stages Clear', description: 'Clear all 8 robot masters without using energy tanks.', rarity: 3.2 },
    ],
  },
  {
    externalId: '228',
    title: 'The Legend of Zelda',
    iconUrl: 'https://media.retroachievements.org/Images/000097.png',
    achievements: [
      { externalId: '1814', title: 'Quest Complete', description: 'Save Zelda and complete the first quest.', rarity: 28.6 },
      { externalId: '1815', title: 'Triforce of Wisdom', description: 'Collect all 8 pieces of the Triforce.', rarity: 41.3 },
      { externalId: '1816', title: 'Second Quest', description: 'Complete the second quest.', rarity: 11.8 },
      { externalId: '1817', title: 'Bomb Expert', description: 'Find all Bomb upgrades.', rarity: 18.5 },
    ],
  },
  {
    externalId: '631',
    title: 'Chrono Trigger',
    iconUrl: 'https://media.retroachievements.org/Images/052266.png',
    achievements: [
      { externalId: '5253', title: 'Savior of Time', description: 'Defeat Lavos and save the world.', rarity: 27.4 },
      { externalId: '5254', title: 'All Endings', description: 'Witness all 12 endings.', rarity: 4.7 },
      { externalId: '5255', title: 'Level 99', description: 'Reach level 99 with any character.', rarity: 6.3 },
      { externalId: '5256', title: 'Frog Knight', description: 'Complete Frog\'s sidequest.', rarity: 22.9 },
      { externalId: '5257', title: 'New Game+', description: 'Complete New Game+ mode.', rarity: 8.1 },
    ],
  },
  {
    externalId: '249',
    title: 'Super Metroid',
    iconUrl: 'https://media.retroachievements.org/Images/003088.png',
    achievements: [
      { externalId: '2018', title: 'Ridley Defeated', description: 'Defeat Ridley.', rarity: 42.1 },
      { externalId: '2019', title: 'Kraid Defeated', description: 'Defeat Kraid.', rarity: 56.3 },
      { externalId: '2020', title: 'Zebes Escape', description: 'Escape Zebes in under 3 minutes.', rarity: 7.2 },
      { externalId: '2021', title: 'All Bosses', description: 'Defeat all main bosses without using saves.', rarity: 3.6 },
      { externalId: '2022', title: '100% Items', description: 'Collect all items.', rarity: 9.8 },
    ],
  },
  {
    externalId: '571',
    title: 'Final Fantasy VI',
    iconUrl: 'https://media.retroachievements.org/Images/025947.png',
    achievements: [
      { externalId: '4831', title: 'Kefka Defeated', description: 'Defeat the God of Magic.', rarity: 24.3 },
      { externalId: '4832', title: 'Gau Recruits', description: 'Recruit Gau on the Veldt.', rarity: 38.7 },
      { externalId: '4833', title: 'Auction Winner', description: 'Win the Auction House.', rarity: 19.4 },
      { externalId: '4834', title: 'Esper Master', description: 'Acquire every Esper.', rarity: 5.9 },
      { externalId: '4835', title: 'Coliseum Champion', description: 'Win 10 Coliseum battles.', rarity: 12.6 },
    ],
  },
  {
    externalId: '1148',
    title: 'Castlevania: Symphony of the Night',
    iconUrl: 'https://media.retroachievements.org/Images/060588.png',
    achievements: [
      { externalId: '9820', title: 'Richter Mode Unlocked', description: 'Unlock Richter Mode.', rarity: 19.8 },
      { externalId: '9821', title: 'True Ending', description: 'Defeat Dracula and see the true ending.', rarity: 22.5 },
      { externalId: '9822', title: 'Reverse Castle', description: 'Reach the Reverse Castle.', rarity: 30.1 },
      { externalId: '9823', title: 'All Relics', description: 'Collect all relics.', rarity: 7.3 },
      { externalId: '9824', title: '200.6%', description: 'Achieve 200.6% map completion.', rarity: 3.9 },
    ],
  },
  {
    externalId: '2402',
    title: 'Metal Gear Solid',
    iconUrl: 'https://media.retroachievements.org/Images/048969.png',
    achievements: [
      { externalId: '21504', title: 'Sneaking Mission Complete', description: 'Finish the game without being seen.', rarity: 5.7 },
      { externalId: '21505', title: 'Fox Hound', description: 'Defeat Psycho Mantis on Hard without the controller trick.', rarity: 8.4 },
      { externalId: '21506', title: 'All Codec Calls', description: 'Listen to all optional codec conversations.', rarity: 12.1 },
      { externalId: '21507', title: "Ocelot's Test", description: 'Defeat Revolver Ocelot.', rarity: 54.6 },
      { externalId: '21508', title: 'Big Boss Rank', description: 'Earn the Big Boss rank.', rarity: 2.8 },
    ],
  },
  {
    externalId: '7635',
    title: 'Super Mario Bros. 3',
    iconUrl: 'https://media.retroachievements.org/Images/054970.png',
    achievements: [
      { externalId: '68327', title: 'World 1 Complete', description: 'Complete World 1.', rarity: 71.2 },
      { externalId: '68328', title: 'All Worlds', description: 'Complete all 8 worlds.', rarity: 33.6 },
      { externalId: '68329', title: 'All P-Wings', description: 'Collect all P-Wings.', rarity: 8.9 },
      { externalId: '68330', title: 'Warp Zone Master', description: 'Find all Warp Whistles.', rarity: 16.4 },
      { externalId: '68331', title: 'Perfect Run', description: 'Complete the game without using a Warp Whistle.', rarity: 4.1 },
    ],
  },
  {
    externalId: '10434',
    title: 'Pokémon Red',
    iconUrl: 'https://media.retroachievements.org/Images/035093.png',
    achievements: [
      { externalId: '91742', title: 'Champion!', description: 'Become the Pokémon Champion.', rarity: 38.7 },
      { externalId: '91743', title: 'Pokédex 151', description: 'Complete the Pokédex with all 151 Pokémon.', rarity: 3.4 },
      { externalId: '91744', title: 'Mewtwo Caught', description: 'Catch Mewtwo.', rarity: 21.5 },
      { externalId: '91745', title: 'Safari Zone Expert', description: 'Catch all Pokémon available in the Safari Zone.', rarity: 9.2 },
    ],
  },
  {
    externalId: '355',
    title: 'Donkey Kong Country',
    iconUrl: 'https://media.retroachievements.org/Images/012610.png',
    achievements: [
      { externalId: '3047', title: 'K. Rool Defeated', description: 'Defeat King K. Rool.', rarity: 29.3 },
      { externalId: '3048', title: 'All KONG Letters', description: 'Collect every KONG letter in every level.', rarity: 7.6 },
      { externalId: '3049', title: '101%', description: 'Achieve 101% game completion.', rarity: 4.2 },
      { externalId: '3050', title: 'Animal Friends', description: 'Ride all animal friends.', rarity: 18.1 },
    ],
  },
];

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Usuario admin de demostración
  const passwordHash = await bcrypt.hash('Demo1234!', 12);
  await prisma.user.upsert({
    where: { email: 'demo@unlockhub.test' },
    update: {},
    create: {
      email: 'demo@unlockhub.test',
      username: 'demo',
      passwordHash,
      level: 5,
      xp: 2450,
      streakDays: 3,
      countryCode: 'ES',
    },
  });

  // Catálogo de juegos Steam
  let steamGamesUpserted = 0;
  let steamAchievementsUpserted = 0;

  for (const gameData of STEAM_GAMES) {
    const game = await prisma.game.upsert({
      where: { platform_externalId: { platform: 'STEAM', externalId: gameData.externalId } },
      update: {
        title: gameData.title,
        iconUrl: gameData.iconUrl,
        headerUrl: gameData.headerUrl,
        totalAchievements: gameData.achievements.length,
      },
      create: {
        platform: 'STEAM',
        externalId: gameData.externalId,
        title: gameData.title,
        iconUrl: gameData.iconUrl,
        headerUrl: gameData.headerUrl,
        totalAchievements: gameData.achievements.length,
      },
    });

    for (const ach of gameData.achievements) {
      await prisma.achievement.upsert({
        where: { platform_externalId: { platform: 'STEAM', externalId: ach.externalId } },
        update: {
          title: ach.title,
          description: ach.description,
          rarity: ach.rarity,
          normalizedPoints: normalizedPts(ach.rarity),
        },
        create: {
          gameId: game.id,
          platform: 'STEAM',
          externalId: ach.externalId,
          title: ach.title,
          description: ach.description,
          rarity: ach.rarity,
          normalizedPoints: normalizedPts(ach.rarity),
        },
      });
      steamAchievementsUpserted++;
    }
    steamGamesUpserted++;
  }

  // Catálogo de juegos RetroAchievements
  let raGamesUpserted = 0;
  let raAchievementsUpserted = 0;

  for (const gameData of RA_GAMES) {
    const game = await prisma.game.upsert({
      where: { platform_externalId: { platform: 'RA', externalId: gameData.externalId } },
      update: {
        title: gameData.title,
        iconUrl: gameData.iconUrl,
        totalAchievements: gameData.achievements.length,
      },
      create: {
        platform: 'RA',
        externalId: gameData.externalId,
        title: gameData.title,
        iconUrl: gameData.iconUrl,
        totalAchievements: gameData.achievements.length,
      },
    });

    for (const ach of gameData.achievements) {
      await prisma.achievement.upsert({
        where: { platform_externalId: { platform: 'RA', externalId: ach.externalId } },
        update: {
          title: ach.title,
          description: ach.description,
          rarity: ach.rarity,
          normalizedPoints: normalizedPts(ach.rarity),
        },
        create: {
          gameId: game.id,
          platform: 'RA',
          externalId: ach.externalId,
          title: ach.title,
          description: ach.description,
          rarity: ach.rarity,
          normalizedPoints: normalizedPts(ach.rarity),
        },
      });
      raAchievementsUpserted++;
    }
    raGamesUpserted++;
  }

  console.log(`✓ Admin user upserted`);
  console.log(`✓ Steam: ${steamGamesUpserted} games, ${steamAchievementsUpserted} achievements`);
  console.log(`✓ RA: ${raGamesUpserted} games, ${raAchievementsUpserted} achievements`);
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());