// TEMPORARY: prints v2-shaped data for recent matches so the verdict logic can be calibrated.
import { slimMatch } from './transform.mjs';
const KEY = process.env.RIOT_API_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function riot(url) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { headers: { 'X-Riot-Token': KEY } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * (i + 1)); continue; }
    throw new Error(`${res.status} ${url}`);
  }
}
const acct = await riot('https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Molojin/molo');
const ids = await riot(`https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${acct.puuid}/ids?queue=420&type=ranked&count=40`);
for (const extra of ['NA1_5648179782', 'NA1_5647142244']) if (!ids.includes(extra)) ids.push(extra);
for (const id of ids) {
  await sleep(1300);
  const m = slimMatch(await riot(`https://americas.api.riotgames.com/lol/match/v5/matches/${id}`), acct.puuid);
  if (!m) continue;
  const out = { id: m.matchId, win: m.win, dur: m.durationSec, remake: m.remake, me: acct.puuid.slice(0, 8), teams: m.teams,
    ps: m.participants.map(({ gameName, tagLine, puuid, ...p }) => ({ ...p, me: puuid === acct.puuid })) };
  console.log('SAMPLE ' + JSON.stringify(out));
}
