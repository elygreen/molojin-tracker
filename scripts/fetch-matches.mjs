// Pulls ranked solo queue history for every player in public/players.json and
// writes it to public/data/<id>.json. Runs in GitHub Actions with the Riot API
// key supplied through the RIOT_API_KEY secret — the key never ships to the site.
//
//   RIOT_API_KEY=... node scripts/fetch-matches.mjs
//
// Optional env: MAX_DOWNLOADS (default 150) caps match downloads per player per
// run to keep runs a few minutes long (requests are paced for dev-key limits);
// later runs keep backfilling until MAX_HISTORY (default 600, enough for a full
// season so season stats stay complete) matches are stored.
// MAX_RANK_LOOKUPS (default 90) caps the extra per-player rank lookups the same way.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferLpChange,
  MATCH_SCHEMA_VERSION,
  slimMatch,
  soloRankFrom,
  SOLO_QUEUE_ID,
} from './transform.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYERS_FILE = join(ROOT, 'public', 'players.json');
const DATA_DIR = join(ROOT, 'public', 'data');

const API_KEY = process.env.RIOT_API_KEY;
const MAX_DOWNLOADS = Number(process.env.MAX_DOWNLOADS ?? 150);
const MAX_HISTORY = Number(process.env.MAX_HISTORY ?? 600);
const MAX_RANK_LOOKUPS = Number(process.env.MAX_RANK_LOOKUPS ?? 90);
// Development keys allow 100 requests / 2 minutes; 1.3s spacing stays under it.
const MIN_REQUEST_GAP_MS = 1300;

if (!API_KEY) {
  console.error('RIOT_API_KEY is not set.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequestAt = 0;

async function riot(url, attempt = 0) {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const res = await fetch(url, { headers: { 'X-Riot-Token': API_KEY } });
  if (res.ok) return res.json();

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const retryAfter = Number(res.headers.get('retry-after') ?? 0);
    const backoff = Math.max(retryAfter * 1000, 2000 * 2 ** attempt);
    console.warn(`  ${res.status} on ${url} — retrying in ${backoff / 1000}s`);
    await sleep(backoff);
    return riot(url, attempt + 1);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Riot API rejected the key (${res.status}). Development keys expire every 24h — ` +
        'regenerate it at developer.riotgames.com and update the RIOT_API_KEY secret.',
    );
  }
  throw new Error(`Riot API ${res.status} for ${url}: ${await res.text()}`);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function listSoloMatchIds(region, puuid) {
  const ids = [];
  for (let start = 0; start < MAX_HISTORY; start += 100) {
    const count = Math.min(100, MAX_HISTORY - start);
    const page = await riot(
      `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids` +
        `?queue=${SOLO_QUEUE_ID}&type=ranked&start=${start}&count=${count}`,
    );
    ids.push(...page);
    if (page.length < count) break;
  }
  return ids;
}

async function updatePlayer(player) {
  const { id, gameName, tagLine, platform, region } = player;
  const file = join(DATA_DIR, `${id}.json`);
  const existing = await readJson(file, null);
  console.log(`\n${gameName}#${tagLine} (${platform})`);

  const account = await riot(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
  const { puuid } = account;
  const summoner = await riot(
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
  );
  const entries = await riot(
    `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`,
  );
  const soloRank = soloRankFrom(entries);

  // A changed puuid means a different account; start that player's history fresh.
  const known = existing?.profile?.puuid === puuid ? existing.matches : [];
  const knownIds = new Set(known.map((m) => m.matchId));
  const missing = (await listSoloMatchIds(region, puuid)).filter((mid) => !knownIds.has(mid));
  // Matches saved under an older shape are re-downloaded, newest first, after new ones.
  const outdated = known.filter((m) => (m.v ?? 1) < MATCH_SCHEMA_VERSION).map((m) => m.matchId);
  const toFetch = [...missing, ...outdated].slice(0, MAX_DOWNLOADS);
  console.log(
    `  ${missing.length} new, ${outdated.length} outdated match(es); downloading ${toFetch.length}`,
  );

  const fresh = [];
  for (const matchId of toFetch) {
    const slim = slimMatch(await riot(`https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}`), puuid);
    if (slim) fresh.push(slim);
  }

  // LP changes are inferred at fetch time and can't be rebuilt, so upgrades keep them.
  const previous = new Map(known.map((m) => [m.matchId, m]));
  const upgraded = new Set();
  for (const m of fresh) {
    const old = previous.get(m.matchId);
    if (old) {
      m.lpChange = old.lpChange;
      // Ranks already looked up for this game carry over too.
      for (const p of m.participants) {
        const before = old.participants.find((o) => o.puuid === p.puuid);
        if (before?.soloTier !== undefined) p.soloTier = before.soloTier;
      }
      upgraded.add(m.matchId);
    }
  }
  const newMatches = fresh.filter((m) => !upgraded.has(m.matchId));

  const now = Date.now();
  const history = existing?.profile?.puuid === puuid ? (existing.rankHistory ?? []) : [];
  const prevSnapshot = history.at(-1) ?? null;
  const snapshot = soloRank && { t: now, ...soloRank };
  if (snapshot) {
    inferLpChange(prevSnapshot, snapshot, newMatches);
    const changed =
      !prevSnapshot ||
      ['tier', 'rank', 'lp', 'wins', 'losses'].some((k) => prevSnapshot[k] !== snapshot[k]);
    if (changed) history.push(snapshot);
  }

  const matches = [...fresh, ...known.filter((m) => !upgraded.has(m.matchId))]
    .sort((a, b) => b.gameStart - a.gameStart)
    .slice(0, MAX_HISTORY);

  await fillParticipantRanks(matches, new Set(newMatches.map((m) => m.matchId)), platform);

  const data = {
    updatedAt: new Date(now).toISOString(),
    profile: {
      puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
    },
    soloRank,
    rankHistory: history,
    matches,
  };
  await writeFile(file, JSON.stringify(data) + '\n');
  console.log(`  stored ${matches.length} match(es)`);
}

/**
 * Tags every player in every game with their solo rank ("DIAMOND I", or null
 * when unranked) for the expanded scoreboard. Riot only exposes current rank,
 * so this is each player's rank when looked up. Brand-new games always get a
 * fresh lookup; older games reuse a rank already known for that player and
 * otherwise fill in newest first, MAX_RANK_LOOKUPS per run.
 */
async function fillParticipantRanks(matches, newIds, platform) {
  const known = new Map();
  for (const m of matches) {
    for (const p of m.participants) {
      if (p.soloTier !== undefined && !known.has(p.puuid)) known.set(p.puuid, p.soloTier);
    }
  }
  const fresh = new Map();
  let lookups = 0;
  const lookup = async (puuid) => {
    if (fresh.has(puuid)) return fresh.get(puuid);
    if (lookups >= MAX_RANK_LOOKUPS) return undefined;
    lookups++;
    try {
      const solo = soloRankFrom(
        await riot(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`),
      );
      const tier = solo ? (APEX_TIERS.has(solo.tier) ? solo.tier : `${solo.tier} ${solo.rank}`) : null;
      fresh.set(puuid, tier);
      return tier;
    } catch (err) {
      console.warn(`  rank lookup failed: ${err.message}`);
      return undefined;
    }
  };

  // matches is newest first.
  for (const m of matches) {
    const isNew = newIds.has(m.matchId);
    for (const p of m.participants) {
      if (p.soloTier !== undefined && !isNew) continue;
      const tier = isNew || !known.has(p.puuid) ? await lookup(p.puuid) : known.get(p.puuid);
      if (tier !== undefined) p.soloTier = tier;
    }
  }
  console.log(`  looked up ${lookups} player rank(s)`);
}

const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

const players = await readJson(PLAYERS_FILE, []);
await mkdir(DATA_DIR, { recursive: true });

let failures = 0;
for (const player of players) {
  try {
    await updatePlayer(player);
  } catch (err) {
    failures++;
    console.error(`  failed: ${err.message}`);
  }
}
if (failures === players.length && players.length > 0) process.exit(1);
