import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { timeAgo } from '../core/format';
import { PlayerData } from '../core/models';
import { currentSession } from '../core/session';

/** The games being played back to back right now, with the LP won or lost over them. */
@Component({
  selector: 'app-session-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>
      Current session
      @if (session()) {
        <span class="live" aria-hidden="true"></span>
      }
    </h3>
    @if (session(); as s) {
      <div class="body">
        <div
          class="lp"
          [class.up]="s.lp !== null && s.lp > 0"
          [class.down]="s.lp !== null && s.lp < 0"
        >
          <strong>{{ s.lp === null ? '—' : (s.lp > 0 ? '+' : '') + s.lp }}</strong>
          <span>LP</span>
        </div>
        <div>
          <p class="games">{{ s.games.length }} {{ s.games.length === 1 ? 'game' : 'games' }}</p>
          <p class="record">
            <span class="w">{{ s.wins }}W</span> / <span class="l">{{ s.losses }}L</span>
          </p>
          <p class="since">Started {{ started() }}</p>
        </div>
      </div>
      <ol class="pips" aria-label="Results, oldest first">
        @for (g of pips(); track g.matchId) {
          <li
            [class.win]="!g.remake && g.win"
            [class.loss]="!g.remake && !g.win"
            [title]="g.champion + (g.remake ? ': remake' : g.win ? ': win' : ': loss')"
          ></li>
        }
      </ol>
    } @else {
      <p class="idle">Not actively playing</p>
      @if (lastPlayed(); as last) {
        <p class="since">Last game {{ last }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      background: var(--paper-light);
      border: 2.5px solid var(--line);
      box-shadow: var(--shadow-sm);
      border-radius: 8px;
      padding: 8px 10px;
      min-width: 0;
    }
    h3 {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 6px;
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .live {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--green);
      border: 1.5px solid var(--line);
      animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        transform: scale(1.35);
        opacity: 0.6;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .live {
        animation: none;
      }
    }
    p {
      margin: 0;
    }
    .body {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
    }
    .lp {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 84px;
      padding: 6px 8px 4px;
      background: var(--paper-deep);
      border: 2.5px solid var(--line);
      border-radius: 8px;
      line-height: 1;
    }
    .lp strong {
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 1.6rem;
    }
    .lp span {
      font-size: 0.68rem;
      font-weight: 800;
      color: var(--ink-soft);
    }
    .lp.up strong {
      color: var(--green);
    }
    .lp.down strong {
      color: var(--red);
    }
    .games {
      font-size: 0.72rem;
      color: var(--ink-soft);
    }
    .record {
      font-family: var(--font-display);
      font-size: 0.95rem;
    }
    .w {
      color: var(--win-ink);
    }
    .l {
      color: var(--loss-ink);
    }
    .since {
      font-size: 0.72rem;
      color: var(--ink-soft);
    }
    .idle {
      font-family: var(--font-display);
      font-size: 0.95rem;
      color: var(--ink-soft);
    }
    /* One pip per game, oldest on the left. */
    .pips {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 8px 0 0;
      padding: 0;
    }
    .pips li {
      width: 14px;
      height: 14px;
      border: 2px solid var(--line);
      border-radius: 4px;
      background: var(--remake);
    }
    .pips li.win {
      background: var(--win);
    }
    .pips li.loss {
      background: var(--loss);
    }
  `,
})
export class SessionPanel {
  readonly data = input.required<PlayerData>();

  protected readonly session = computed(() => currentSession(this.data()));
  protected readonly pips = computed(() => [...(this.session()?.games ?? [])].reverse());
  protected readonly started = computed(() => timeAgo(this.session()?.startedAt ?? 0));
  protected readonly lastPlayed = computed(() => {
    const last = this.data().matches[0];
    return last ? timeAgo(last.gameStart + last.durationSec * 1000) : null;
  });
}
