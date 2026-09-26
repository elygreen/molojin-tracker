// Cloudflare Worker behind the site's "Update" button.
//
//   GET /update?player=<id>&known=<newest match id the page already has>
//
// Pulls the player's latest ranked solo games straight from Riot and returns
// them in the same shape as public/data/<id>.json, so the page can merge them
// in immediately. The Riot key lives only here, as a Worker secret.
//
// Guards against abuse:
//  - only players listed in the site's players.json can be requested;
//  - each player's result is cached for COOLDOWN_SECONDS, so repeat clicks
//    (from anyone) are served from cache without touching Riot;
//  - the browser origin must be the site (or localhost for development).
//
// If a GITHUB_TOKEN secret is set, an update that finds a game newer than
// `known` also starts the "Update matches & deploy" workflow so they're saved to the
// site's data files straight away instead of on the next scheduled run.

import { slimMatch, soloRankFrom, SOLO_QUEUE_ID } from '../../scripts/transform.mjs';

const COOLDOWN_SECONDS = 60;
const RECENT_MATCHES = 10;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/update') {
      return json({ error: 'Not found' }, 404, cors);
    }
    if (origin && !cors['Access-Control-Allow-Origin']) {
      return json({ error: 'Origin not allowed' }, 403, cors);
    }

    const id = url.searchParams.get('player') ?? '';
    const player = (await loadPlayers(env)).find((p) => p.id === id);
    if (!player) return json({ error: `Unknown player "${id}"` }, 404, cors);

    // Serve a recent result for this player if there is one.
    const cache = caches.default;
    const cacheKey = new Request(`https://update-cache.internal/${encodeURIComponent(id)}`);
    const cached = await cache.match(cacheKey);
    if (cached) return withHeaders(cached, { ...cors, 'X-Update-Cache': 'hit' });

    let body;
    try {
      body = await fetchLatest(player, env);
    } catch (err) {
      const status = err.status === 429 ? 503 : 502;
      return json({ error: err.message }, status, cors);
    }

    // Save to the site only when Riot has a game the page didn't already have.
    const known = url.searchParams.get('known');
    if (env.GITHUB_TOKEN && body.matches.length && body.matches[0].matchId !== known) {
      ctx.waitUntil(dispatchWorkflow(env).catch((e) => console.error('workflow dispatch failed', e)));
      body.persisting = true;
    }

    const response = json(body, 200, { 'Cache-Control': `max-age=${COOLDOWN_SECONDS}` });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return withHeaders(response, { ...cors, 'X-Update-Cache': 'miss' });
  },
};

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return ok
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

async function loadPlayers(env) {
  const res = await fetch(new URL('players.json', env.SITE_URL), { cf: { cacheTtl: 300 } });
  return res.ok ? res.json() : [];
}

async function riot(url, env) {
  // Never cache Riot's answers: the key isn't part of the cache key, and puuids
  // are encrypted per key, so a cached lookup from an old key breaks a new one.
  const res = await fetch(url, { headers: { 'X-Riot-Token': env.RIOT_API_KEY }, cache: 'no-store' });
  if (res.ok) return res.json();
  const endpoint = new URL(url).pathname.split('/').slice(1, 4).join('/');
  const detail = await res
    .json()
    .then((b) => b?.status?.message ?? '')
    .catch(() => '');
  const err = new Error(
    res.status === 401 || res.status === 403
      ? 'Riot rejected the API key; it may have expired.'
      : res.status === 429
        ? 'Riot rate limit reached; try again in a minute.'
        : `Riot API error ${res.status} on ${endpoint}${detail ? `: ${detail}` : ''}`,
  );
  err.status = res.status;
  throw err;
}

async function fetchLatest(player, env) {
  const { gameName, tagLine, platform, region } = player;
  const account = await riot(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    env,
  );
  const { puuid } = account;
  const [summoner, entries, ids] = await Promise.all([
    riot(`https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`, env),
    riot(`https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`, env),
    riot(
      `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids` +
        `?queue=${SOLO_QUEUE_ID}&type=ranked&start=0&count=${RECENT_MATCHES}`,
      env,
    ),
  ]);

  // Small batches keep a burst well inside Riot's per-second limit.
  const matches = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(
      ids.slice(i, i + 5).map((mid) => riot(`https://${region}.api.riotgames.com/lol/match/v5/matches/${mid}`, env)),
    );
    for (const raw of batch) {
      const slim = slimMatch(raw, puuid);
      if (slim) matches.push(slim);
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    profile: {
      puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      platform,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
    },
    soloRank: soloRankFrom(entries),
    matches,
  };
}

async function dispatchWorkflow(env) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ranked-grind-update-worker',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function withHeaders(response, headers) {
  const r = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
}
