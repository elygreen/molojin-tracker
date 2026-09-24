import { Match, MatchParticipant, MatchTeam } from './models';

/**
 * Decides who won each game and why.
 *
 * 1. Every player gets a performance score. Each stat is turned into a
 *    z-score against the other nine players, then combined with weights for
 *    the player's role, so a support is judged on vision and utility and a
 *    carry on damage and farm.
 * 2. Each role is compared across the two teams: score difference plus the
 *    raw gold, kill-death and laning leads between the two players.
 * 3. The verdict reads those five lane gaps from the winners' side: one lane
 *    far ahead is "<Role> gap", every lane ahead is "Team gap", and winning
 *    while behind on gold or kills is "Comp gap".
 * 4. The tracked player is tagged "1v9" if they clearly carried a win and
 *    "Deserved" if they were the weakest link in a loss.
 */

export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';
export const ROLES: Role[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const ROLE_NAMES: Record<Role, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'Bot',
  UTILITY: 'Support',
};

type Metric = 'kda' | 'kp' | 'dmg' | 'gold' | 'cs' | 'vision' | 'tank' | 'obj' | 'util' | 'deaths';
type Weights = Record<Metric, number>;

// Deaths count against a player; everything else counts for them.
const WEIGHTS: Record<Role, Weights> = {
  TOP: { kda: 1, kp: 0.6, dmg: 1, gold: 0.8, cs: 0.7, vision: 0.2, tank: 0.6, obj: 0.6, util: 0.1, deaths: -0.8 },
  JUNGLE: { kda: 1, kp: 1, dmg: 0.7, gold: 0.7, cs: 0.3, vision: 0.5, tank: 0.4, obj: 0.9, util: 0.2, deaths: -0.8 },
  MIDDLE: { kda: 1, kp: 0.8, dmg: 1.1, gold: 0.8, cs: 0.7, vision: 0.2, tank: 0.2, obj: 0.4, util: 0.1, deaths: -0.8 },
  BOTTOM: { kda: 1, kp: 0.7, dmg: 1.2, gold: 0.9, cs: 0.8, vision: 0.2, tank: 0.1, obj: 0.5, util: 0.1, deaths: -0.8 },
  UTILITY: { kda: 0.9, kp: 1.1, dmg: 0.4, gold: 0.2, cs: 0, vision: 1, tank: 0.4, obj: 0.1, util: 0.8, deaths: -0.7 },
};

export interface PlayerScore {
  participant: MatchParticipant;
  role: Role;
  /** Weighted z-score; 0 is an average player in this game. */
  score: number;
  /** The score on a 0–10 scale for display. */
  rating: number;
}

export interface LaneGap {
  role: Role;
  winner: PlayerScore;
  loser: PlayerScore;
  /** How far the winning side's player was ahead; negative if behind. */
  gap: number;
}

export type VerdictKind = 'role' | 'bot' | 'team' | 'comp';

export interface MatchVerdict {
  kind: VerdictKind;
  /** e.g. "Mid gap", "Team gap", "Comp gap". */
  label: string;
  /** Set for single-lane verdicts. */
  role: Role | null;
  /** Whether the verdict went the tracked player's way. */
  forUs: boolean;
  /** Short plain-language reasons, most important first. */
  reasons: string[];
  lanes: LaneGap[];
  me: PlayerScore;
  tag: '1v9' | 'deserved' | null;
}

const has = (p: MatchParticipant) => p.gold !== undefined && p.damage !== undefined;

/** Returns null for remakes and for matches stored before full stats were saved. */
export function analyzeMatch(match: Match, puuid: string): MatchVerdict | null {
  const ps = match.participants;
  if (match.remake || ps.length !== 10 || !ps.every(has)) return null;

  const scores = scorePlayers(ps, Math.max(1, match.durationSec / 60));
  const me = scores.find((s) => s.participant.puuid === puuid);
  if (!me) return null;

  const winTeam = match.win ? me.participant.teamId : otherTeam(me.participant.teamId);
  const lanes = ROLES.map((role) => laneGap(role, scores, winTeam)).filter((l): l is LaneGap => l !== null);
  if (lanes.length !== 5) return null;

  const teams = teamTotals(match, winTeam);
  const decided = decide(lanes, teams);
  const tag = playerTag(me, scores, decided.role, lanes, match.win);

  return { ...decided, forUs: match.win, lanes, me, tag };
}

function otherTeam(teamId: number): number {
  return teamId === 100 ? 200 : 100;
}

function scorePlayers(ps: MatchParticipant[], minutes: number): PlayerScore[] {
  const teamSum = (teamId: number, f: (p: MatchParticipant) => number) =>
    ps.filter((p) => p.teamId === teamId).reduce((s, p) => s + f(p), 0);

  const raw = ps.map((p) => {
    const share = (f: (x: MatchParticipant) => number) => f(p) / Math.max(1, teamSum(p.teamId, f));
    const metrics: Record<Metric, number> = {
      kda: Math.log1p((p.kills + 0.7 * p.assists) / Math.max(1, p.deaths)),
      kp: (p.kills + p.assists) / Math.max(1, teamSum(p.teamId, (x) => x.kills)),
      dmg: share((x) => x.damage ?? 0),
      gold: (p.gold ?? 0) / minutes,
      cs: (p.cs ?? 0) / minutes,
      vision: (p.vision ?? 0) / minutes,
      tank: share((x) => x.taken ?? 0),
      obj: share((x) => x.objDamage ?? 0),
      // Roughly one second of crowd control per 150 health healed or shielded.
      util: ((p.support ?? 0) + (p.cc ?? 0) * 150) / minutes,
      deaths: p.deaths / minutes,
    };
    return { p, metrics };
  });

  const z = zScores(raw.map((r) => r.metrics));
  return raw.map(({ p }, i) => {
    const role = (ROLES.includes(p.position as Role) ? p.position : 'MIDDLE') as Role;
    const w = WEIGHTS[role];
    let sum = 0;
    let norm = 0;
    for (const m of Object.keys(w) as Metric[]) {
      sum += w[m] * z[i][m];
      norm += Math.abs(w[m]);
    }
    const score = sum / norm;
    const rating = Math.round(Math.max(0, Math.min(10, 5 + 2.5 * score)) * 10) / 10;
    return { participant: p, role, score, rating };
  });
}

function zScores(rows: Record<Metric, number>[]): Record<Metric, number>[] {
  const keys = Object.keys(rows[0]) as Metric[];
  const stats = Object.fromEntries(
    keys.map((k) => {
      const vals = rows.map((r) => r[k]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      // Floor the spread so a stat where everyone is nearly equal doesn't swing scores.
      return [k, { mean, sd: Math.max(sd, Math.abs(mean) * 0.15, 1e-6) }];
    }),
  ) as Record<Metric, { mean: number; sd: number }>;
  return rows.map(
    (r) =>
      Object.fromEntries(keys.map((k) => [k, Math.max(-3, Math.min(3, (r[k] - stats[k].mean) / stats[k].sd))])) as Record<
        Metric,
        number
      >,
  );
}

function laneGap(role: Role, scores: PlayerScore[], winTeam: number): LaneGap | null {
  const winner = scores.find((s) => s.role === role && s.participant.teamId === winTeam);
  const loser = scores.find((s) => s.role === role && s.participant.teamId !== winTeam);
  if (!winner || !loser) return null;
  const a = winner.participant;
  const b = loser.participant;
  let gap =
    winner.score -
    loser.score +
    0.35 * Math.tanh(((a.gold ?? 0) - (b.gold ?? 0)) / 2500) +
    0.25 * Math.tanh((a.kills - a.deaths - (b.kills - b.deaths)) / 6);
  if (a.laneLead != null && b.laneLead != null) gap += 0.2 * (a.laneLead - b.laneLead);
  return { role, winner, loser, gap };
}

interface TeamTotals {
  goldDiff: number;
  killDiff: number;
  towerDiff: number;
  objDiff: number;
}

function teamTotals(match: Match, winTeam: number): TeamTotals {
  const ps = match.participants;
  const sum = (teamId: number, f: (p: MatchParticipant) => number) =>
    ps.filter((p) => p.teamId === teamId).reduce((s, p) => s + f(p), 0);
  const w = match.teams?.find((t) => t.teamId === winTeam);
  const l = match.teams?.find((t) => t.teamId !== winTeam);
  const objectives = (t?: MatchTeam) => (t ? t.dragons + 2 * t.barons + t.heralds : 0);
  return {
    goldDiff: sum(winTeam, (p) => p.gold ?? 0) - sum(otherTeam(winTeam), (p) => p.gold ?? 0),
    killDiff: sum(winTeam, (p) => p.kills) - sum(otherTeam(winTeam), (p) => p.kills),
    towerDiff: (w?.towers ?? 0) - (l?.towers ?? 0),
    objDiff: objectives(w) - objectives(l),
  };
}

function decide(lanes: LaneGap[], t: TeamTotals): Pick<MatchVerdict, 'kind' | 'label' | 'role' | 'reasons'> {
  const sorted = [...lanes].sort((a, b) => b.gap - a.gap);
  const [first, second] = sorted;
  const positive = lanes.filter((l) => l.gap > 0.3).length;

  // Winning from behind on resources means the draft or macro did the work.
  if (t.goldDiff < 0 || (t.killDiff <= -5 && t.goldDiff < 2500)) {
    const reasons = [
      t.goldDiff < 0 ? `Won ${k(-t.goldDiff)} gold behind` : `Won with ${-t.killDiff} fewer kills`,
    ];
    if (t.objDiff > 0) reasons.push(`Took ${t.objDiff} more objectives`);
    return { kind: 'comp', label: 'Comp gap', role: null, reasons: [...reasons, ...laneReasons(sorted, 1)] };
  }

  if (lanes.every((l) => l.gap > 0.25) || (positive >= 4 && sorted[4].gap > -0.3 && t.goldDiff > 7000)) {
    return {
      kind: 'team',
      label: 'Team gap',
      role: null,
      reasons: [`${positive} of 5 lanes ahead`, `+${k(t.goldDiff)} team gold, ${signed(t.killDiff)} kills`],
    };
  }

  const botPair = new Set([first.role, second.role]);
  if (botPair.has('BOTTOM') && botPair.has('UTILITY') && second.gap >= 0.6 && second.gap >= first.gap * 0.6) {
    return { kind: 'bot', label: 'Bot gap', role: null, reasons: laneReasons(sorted, 2) };
  }

  if (first.gap >= 0.8 && first.gap >= 1.4 * Math.max(second.gap, 0.3)) {
    return { kind: 'role', label: `${ROLE_NAMES[first.role]} gap`, role: first.role, reasons: laneReasons(sorted, 2) };
  }

  if (positive >= 4) {
    return {
      kind: 'team',
      label: 'Team gap',
      role: null,
      reasons: [`${positive} of 5 lanes ahead`, `+${k(t.goldDiff)} team gold, ${signed(t.killDiff)} kills`],
    };
  }

  // No lane stands out: credit whichever did the most.
  return { kind: 'role', label: `${ROLE_NAMES[first.role]} gap`, role: first.role, reasons: laneReasons(sorted, 2) };
}

function laneReasons(sorted: LaneGap[], n: number): string[] {
  return sorted
    .slice(0, n)
    .filter((l) => l.gap > 0)
    .map((l) => {
      const a = l.winner.participant;
      const b = l.loser.participant;
      const gold = (a.gold ?? 0) - (b.gold ?? 0);
      return `${ROLE_NAMES[l.role]}: ${a.champion} ${kda(a)} vs ${b.champion} ${kda(b)}, ${signed(Math.round(gold / 100) / 10)}k gold`;
    });
}

function playerTag(
  me: PlayerScore,
  scores: PlayerScore[],
  verdictRole: Role | null,
  lanes: LaneGap[],
  won: boolean,
): MatchVerdict['tag'] {
  const team = scores
    .filter((s) => s.participant.teamId === me.participant.teamId)
    .sort((a, b) => b.score - a.score);
  const myLane = lanes.find((l) => l.role === me.role);

  if (won) {
    // The best player in the game by a clear margin over their own teammates.
    const best = team[0] === me && scores.every((s) => s.score <= me.score);
    const margin = me.score - (team[1]?.score ?? 0);
    if (best && (margin >= 0.55 || (verdictRole === me.role && me.rating >= 7.5))) return '1v9';
    return null;
  }

  // Their lane was the one the enemy won the game through, or they were
  // clearly the weakest player on the team.
  const lostTheGameLane = verdictRole === me.role && (myLane?.gap ?? 0) >= 0.8;
  const worst = team[team.length - 1] === me;
  const behindNext = (team[team.length - 2]?.score ?? 0) - me.score;
  if (lostTheGameLane || (worst && me.rating <= 4.2 && behindNext >= 0.3)) return 'deserved';
  return null;
}

function kda(p: MatchParticipant): string {
  return `${p.kills}/${p.deaths}/${p.assists}`;
}

function k(n: number): string {
  return `${(Math.abs(n) / 1000).toFixed(1)}k`;
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${n}`;
}
