import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { POSITIONS, countedMatches, kdaRatio, kdaTier, winRate } from '../core/format';
import { Match } from '../core/models';
import { Donut } from '../ui/donut';
import { ChampionList } from './champion-list';

/** op.gg-style "last N games" strip: record, KDA, top champions, role split. */
@Component({
  selector: 'app-recent-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Donut, ChampionList],
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

    <app-champion-list heading="Season champions" [matches]="season()" [limit]="5" />
    <app-champion-list heading="Last 40 champions" [matches]="recent40()" [limit]="5" />

    <section class="panel roles">
      <h3>Roles</h3>
      @for (r of roles(); track r.key) {
        <div class="role">
          <span class="role-label">{{ r.label }}</span>
          <div class="role-bar">
            <div class="role-fill" [style.width.%]="r.share" [style.background]="r.color"></div>
          </div>
          <span class="role-count">{{ r.games }}</span>
        </div>
      }
    </section>
  `,
  styles: `
    /* One column in the sidebar; two across once the page stacks on tablets. */
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      --donut-size: 64px;
    }
    @media (min-width: 560px) and (max-width: 860px) {
      :host {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .panel {
      background: var(--cream);
      border: var(--line) solid var(--ink);
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
    .role {
      display: grid;
      grid-template-columns: 48px 1fr 20px;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      font-size: 0.72rem;
    }
    .role:last-child {
      margin-bottom: 0;
    }
    .role-bar {
      height: 9px;
      border: 2px solid var(--ink);
      border-radius: 99px;
      background: var(--slot);
      overflow: hidden;
    }
    .role-fill {
      height: 100%;
    }
    .role-count {
      text-align: right;
      font-weight: 700;
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
  protected readonly recent40 = computed(() => this.counted().slice(0, 40));
  /** This season's games: the same major patch (16.x is 2026) as the newest game. */
  protected readonly season = computed(() => {
    const all = this.counted();
    const major = all[0]?.patch.split('.')[0];
    return major ? all.filter((m) => m.patch.split('.')[0] === major) : [];
  });
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

  private readonly roleColors = ['var(--c-red)', 'var(--c-green)', 'var(--c-purple)', 'var(--c-orange)', 'var(--peri-deep)'];
  protected readonly roles = computed(() => {
    const g = this.games();
    return POSITIONS.map((p, i) => {
      const games = g.filter((m) => m.position === p.key).length;
      return { ...p, games, share: g.length ? (games / g.length) * 100 : 0, color: this.roleColors[i] };
    });
  });

  protected tier = kdaTier;
}
