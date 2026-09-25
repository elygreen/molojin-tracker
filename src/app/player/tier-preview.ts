import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PlayerData } from '../core/models';
import { ProfileCard } from './profile-card';

const SAMPLE_TIERS: [string, string, number][] = [
  ['EMERALD', 'I', 64],
  ['DIAMOND', 'II', 98],
  ['MASTER', 'I', 42],
];

/** Sample profile cards at each flair tier, for previewing the effects at #/tier-preview. */
@Component({
  selector: 'app-tier-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProfileCard],
  template: `
    @for (d of samples; track d.soloRank!.tier) {
      <section class="card">
        <app-profile-card [data]="d" />
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 28px;
      padding: 10px;
    }
    .card {
      background: var(--cream);
      border: var(--line) solid var(--ink);
      box-shadow: var(--pop);
      border-radius: 10px;
      padding: 12px;
    }
  `,
})
export class TierPreview {
  protected readonly samples: PlayerData[] = SAMPLE_TIERS.map(([tier, rank, lp]) => ({
    updatedAt: new Date().toISOString(),
    profile: { puuid: '', gameName: 'Molojin', tagLine: 'molo', platform: 'na1', profileIconId: 0, summonerLevel: 796 },
    soloRank: { tier, rank, lp, wins: 153, losses: 133, hotStreak: false },
    rankHistory: [],
    matches: [],
  }));
}
