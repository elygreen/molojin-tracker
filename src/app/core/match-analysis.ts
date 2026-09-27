import { Match, MatchParticipant, MatchTeam } from './models';

/**
 * Decides who won each game and why.
 *
 * 1. Every player gets a performance score. Each stat is compared with what
 *    players in the same role usually do (ROLE_BASELINES), then combined with
 *    weights for that role, so a jungler isn't marked down for farming less
 *    than a mid laner or a support for dealing less damage than a carry.
 *    The 0–10 rating on top adds a small bonus for winning.
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

// Deaths count against a player; everything else counts for them. Vision and
// damage taken count for little: they say more about champion and role than
// about how well someone played. Deaths are mostly judged through KDA.
const WEIGHTS: Record<Role, Weights> = {
  TOP: { kda: 1, kp: 0.6, dmg: 1, gold: 0.8, cs: 0.8, vision: 0.1, tank: 0.25, obj: 0.6, util: 0.1, deaths: -0.4 },
  JUNGLE: { kda: 1, kp: 1, dmg: 0.8, gold: 0.7, cs: 0.4, vision: 0.15, tank: 0.1, obj: 0.9, util: 0.2, deaths: -0.4 },
  MIDDLE: { kda: 1, kp: 0.8, dmg: 1.1, gold: 0.8, cs: 0.7, vision: 0.1, tank: 0.05, obj: 0.4, util: 0.1, deaths: -0.4 },
  BOTTOM: { kda: 1, kp: 0.7, dmg: 1.2, gold: 0.9, cs: 0.8, vision: 0.1, tank: 0.05, obj: 0.5, util: 0.1, deaths: -0.4 },
  UTILITY: { kda: 0.9, kp: 1.1, dmg: 0.5, gold: 0.3, cs: 0, vision: 0.4, tank: 0.2, obj: 0.1, util: 0.7, deaths: -0.4 },
};

/**
 * What each role usually does, as [mean, spread] per stat, measured over
 * 3,070 player-games in 307 Diamond solo queue games (Molojin's history as of
 * September 2026). Fixed numbers, so a game's scores don't drift as new games
 * are stored.
 */
const ROLE_BASELINES: Record<Role, Record<Metric, [number, number]>> = {
  TOP: {
    kda: [1.09, 0.548], kp: [0.369, 0.147], dmg: [0.226, 0.0662], gold: [414, 75.3], cs: [7.12, 1.29],
    vision: [0.747, 0.251], tank: [0.272, 0.071], obj: [0.196, 0.124], util: [137, 91.7], deaths: [0.211, 0.0987],
  },
  JUNGLE: {
    kda: [1.39, 0.606], kp: [0.532, 0.149], dmg: [0.195, 0.0634], gold: [457, 73.1], cs: [6.89, 1.17],
    vision: [0.844, 0.313], tank: [0.246, 0.062], obj: [0.403, 0.144], util: [152, 175], deaths: [0.2, 0.0973],
  },
  MIDDLE: {
    kda: [1.29, 0.621], kp: [0.449, 0.154], dmg: [0.233, 0.0658], gold: [430, 71.5], cs: [7.25, 1.19],
    vision: [0.699, 0.264], tank: [0.177, 0.0571], obj: [0.162, 0.0916], util: [119, 93.6], deaths: [0.197, 0.0976],
  },
  BOTTOM: {
    kda: [1.26, 0.549], kp: [0.486, 0.154], dmg: [0.237, 0.0764], gold: [479, 94], cs: [7.47, 1.22],
    vision: [0.648, 0.248], tank: [0.144, 0.0417], obj: [0.191, 0.111], util: [96.2, 93.2], deaths: [0.218, 0.103],
  },
  UTILITY: {
    kda: [1.39, 0.597], kp: [0.555, 0.149], dmg: [0.109, 0.0504], gold: [311, 43.1], cs: [1.17, 0.518],
    vision: [2.49, 0.65], tank: [0.161, 0.0617], obj: [0.0433, 0.0509], util: [411, 247], deaths: [0.211, 0.105],
  },
};

/** Winning adds this to the rating's score (losing subtracts it); lane comparisons leave it out. */
const RESULT_BONUS = 0.25;
/** How quickly the rating approaches 0 and 10; typical games land between about 3 and 8. */
const RATING_SPREAD = 1.4;


export interface PlayerScore {
  participant: MatchParticipant;
  role: Role;
  /** Weighted stats against the role's usual numbers; 0 is a typical game for the role. Leaves out the result. */
  score: number;
  /** The score plus the win bonus, on a 0–10 scale for display; about 5 is an average game. */
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

  const winTeam = match.win ? match.teamId : otherTeam(match.teamId);
  const scores = scorePlayers(ps, Math.max(1, match.durationSec / 60), winTeam);
  const me = scores.find((s) => s.participant.puuid === puuid);
  if (!me) return null;

  const lanes = ROLES.map((role) => laneGap(role, scores, winTeam, match)).filter((l): l is LaneGap => l !== null);
  if (lanes.length !== 5) return null;

  const teams = teamTotals(match, winTeam);
  const decided = decide(lanes, teams);
  const tag = playerTag(me, scores, decided.roles, lanes, match.win);

  return { ...decided, forUs: match.win, lanes, me, tag };
}

export interface GameRanking extends PlayerScore {
  /** 1 for the best score in the game, 10 for the worst. */
  place: number;
  /** Best player on the winning team (MVP) and on the losing team (ACE). */
  badge: 'MVP' | 'ACE' | null;
}

/** Every player's score and 1st–10th place; null for matches stored before full stats were saved. */
export function rankPlayers(match: Match): GameRanking[] | null {
  const ps = match.participants;
  if (ps.length !== 10 || !ps.every(has)) return null;
  const winTeam = match.win ? match.teamId : otherTeam(match.teamId);
  const scores = scorePlayers(ps, Math.max(1, match.durationSec / 60), match.remake ? null : winTeam);
  // Places follow the rating, so the result counts; ties go to the better performance.
  const order = [...scores].sort((a, b) => b.rating - a.rating || b.score - a.score);
  const mvp = order.find((s) => s.participant.teamId === winTeam);
  const ace = order.find((s) => s.participant.teamId !== winTeam);
  return scores.map((s) => ({
    ...s,
    place: order.indexOf(s) + 1,
    badge: match.remake ? null : s === mvp ? 'MVP' : s === ace ? 'ACE' : null,
  }));
}

function otherTeam(teamId: number): number {
  return teamId === 100 ? 200 : 100;
}

function scorePlayers(ps: MatchParticipant[], minutes: number, winTeam: number | null): PlayerScore[] {
  const teamSum = (teamId: number, f: (p: MatchParticipant) => number) =>
    ps.filter((p) => p.teamId === teamId).reduce((s, p) => s + f(p), 0);

  return ps.map((p) => {
    const share = (f: (x: MatchParticipant) => number) => f(p) / Math.max(1, teamSum(p.teamId, f));
    const metrics: Record<Metric, number> = {
      kda: Math.log1p((p.kills + p.assists) / Math.max(1, p.deaths)),
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
    const role = (ROLES.includes(p.position as Role) ? p.position : 'MIDDLE') as Role;
    const w = WEIGHTS[role];
    const base = ROLE_BASELINES[role];
    let sum = 0;
    let norm = 0;
    for (const m of Object.keys(w) as Metric[]) {
      const [mean, spread] = base[m];
      const z = Math.max(-3, Math.min(3, (metrics[m] - mean) / spread));
      sum += w[m] * z;
      norm += Math.abs(w[m]);
    }
    const score = sum / norm;
    const result = winTeam === null ? 0 : p.teamId === winTeam ? RESULT_BONUS : -RESULT_BONUS;
    const rating = Math.round((5 + 5 * Math.tanh((score + result) / RATING_SPREAD)) * 10) / 10;
    return { participant: p, role, score, rating };
  });
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
    if (best && ((decided && margin >= 0.4) || margin >= 0.9 || me.score >= 1.4)) return '1v9';
    return null;
  }

  // Their lane is one the enemy won the game through and they took the
  // worst of it, or they were clearly the weakest player on the team.
  const myGap = myLane?.gap ?? 0;
  const biggestDeciderGap = Math.max(...lanes.filter((l) => deciders.includes(l.role)).map((l) => l.gap), -Infinity);
  const worst = team[team.length - 1] === me;
  const lostTheGameLane =
    deciders.includes(me.role) && myGap >= GAPPED && (myGap >= biggestDeciderGap || worst) && (me.score < 0.2 || worst);
  const behindNext = (team[team.length - 2]?.score ?? 0) - me.score;
  if (lostTheGameLane || (worst && me.score <= -0.32 && behindNext >= 0.3)) return 'deserved';
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
