/** One entry in public/players.json. Add an entry to get a new tab. */
export interface PlayerConfig {
  id: string;
  gameName: string;
  tagLine: string;
  platform: string;
  region: string;
}

export interface SoloRank {
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
}

export interface RankSnapshot extends SoloRank {
  t: number;
}

export interface MatchParticipant {
  puuid: string;
  gameName: string;
  tagLine: string;
  champion: string;
  teamId: number;
  kills: number;
  deaths: number;
  assists: number;
  // The rest arrived with schema v2; older stored matches don't have them.
  position?: string;
  level?: number;
  gold?: number;
  cs?: number;
  damage?: number;
  /** Damage taken plus damage mitigated. */
  taken?: number;
  objDamage?: number;
  vision?: number;
  /** Healing and shielding on teammates. */
  support?: number;
  /** Seconds of crowd control applied. */
  cc?: number;
  /** 1 if ahead of the lane opponent in gold+XP at the end of laning, 0 if not. */
  laneLead?: number | null;
  csLead?: number | null;
  levelLead?: number | null;
}

export interface MatchTeam {
  teamId: number;
  win: boolean;
  kills: number;
  gold: number;
  towers: number;
  inhibitors: number;
  dragons: number;
  barons: number;
  heralds: number;
  grubs: number;
}

export interface Match {
  matchId: string;
  gameStart: number;
  durationSec: number;
  patch: string;
  remake: boolean;
  win: boolean;
  champion: string;
  champLevel: number;
  position: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  visionScore: number;
  controlWards: number;
  killParticipation: number;
  multikill: string | null;
  items: number[];
  trinket: number;
  spells: number[];
  keystone: number | null;
  primaryStyle: number | null;
  secondaryStyle: number | null;
  teamId: number;
  participants: MatchParticipant[];
  teams?: MatchTeam[];
  lpChange: number | null;
  /** Stored shape version; see scripts/transform.mjs. */
  v?: number;
}

/** Shape of public/data/<id>.json, written by scripts/fetch-matches.mjs. */
export interface PlayerData {
  updatedAt: string;
  profile: {
    puuid: string;
    gameName: string;
    tagLine: string;
    platform: string;
    profileIconId: number;
    summonerLevel: number;
  };
  soloRank: SoloRank | null;
  rankHistory: RankSnapshot[];
  matches: Match[];
}
