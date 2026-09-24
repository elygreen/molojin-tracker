// Pure helpers that turn Riot API payloads into the slim shape stored in
// public/data/<player>.json. Kept separate from the network code so they can be
// exercised without an API key.

export const SOLO_QUEUE_ID = 420;

const TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX_BASE = TIERS.indexOf('MASTER') * 400;

/** Maps a rank onto one continuous LP scale so gains across promotions can be diffed. */
export function absoluteLp({ tier, rank, lp }) {
  const tierIndex = TIERS.indexOf(tier);
  if (tierIndex < 0) return null;
  if (tierIndex >= TIERS.indexOf('MASTER')) return APEX_BASE + lp;
  return tierIndex * 400 + DIVISIONS.indexOf(rank) * 100 + lp;
}

function slimParticipant(p) {
  return {
    puuid: p.puuid,
    gameName: p.riotIdGameName ?? p.summonerName ?? '',
    tagLine: p.riotIdTagline ?? '',
    champion: p.championName,
    teamId: p.teamId,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
  };
}

/** Returns the stored representation of a ranked solo match, or null if it is not one. */
export function slimMatch(match, puuid) {
  const { info, metadata } = match;
  if (info.queueId !== SOLO_QUEUE_ID) return null;

  const me = info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;

  const teamKills = info.participants
    .filter((p) => p.teamId === me.teamId)
    .reduce((sum, p) => sum + p.kills, 0);
  const primary = me.perks?.styles?.[0];
  const secondary = me.perks?.styles?.[1];
  const multikill =
    me.pentaKills > 0
      ? 'Penta Kill'
      : me.quadraKills > 0
        ? 'Quadra Kill'
        : me.tripleKills > 0
          ? 'Triple Kill'
          : me.doubleKills > 0
            ? 'Double Kill'
            : null;

  // Riot reports gameDuration in seconds for all current matches.
  const durationSec = info.gameDuration;

  return {
    matchId: metadata.matchId,
    gameStart: info.gameStartTimestamp ?? info.gameCreation,
    durationSec,
    patch: (info.gameVersion ?? '').split('.').slice(0, 2).join('.'),
    remake: Boolean(me.gameEndedInEarlySurrender),
    win: me.win,
    champion: me.championName,
    champLevel: me.champLevel,
    position: me.teamPosition || me.individualPosition || '',
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    cs: (me.totalMinionsKilled ?? 0) + (me.neutralMinionsKilled ?? 0),
    gold: me.goldEarned,
    damage: me.totalDamageDealtToChampions,
    visionScore: me.visionScore,
    controlWards: me.visionWardsBoughtInGame ?? 0,
    killParticipation: teamKills > 0 ? (me.kills + me.assists) / teamKills : 0,
    multikill,
    items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5],
    trinket: me.item6,
    spells: [me.summoner1Id, me.summoner2Id],
    keystone: primary?.selections?.[0]?.perk ?? null,
    primaryStyle: primary?.style ?? null,
    secondaryStyle: secondary?.style ?? null,
    teamId: me.teamId,
    participants: info.participants.map(slimParticipant),
    lpChange: null,
  };
}

/** Pulls the RANKED_SOLO_5x5 entry out of a league-v4 entries response. */
export function soloRankFrom(entries) {
  const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
  if (!solo) return null;
  return {
    tier: solo.tier,
    rank: solo.rank,
    lp: solo.leaguePoints,
    wins: solo.wins,
    losses: solo.losses,
    hotStreak: Boolean(solo.hotStreak),
  };
}

/**
 * Riot does not expose LP per game. When exactly one ranked game was played
 * between two rank snapshots, the snapshot difference is that game's LP change.
 */
export function inferLpChange(prev, next, newMatches) {
  if (!prev || !next) return;
  const gamesBetween = next.wins + next.losses - (prev.wins + prev.losses);
  // Backfilled matches from before the previous snapshot can't be the game in between.
  const counted = newMatches.filter((m) => !m.remake && m.gameStart > prev.t);
  if (gamesBetween !== 1 || counted.length !== 1) return;
  const before = absoluteLp(prev);
  const after = absoluteLp(next);
  if (before === null || after === null) return;
  counted[0].lpChange = after - before;
}
