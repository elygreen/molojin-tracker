import { absoluteLp } from './format';
import { Match, PlayerData } from './models';
import { LiveUpdate } from './tracker-data.service';

/**
 * Folds a live update into the page's data the same way the fetch script
 * would: new games are added and a rank snapshot is added when the rank moved.
 * Games already on the page are kept as they are: the stored copies carry
 * per-player ranks (and builds) that the Worker's copies don't.
 */
export function mergeUpdate(data: PlayerData, update: LiveUpdate): { data: PlayerData; added: number } {
  const byId = new Map(data.matches.map((m) => [m.matchId, m]));
  const knownTiers = knownPlayerTiers(data.matches);
  const added: Match[] = [];
  for (const m of update.matches) {
    if (byId.has(m.matchId)) continue;
    const game = withKnownTiers(m, knownTiers);
    byId.set(m.matchId, game);
    added.push(game);
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

/** Each player's most recently stored solo rank, by puuid; matches are newest first. */
function knownPlayerTiers(matches: Match[]): Map<string, string | null> {
  const tiers = new Map<string, string | null>();
  for (const m of matches) {
    for (const p of m.participants) {
      if (p.soloTier !== undefined && !tiers.has(p.puuid)) tiers.set(p.puuid, p.soloTier);
    }
  }
  return tiers;
}

/**
 * The Worker doesn't look up ranks, so a brand-new game borrows any rank
 * already known for the same players until the next scheduled fetch fills it in.
 */
function withKnownTiers(match: Match, tiers: Map<string, string | null>): Match {
  return {
    ...match,
    participants: match.participants.map((p) =>
      p.soloTier === undefined && tiers.has(p.puuid) ? { ...p, soloTier: tiers.get(p.puuid) } : p,
    ),
  };
}
