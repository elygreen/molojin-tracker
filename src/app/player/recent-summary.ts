import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { countedMatches, kdaRatio, kdaTier, winRate } from '../core/format';
import { Match } from '../core/models';
import { Donut } from '../ui/donut';

/** op.gg-style "last N games" panel: record, win rate and KDA. */
@Component({
  selector: 'app-recent-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Donut],
  template: `
    <section class="panel record">
      <app-donut [percent]="wr()" label="Win rate" />
      <div>
        <h3>Last {{ games().length }} games</h3>
        <div>
          <p class="wl">{{ wins() }}W {{ games().length - wins() }}L</p>
          <p class="kda-line">
            {{ avg().k }} / <span class="d">{{ avg().d }}</span> / {{ avg().a }}
          </p>
          <p class="kda" [class]="tier(avg().ratio)">{{ avg().ratio }}{{ avg().ratio === 'Perfect' ? '' : ':1' }} KDA</p>
          <p class="kp">P/Kill {{ avg().kp }}%</p>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .panel {
      background: var(--paper-light);
      border: 2.5px solid var(--line);
      box-shadow: var(--shadow-sm);
      border-radius: 8px;
      padding: 8px 10px;
      min-width: 0;
    }
    h3 {
      margin: 0 0 6px;
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    p {
      margin: 0;
    }
    /* Win-rate donut fills the left column; title and numbers sit on the right. */
    .record {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      --donut-size: 84px;
    }
    .good {
      color: var(--kda-good);
    }
    .great {
      color: var(--kda-great);
    }
    .wl {
      font-size: 0.72rem;
      color: var(--ink-soft);
    }
    .kda-line {
      font-weight: 700;
      font-size: 0.85rem;
    }
    .d {
      color: var(--loss-ink);
    }
    .kda {
      font-family: var(--font-display);
      font-size: 0.95rem;
    }
    .kp {
      font-size: 0.72rem;
      color: var(--ink-soft);
    }
    .empty {
      color: var(--ink-soft);
    }
  `,
})
export class RecentSummary {
  readonly matches = input.required<Match[]>();
  readonly count = input(20);

  private readonly counted = computed(() => countedMatches(this.matches()));
  protected readonly games = computed(() => this.counted().slice(0, this.count()));
  protected readonly wins = computed(() => this.games().filter((m) => m.win).length);
  protected readonly wr = computed(() => winRate(this.wins(), this.games().length));

  protected readonly avg = computed(() => {
    const g = this.games();
    const n = g.length || 1;
    const sum = (f: (m: Match) => number) => g.reduce((s, m) => s + f(m), 0);
    const k = sum((m) => m.kills);
    const d = sum((m) => m.deaths);
    const a = sum((m) => m.assists);
    return {
      k: (k / n).toFixed(1),
      d: (d / n).toFixed(1),
      a: (a / n).toFixed(1),
      ratio: kdaRatio(k, d, a),
      kp: Math.round((sum((m) => m.killParticipation) / n) * 100),
    };
  });

  protected tier = kdaTier;
}
