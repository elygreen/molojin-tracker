import { absoluteLp } from './format';
import { Match, PlayerData } from './models';
import { LiveUpdate } from './tracker-data.service';

/**
 * Folds a live update into the page's data the same way the fetch script
 * would: new games are added, re-fetched ones keep their inferred LP change,
 * and a rank snapshot is added when the rank moved.
 */
export function mergeUpdate(data: PlayerData, update: LiveUpdate): { data: PlayerData; added: number } {
  const byId = new Map(data.matches.map((m) => [m.matchId, m]));
  const added: Match[] = [];
  for (const m of update.matches) {
    const old = byId.get(m.matchId);
    if (old) {
      byId.set(m.matchId, { ...m, lpChange: old.lpChange });
    } else {
      byId.set(m.matchId, m);
      added.push(m);
    }
  }

  const history = [...data.rankHistory];
  const prev = history.at(-1);
  const rank = update.soloRank;
  if (rank) {
    const snapshot = { t: Date.parse(update.updatedAt), ...rank };
    const changed = !prev || (['tier', 'rank', 'lp', 'wins', 'losses'] as const).some((k) => prev[k] !== snapshot[k]);
    if (changed) {
      // Riot has no LP per game; with exactly one new game since the last
      // snapshot, the snapshot difference is that game's LP change.
      const counted = added.filter((m) => !m.remake && (!prev || m.gameStart > prev.t));
      if (prev && counted.length === 1 && snapshot.wins + snapshot.losses - (prev.wins + prev.losses) === 1) {
        counted[0].lpChange = absoluteLp(rank.tier, rank.rank, rank.lp) - absoluteLp(prev.tier, prev.rank, prev.lp);
      }
      history.push(snapshot);
    }
  }

  return {
    data: {
      ...data,
      updatedAt: update.updatedAt,
      profile: update.profile,
      soloRank: rank,
      rankHistory: history,
      matches: [...byId.values()].sort((a, b) => b.gameStart - a.gameStart),
    },
    added: added.length,
  };
}
