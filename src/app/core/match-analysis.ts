import { Match, MatchParticipant, MatchTeam } from './models';

/**
 * Decides who won each game and why.
 *
 * 1. Every player gets a performance score. Each stat is turned into a
 *    z-score against the other nine players, then combined with weights for
 *    the player's role, so a support is judged on vision and utility and a
 *    carry on damage and farm.
 * 2. Each role is compared across the two teams: score difference plus the
 *    gold, kill-death and laning leads between the two players, objective
 *    control for junglers and vision for supports.
 * 3. The five lane gaps are read from the winners' side. Winners look ahead
 *    almost everywhere, so what matters is where the gaps split: the lanes
 *    above the largest drop are the ones that decided it. One runaway lane is
 *    "<Role> gap", a cluster is e.g. "Mid, Jg & Sup gap", four or five is
 *    "Team gap". Winning from behind on gold or kills is "Comp gap", and an
 *    even game with no standout lane is "Close game".
 * 4. The tracked player is tagged "1v9" if they clearly carried a win and
 *    "Deserved" if their lane was one the enemy won through, or they were
 *    the weakest link in a loss.
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
const SHORT_NAMES: Record<Role, string> = { TOP: 'Top', JUNGLE: 'Jg', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Sup' };

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

export type VerdictKind = 'role' | 'lanes' | 'team' | 'comp' | 'close';

export interface MatchVerdict {
  kind: VerdictKind;
  /** e.g. "Mid gap", "Mid, Jg & Sup gap", "Team gap", "Comp gap", "Close game". */
  label: string;
  /** The lanes that decided the game; empty for team, comp and close verdicts. */
  roles: Role[];
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
  const lanes = ROLES.map((role) => laneGap(role, scores, winTeam, match)).filter((l): l is LaneGap => l !== null);
  if (lanes.length !== 5) return null;

  const teams = teamTotals(match, winTeam);
  const decided = decide(lanes, teams);
  const tag = playerTag(me, scores, decided.roles, lanes, match.win);

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

function laneGap(role: Role, scores: PlayerScore[], winTeam: number, match: Match): LaneGap | null {
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

  // Laning phase, from Riot's own lane-opponent comparisons.
  if (a.laneLead != null && b.laneLead != null) gap += 0.2 * (a.laneLead - b.laneLead);
  if (a.csLead != null && b.csLead != null) gap += 0.12 * Math.tanh((a.csLead - b.csLead) / 40);
  if (a.levelLead != null && b.levelLead != null) gap += 0.08 * Math.tanh((a.levelLead - b.levelLead) / 2);

  // Role-specific jobs the per-player score only partly captures.
  if (role === 'JUNGLE') {
    const w = match.teams?.find((t) => t.teamId === winTeam);
    const l = match.teams?.find((t) => t.teamId !== winTeam);
    if (w && l) gap += 0.2 * Math.tanh((objectiveControl(w) - objectiveControl(l)) / 2.5);
  }
  if (role === 'UTILITY') gap += 0.15 * Math.tanh(((a.vision ?? 0) - (b.vision ?? 0)) / 25);

  return { role, winner, loser, gap };
}

/** Neutral objectives weighted roughly by how much they swing a game. */
function objectiveControl(t: MatchTeam): number {
  return t.dragons + 2 * t.barons + t.heralds + t.grubs / 3;
}

interface TeamTotals {
  goldDiff: number;
  totalGold: number;
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
  const objectives = (t?: MatchTeam) => (t ? Math.round(objectiveControl(t)) : 0);
  return {
    goldDiff: sum(winTeam, (p) => p.gold ?? 0) - sum(otherTeam(winTeam), (p) => p.gold ?? 0),
    totalGold: ps.reduce((s, p) => s + (p.gold ?? 0), 0),
    killDiff: sum(winTeam, (p) => p.kills) - sum(otherTeam(winTeam), (p) => p.kills),
    towerDiff: (w?.towers ?? 0) - (l?.towers ?? 0),
    objDiff: objectives(w) - objectives(l),
  };
}

// A lane has to be at least this far ahead to be called a gap.
const GAPPED = 0.9;

function decide(lanes: LaneGap[], t: TeamTotals): Pick<MatchVerdict, 'kind' | 'label' | 'roles' | 'reasons'> {
  const sorted = [...lanes].sort((a, b) => b.gap - a.gap);
  const [first, second] = sorted;
  const ahead = lanes.filter((l) => l.gap > 0.3).length;
  const teamLine = `${signed(Math.round(t.goldDiff / 100) / 10)}k team gold, ${signed(t.killDiff)} kills, ${signed(t.towerDiff)} towers`;

  // Even on resources and nobody ran away with their lane.
  const evenResources =
    Math.abs(t.goldDiff) <= Math.max(2500, 0.04 * t.totalGold) && Math.abs(t.killDiff) <= 5 && Math.abs(t.towerDiff) <= 3;
  if (evenResources && first.gap - second.gap < 0.8 && first.gap < 1.6) {
    return { kind: 'close', label: 'Close game', roles: [], reasons: [teamLine, 'No lane clearly decided it'] };
  }

  // Winning from behind on resources means the draft or macro did the work.
  if (t.goldDiff < 0 || (t.killDiff <= -5 && t.goldDiff < 2500)) {
    const reasons = [t.goldDiff < 0 ? `Won ${k(-t.goldDiff)} gold behind` : `Won with ${-t.killDiff} fewer kills`];
    if (t.objDiff > 0) reasons.push(`Took ${t.objDiff} more objectives`);
    return { kind: 'comp', label: 'Comp gap', roles: [], reasons: [...reasons, ...laneReasons(sorted.slice(0, 1))] };
  }

  // One lane far ahead of every other.
  if (first.gap >= GAPPED && first.gap - second.gap >= 0.8 && first.gap >= 1.4 * Math.max(second.gap, 0.3)) {
    return single(first, sorted);
  }

  // Otherwise split the lanes where the gaps drop off the most; everything
  // above the split decided the game.
  let split = 1;
  let biggestDrop = -Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const drop = sorted[i - 1].gap - sorted[i].gap;
    if (drop > biggestDrop) {
      biggestDrop = drop;
      split = i;
    }
  }
  const gapped = sorted.slice(0, split).filter((l) => l.gap >= GAPPED);

  if (gapped.length >= 4 || (ahead === 5 && sorted[4].gap > 0.4)) {
    return { kind: 'team', label: 'Team gap', roles: [], reasons: [`${ahead} of 5 lanes ahead`, teamLine] };
  }
  if (gapped.length === 1) return single(gapped[0], sorted);
  if (gapped.length > 1) {
    const roles = ROLES.filter((r) => gapped.some((l) => l.role === r));
    const isBotLane = roles.length === 2 && roles.includes('BOTTOM') && roles.includes('UTILITY');
    return {
      kind: 'lanes',
      label: isBotLane ? 'Bot gap' : `${joinNames(roles.map((r) => SHORT_NAMES[r]))} gap`,
      roles,
      reasons: [...laneReasons(gapped), ...heldLanes(sorted)],
    };
  }

  // Nothing reaches the gap bar.
  if (ahead >= 4) return { kind: 'team', label: 'Team gap', roles: [], reasons: [`${ahead} of 5 lanes ahead`, teamLine] };
  return { kind: 'close', label: 'Close game', roles: [], reasons: [teamLine, 'No lane clearly decided it'] };
}

function single(lane: LaneGap, sorted: LaneGap[]): Pick<MatchVerdict, 'kind' | 'label' | 'roles' | 'reasons'> {
  return {
    kind: 'role',
    label: `${ROLE_NAMES[lane.role]} gap`,
    roles: [lane.role],
    reasons: [...laneReasons([lane]), ...heldLanes(sorted)],
  };
}

/** Lanes the losing team won anyway, worth calling out. */
function heldLanes(sorted: LaneGap[]): string[] {
  return sorted
    .filter((l) => l.gap <= -0.8)
    .map((l) => `${ROLE_NAMES[l.role]}: ${l.loser.participant.champion} won lane for the losers`);
}

function joinNames(names: string[]): string {
  return names.length <= 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function laneReasons(lanes: LaneGap[]): string[] {
  return lanes
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
  deciders: Role[],
  lanes: LaneGap[],
  won: boolean,
): MatchVerdict['tag'] {
  const team = scores
    .filter((s) => s.participant.teamId === me.participant.teamId)
    .sort((a, b) => b.score - a.score);
  const myLane = lanes.find((l) => l.role === me.role);

  if (won) {
    // Best player in the game, clearly above their own teammates, and their
    // lane is what won it (or they're so far ahead it doesn't matter).
    const best = team[0] === me && scores.every((s) => s.score <= me.score);
    const margin = me.score - (team[1]?.score ?? 0);
    const decided = deciders.length === 1 && deciders[0] === me.role;
    if (best && ((decided && margin >= 0.4) || margin >= 0.9 || me.rating >= 8.5)) return '1v9';
    return null;
  }

  // Their lane is one the enemy won the game through and they took the
  // worst of it, or they were clearly the weakest player on the team.
  const myGap = myLane?.gap ?? 0;
  const biggestDeciderGap = Math.max(...lanes.filter((l) => deciders.includes(l.role)).map((l) => l.gap), -Infinity);
  const worst = team[team.length - 1] === me;
  const lostTheGameLane =
    deciders.includes(me.role) && myGap >= GAPPED && (myGap >= biggestDeciderGap || worst) && (me.rating < 5.5 || worst);
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
