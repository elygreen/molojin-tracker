import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DdragonService } from '../core/ddragon.service';
import { kdaRatio, kdaTier, winRate } from '../core/format';
import { Match } from '../core/models';
import { GameIcon } from '../ui/game-icon';

interface ChampLine {
  champion: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
}

/** Champions played in a set of games, most played first, with play rate, win rate and KDA. */
@Component({
  selector: 'app-champion-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameIcon],
  template: `
    <h3>
      {{ heading() }}
      <small>{{ total() }} games</small>
    </h3>
    @for (c of shown(); track c.champion) {
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
        <div class="champ-play">{{ c.games }} played · {{ pct(c.games, total()) }}%</div>
        <div class="play-bar" aria-hidden="true">
          <span [style.width.%]="(c.games / maxGames()) * 100"></span>
        </div>
      </div>
    } @empty {
      <p class="empty">No games yet.</p>
    }
    @if (champs().length > limit()) {
      <button type="button" class="more" (click)="expanded.set(!expanded())">
        {{ expanded() ? 'Show less' : 'Show all ' + champs().length }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
      background: var(--cream);
      border: var(--line) solid var(--ink);
      box-shadow: var(--pop-sm);
      border-radius: 8px;
      padding: 8px 10px;
      min-width: 0;
    }
    h3 {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 0 0 6px;
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h3 small {
      font-family: var(--font-body);
      text-transform: none;
      letter-spacing: 0;
      font-size: 0.64rem;
      color: var(--ink-soft);
    }
    .champ {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-rows: auto auto auto;
      column-gap: 8px;
      align-items: center;
      padding: 4px 0;
      --icon-size: 28px;
      --icon-radius: 50%;
    }
    .champ + .champ {
      border-top: 2px dashed var(--rule);
    }
    .champ app-game-icon {
      grid-row: span 3;
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
      white-space: nowrap;
    }
    .champ-wr.hot {
      color: var(--loss-ink);
    }
    .champ-wr small {
      font-weight: 400;
      color: var(--ink-soft);
    }
    .champ-kda,
    .champ-play {
      font-size: 0.68rem;
      color: var(--ink-soft);
    }
    .champ-play {
      text-align: right;
      white-space: nowrap;
    }
    .good,
    .great {
      font-weight: 700;
    }
    .good {
      color: var(--kda-good);
    }
    .great {
      color: var(--kda-great);
    }
    /* Play rate against the most played champion. */
    .play-bar {
      grid-column: 2 / -1;
      height: 5px;
      margin-top: 3px;
      border-radius: 99px;
      background: var(--slot);
      overflow: hidden;
    }
    .play-bar span {
      display: block;
      height: 100%;
      background: var(--peri-deep);
    }
    .empty {
      margin: 0;
      color: var(--ink-soft);
    }
    .more {
      display: block;
      margin: 6px auto 0;
      font: inherit;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--ink);
      background: var(--butter);
      border: 1.5px solid var(--ink);
      border-radius: 99px;
      padding: 1px 12px;
      cursor: pointer;
    }
  `,
})
export class ChampionList {
  readonly heading = input.required<string>();
  /** Games to summarize; remakes should already be filtered out. */
  readonly matches = input.required<Match[]>();
  /** Champions shown before "Show all". */
  readonly limit = input(5);
  protected readonly dd = inject(DdragonService);

  protected readonly total = computed(() => this.matches().length);

  protected readonly champs = computed(() => {
    const byChamp = new Map<string, ChampLine>();
    for (const m of this.matches()) {
      const c = byChamp.get(m.champion) ?? { champion: m.champion, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      c.games++;
      c.wins += m.win ? 1 : 0;
      c.kills += m.kills;
      c.deaths += m.deaths;
      c.assists += m.assists;
      byChamp.set(m.champion, c);
    }
    return [...byChamp.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
  });

  protected readonly expanded = linkedSignal({ source: this.matches, computation: () => false });
  protected readonly shown = computed(() => (this.expanded() ? this.champs() : this.champs().slice(0, this.limit())));
  protected readonly maxGames = computed(() => this.champs()[0]?.games ?? 1);

  protected readonly pct = winRate;
  protected readonly tier = kdaTier;
  protected ratio(c: ChampLine): string {
    return kdaRatio(c.kills, c.deaths, c.assists);
  }
}
