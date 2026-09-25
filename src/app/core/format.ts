import { Match } from './models';

export const TIER_COLORS: Record<string, string> = {
  IRON: '#6b6461',
  BRONZE: '#a0633c',
  SILVER: '#8c9aa6',
  GOLD: '#d8a93b',
  PLATINUM: '#3fa39a',
  EMERALD: '#2f9e5b',
  DIAMOND: '#5b7fe0',
  MASTER: '#9b59c9',
  GRANDMASTER: '#d0463b',
  CHALLENGER: '#e2b93b',
};

export const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export const POSITIONS: { key: string; label: string }[] = [
  { key: 'TOP', label: 'Top' },
  { key: 'JUNGLE', label: 'Jungle' },
  { key: 'MIDDLE', label: 'Mid' },
  { key: 'BOTTOM', label: 'Bot' },
  { key: 'UTILITY', label: 'Support' },
];

export function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function rankLabel(tier: string, rank: string): string {
  return APEX_TIERS.has(tier) ? titleCase(tier) : `${titleCase(tier)} ${rank}`;
}

export function kdaRatio(k: number, d: number, a: number): string {
  return d === 0 ? 'Perfect' : ((k + a) / d).toFixed(2);
}

/** Color band for a KDA ratio from kdaRatio(): under 3 plain, 3–4.99 good, 5+ (or Perfect) great. */
export function kdaTier(ratio: string): 'great' | 'good' | null {
  if (ratio === 'Perfect') return 'great';
  const r = Number(ratio);
  return r >= 5 ? 'great' : r >= 3 ? 'good' : null;
}

export function winRate(wins: number, games: number): number {
  return games === 0 ? 0 : Math.round((wins / games) * 100);
}

export function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const mins = Math.floor((now - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString();
}

/** Remakes don't count toward W/L, so every stat skips them. */
export function countedMatches(matches: Match[]): Match[] {
  return matches.filter((m) => !m.remake);
}

export const TIERS = [
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
/** Where Master starts on the continuous scale; everything above is Master+ LP. */
export const APEX_FLOOR = TIERS.indexOf('MASTER') * 400;

/** Same scale as scripts/transform.mjs: 100 LP per division, 400 per tier. */
export function absoluteLp(tier: string, rank: string, lp: number): number {
  const t = TIERS.indexOf(tier);
  if (t >= TIERS.indexOf('MASTER')) return APEX_FLOOR + lp;
  return t * 400 + DIVISIONS.indexOf(rank) * 100 + lp;
}

/** Label for the 100-LP band starting at `floor`, e.g. "D2", "Master" or "+200". */
export function bandLabel(floor: number): string {
  if (floor >= APEX_FLOOR) {
    const over = floor - APEX_FLOOR;
    return over === 0 ? 'Master' : `+${over}`;
  }
  const tier = TIERS[Math.floor(floor / 400)];
  const division = 4 - Math.floor((floor % 400) / 100);
  return `${tier.charAt(0)}${division}`;
}
