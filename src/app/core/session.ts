import { absoluteLp } from './format';
import { Match, PlayerData } from './models';

/** Games belong to one session while each starts within this long of the one before ending. */
const SESSION_GAP_MS = 90 * 60 * 1000;
/** With no game ending this recently, nobody is playing. */
const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface Session {
  /** The session's games, newest first, remakes included. */
  games: Match[];
  wins: number;
  losses: number;
  /** LP gained or lost over the session; null when it can't be worked out. */
  lp: number | null;
  startedAt: number;
}

function endOf(m: Match): number {
  return m.gameStart + m.durationSec * 1000;
}

/**
 * The run of back-to-back games being played right now, or null when the newest game ended more
 * than two hours ago. `matches` is newest first, as stored.
 */
export function currentSession(data: PlayerData, now = Date.now()): Session | null {
  const matches = data.matches;
  if (!matches.length || now - endOf(matches[0]) > ACTIVE_WINDOW_MS) return null;

  let last = 0;
  while (
    last + 1 < matches.length &&
    matches[last].gameStart - endOf(matches[last + 1]) <= SESSION_GAP_MS
  ) {
    last++;
  }
  const games = matches.slice(0, last + 1);
  const counted = games.filter((m) => !m.remake);
  const startedAt = games[games.length - 1].gameStart;
  return {
    games,
    wins: counted.filter((m) => m.win).length,
    losses: counted.filter((m) => !m.win).length,
    lp: sessionLp(data, games, startedAt),
    startedAt,
  };
}

/**
 * Rank now against the last rank recorded before the session began, which also covers promotions
 * and demotions. Without a snapshot that old, the per-game changes are added up if every game has one.
 */
function sessionLp(data: PlayerData, games: Match[], startedAt: number): number | null {
  const before = data.rankHistory.filter((s) => s.t <= startedAt).at(-1);
  const rank = data.soloRank;
  if (before && rank) {
    return (
      absoluteLp(rank.tier, rank.rank, rank.lp) - absoluteLp(before.tier, before.rank, before.lp)
    );
  }
  const counted = games.filter((m) => !m.remake);
  if (counted.length && counted.every((m) => m.lpChange !== null)) {
    return counted.reduce((sum, m) => sum + (m.lpChange ?? 0), 0);
  }
  return null;
}
