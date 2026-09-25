import { Injectable, computed, signal } from '@angular/core';
import { SoloRank } from './models';

/** Roughly what a win is worth right now (+18–19 a win, −22 a loss). */
export const LP_PER_WIN = 18.5;

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
const DIVISIONS: Record<string, number> = { IV: 4, III: 3, II: 2, I: 1 };
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export function isMasters(rank: SoloRank | null): boolean {
  return !!rank && APEX.has(rank.tier);
}

/** LP still needed to reach Master 0 LP; 0 once there, null when unranked. */
export function lpToMasters(rank: SoloRank | null): number | null {
  if (!rank) return null;
  if (isMasters(rank)) return 0;
  const tier = TIERS.indexOf(rank.tier);
  const division = DIVISIONS[rank.rank];
  if (tier < 0 || !division) return null;
  // Every division below Master is 100 LP; count the ones left, including this one.
  const divisionsLeft = (TIERS.length - 1 - tier) * 4 + division;
  return Math.max(0, divisionsLeft * 100 - rank.lp);
}

/**
 * Shared between the player page (which knows the rank) and the masthead
 * (which shows the countdown and the celebration).
 */
@Injectable({ providedIn: 'root' })
export class MastersTracker {
  /** Set by the open player page. */
  readonly rank = signal<SoloRank | null>(null);

  readonly lpLeft = computed(() => lpToMasters(this.rank()));
  readonly winsLeft = computed(() => {
    const lp = this.lpLeft();
    return lp === null ? null : Math.ceil(lp / LP_PER_WIN);
  });
  readonly reached = computed(() => isMasters(this.rank()));
}
