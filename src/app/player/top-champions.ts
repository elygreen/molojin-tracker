import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DdragonService } from '../core/ddragon.service';
import { countedMatches, kdaRatio, kdaTier, winRate } from '../core/format';
import { Match } from '../core/models';
import { SectionTitle } from '../ui/section-title';

interface ChampLine {
  champion: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  vision: number;
  /** Kill participation, 0–1, summed over the games. */
  kp: number;
  seconds: number;
}

/**
 * Portraits of the most played champions over the latest games, each with its record and KDA,
 * and its per-game averages in a panel that drops down on hover. */
@Component({
  selector: 'app-top-champions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionTitle],
  template: `
    <app-section-title [text]="'Most played · last ' + games().length + ' games'" [showTile]="false" />
    <ul>
      @for (c of champs(); track c.champion) {
        <li tabindex="0">
          <div class="art">
            <img [src]="dd.championPortrait(c.champion)" [alt]="c.champion" loading="lazy" />
          </div>
          <h3>{{ c.champion }}</h3>
          <p class="record">
            <span class="games">{{ c.games }} {{ c.games === 1 ? 'game' : 'games' }}</span>
            <span class="w">{{ c.wins }}W</span>/<span class="l">{{ c.games - c.wins }}L</span>
            <b>{{ pct(c.wins, c.games) }}%</b>
          </p>
          <div class="wl-bar" aria-hidden="true">
            <span [style.width.%]="pct(c.wins, c.games)"></span>
          </div>
          <p class="kda" [class]="tier(ratio(c))">
            {{ ratio(c) }}{{ ratio(c) === 'Perfect' ? '' : ':1' }} KDA
          </p>
          <p class="avg">
            {{ avg(c.kills, c) }} / <span class="l">{{ avg(c.deaths, c) }}</span> /
            {{ avg(c.assists, c) }}
          </p>
          <dl class="more">
            <div>
              <dt>CS</dt>
              <dd>
                {{ short(c.cs, c) }} <small>{{ perMin(c.cs, c) }}/m</small>
              </dd>
            </div>
            <div>
              <dt>Gold</dt>
              <dd>
                {{ short(c.gold, c) }} <small>{{ perMin(c.gold, c) }}/m</small>
              </dd>
            </div>
            <div>
              <dt>Damage</dt>
              <dd>
                {{ short(c.damage, c) }} <small>{{ perMin(c.damage, c) }}/m</small>
              </dd>
            </div>
            <div>
              <dt>Kill part.</dt>
              <dd>{{ pct(c.kp, c.games) }}%</dd>
            </div>
            <div>
              <dt>Vision</dt>
              <dd>{{ avg(c.vision, c) }}</dd>
            </div>
            <div>
              <dt>Game length</dt>
              <dd>{{ minutes(c) }}</dd>
            </div>
          </dl>
        </li>
      } @empty {
        <li class="empty">No games yet.</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
      min-width: 0;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 12px;
    }
    @container (max-width: 640px) {
      ul {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    @container (max-width: 330px) {
      ul {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    li {
      background: var(--paper-light);
      border: 2.5px solid var(--line);
      box-shadow: var(--shadow-sm);
      border-radius: 10px;
      text-align: center;
      padding-bottom: 8px;
      position: relative;
      transition: transform 120ms;
    }
    /* Lifted above the cards after it, so its drop-down panel isn't covered. */
    li:hover,
    li:focus-visible {
      transform: translateY(-3px);
      z-index: 5;
    }
    /* Per-game averages, dropped down under the card on hover or focus. */
    .more {
      display: none;
      position: absolute;
      top: calc(100% + 7px);
      left: -2.5px;
      right: -2.5px;
      margin: 0;
      padding: 6px 8px;
      background: var(--paper-light);
      border: 2.5px solid var(--line);
      border-radius: 10px;
      box-shadow: var(--shadow-sm);
      font-size: 0.7rem;
      text-align: left;
      transform-origin: 50% 0;
      animation: drop 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    li:hover .more,
    li:focus-visible .more {
      display: block;
    }
    @keyframes drop {
      from {
        opacity: 0;
        transform: translateY(-8px) scaleY(0.6);
      }
    }
    .more div {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
      padding: 2px 0;
    }
    .more div + div {
      border-top: 2px dashed var(--rule);
    }
    dt {
      color: var(--ink-soft);
      white-space: nowrap;
    }
    dd {
      margin: 0;
      font-weight: 800;
      text-align: right;
    }
    dd small {
      display: block;
      font-size: 0.62rem;
      font-weight: 600;
      color: var(--ink-soft);
    }
    @media (prefers-reduced-motion: reduce) {
      li {
        transition: none;
      }
      li:hover,
      li:focus-visible {
        transform: none;
      }
      .more {
        animation: none;
      }
    }
    li.empty {
      grid-column: 1 / -1;
      padding: 12px;
      color: var(--ink-soft);
    }
    .art {
      aspect-ratio: 4 / 5;
      background: var(--paper-deep);
      border-radius: 7px 7px 0 0;
      overflow: hidden;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: 50% 12%;
    }
    /* The name on a butter banner under the art. */
    h3 {
      margin: 0 0 6px;
      padding: 4px 6px 2px;
      background: var(--butter);
      border-block: 2.5px solid var(--line);
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 0.8rem;
      line-height: 1.2;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    p {
      margin: 0;
    }
    .record {
      padding: 0 4px;
      font-size: 0.76rem;
      font-weight: 700;
    }
    .games {
      margin-right: 3px;
      color: var(--ink-soft);
    }
    .record b {
      margin-left: 3px;
      font-weight: 800;
    }
    .w {
      color: var(--win-ink);
    }
    .l {
      color: var(--loss-ink);
    }
    .wl-bar {
      height: 8px;
      margin: 4px 10px 6px;
      border: 2px solid var(--line);
      border-radius: 99px;
      background: var(--loss);
      overflow: hidden;
    }
    .wl-bar span {
      display: block;
      height: 100%;
      background: var(--win);
    }
    .kda {
      font-family: var(--font-display);
      font-size: 0.85rem;
      line-height: 1.2;
    }
    .good {
      color: var(--kda-good);
    }
    .great {
      color: var(--kda-great);
    }
    .avg {
      font-size: 0.7rem;
      color: var(--ink-soft);
    }
  `,
})
export class TopChampions {
  readonly matches = input.required<Match[]>();
  /** How many of the latest games to look at. */
  readonly count = input(60);
  /** How many champions to show. */
  readonly limit = input(6);
  protected readonly dd = inject(DdragonService);

  protected readonly games = computed(() => countedMatches(this.matches()).slice(0, this.count()));

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
        cs: 0,
        gold: 0,
        damage: 0,
        vision: 0,
        kp: 0,
        seconds: 0,
      };
      c.games++;
      c.wins += m.win ? 1 : 0;
      c.kills += m.kills;
      c.deaths += m.deaths;
      c.assists += m.assists;
      c.cs += m.cs;
      c.gold += m.gold;
      c.damage += m.damage;
      c.vision += m.visionScore;
      c.kp += m.killParticipation;
      c.seconds += m.durationSec;
      byChamp.set(m.champion, c);
    }
    return [...byChamp.values()]
      .sort((a, b) => b.games - a.games || b.wins - a.wins)
      .slice(0, this.limit());
  });

  protected readonly pct = winRate;
  protected readonly tier = kdaTier;
  protected ratio(c: ChampLine): string {
    return kdaRatio(c.kills, c.deaths, c.assists);
  }
  protected avg(total: number, c: ChampLine): string {
    return (total / c.games).toFixed(1);
  }
  /** A per-game average as a short number: 187, 12.4k. */
  protected short(total: number, c: ChampLine): string {
    const n = total / c.games;
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString();
  }
  protected perMin(total: number, c: ChampLine): string {
    const n = c.seconds ? total / (c.seconds / 60) : 0;
    return n >= 100 ? Math.round(n).toString() : n.toFixed(1);
  }
  protected minutes(c: ChampLine): string {
    const sec = Math.round(c.seconds / c.games);
    return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  }
}
