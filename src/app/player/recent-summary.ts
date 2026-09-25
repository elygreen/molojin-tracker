import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DdragonService } from '../core/ddragon.service';
import { POSITIONS, countedMatches, kdaRatio, kdaTier, winRate } from '../core/format';
import { Match } from '../core/models';
import { Donut } from '../ui/donut';
import { GameIcon } from '../ui/game-icon';

interface ChampLine {
  champion: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

/** op.gg-style "last N games" strip: record, KDA, top champions, role split. */
@Component({
  selector: 'app-recent-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Donut, GameIcon],
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

    <section class="panel champs">
      <h3>Top champions</h3>
      @for (c of champs(); track c.champion) {
        <div class="champ">
          <app-game-icon [src]="dd.champion(c.champion)" [alt]="c.champion" [fallback]="c.champion.slice(0, 2)" />
          <div class="champ-name">{{ c.champion }}</div>
          <div class="champ-wr" [class.hot]="pct(c.wins, c.games) >= 60">
            {{ pct(c.wins, c.games) }}%
            <small>({{ c.wins }}W {{ c.games - c.wins }}L)</small>
          </div>
          <div class="champ-kda">
            <span [class]="tier(ratio(c))">{{ ratio(c) }}</span> KDA
          </div>
        </div>
      } @empty {
        <p class="empty">No games yet.</p>
      }
    </section>

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
    /* One column in the sidebar; three across once the page stacks on tablets. */
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      --donut-size: 64px;
    }
    @media (min-width: 560px) and (max-width: 860px) {
      :host {
        grid-template-columns: repeat(3, minmax(0, 1fr));
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
    .champ-kda .good,
    .champ-kda .great {
      font-weight: 700;
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
    .champ {
      display: grid;
      grid-template-columns: auto 1fr auto;
      grid-template-rows: auto auto;
      column-gap: 8px;
      align-items: center;
      padding: 3px 0;
      --icon-size: 26px;
      --icon-radius: 50%;
    }
    .champ + .champ {
      border-top: 2px dashed var(--rule);
    }
    .champ app-game-icon {
      grid-row: span 2;
      border: 2px solid var(--ink);
    }
    .champ-name {
      font-weight: 700;
      font-size: 0.78rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .champ-wr {
      font-weight: 700;
      font-size: 0.78rem;
      text-align: right;
    }
    .champ-wr.hot {
      color: var(--loss-ink);
    }
    .champ-wr small {
      font-weight: 400;
      color: var(--ink-soft);
    }
    .champ-kda {
      grid-column: 2 / -1;
      font-size: 0.68rem;
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
  protected readonly dd = inject(DdragonService);

  protected readonly games = computed(() => countedMatches(this.matches()).slice(0, this.count()));
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

  protected readonly champs = computed(() => {
    const byChamp = new Map<string, ChampLine>();
    for (const m of this.games()) {
      const c = byChamp.get(m.champion) ?? {
        champion: m.champion,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
      c.games++;
      c.wins += m.win ? 1 : 0;
      c.kills += m.kills;
      c.deaths += m.deaths;
      c.assists += m.assists;
      byChamp.set(m.champion, c);
    }
    return [...byChamp.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 3);
  });

  private readonly roleColors = ['var(--c-red)', 'var(--c-green)', 'var(--c-purple)', 'var(--c-orange)', 'var(--peri-deep)'];
  protected readonly roles = computed(() => {
    const g = this.games();
    return POSITIONS.map((p, i) => {
      const games = g.filter((m) => m.position === p.key).length;
      return { ...p, games, share: g.length ? (games / g.length) * 100 : 0, color: this.roleColors[i] };
    });
  });

  protected pct = winRate;
  protected tier = kdaTier;
  protected ratio(c: ChampLine): string {
    return kdaRatio(c.kills, c.deaths, c.assists);
  }
}
