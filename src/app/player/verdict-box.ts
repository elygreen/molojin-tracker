import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ROLES, analyzeMatch } from '../core/match-analysis';
import { Match } from '../core/models';

const SHORT_ROLE: Record<string, string> = { TOP: 'Top', JUNGLE: 'Jg', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Sup' };

/** The small "who decided this game" panel beside each match row. */
@Component({
  selector: 'app-verdict-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.for-us]': 'verdict()?.forUs === true',
    '[class.against]': 'verdict()?.forUs === false',
    '[attr.tabindex]': 'verdict() ? 0 : null',
  },
  template: `
    @if (verdict(); as v) {
      <span class="label">{{ v.label }}</span>
      @if (v.tag === '1v9') {
        <span class="tag carry">1v9</span>
      } @else if (v.tag === 'deserved') {
        <span class="tag deserved">Deserved</span>
      }
      <span class="rating">You {{ v.me.rating.toFixed(1) }}</span>

      <div class="details" role="tooltip">
        <strong>{{ v.label }}</strong>
        <ul class="reasons">
          @for (r of v.reasons; track r) {
            <li>{{ r }}</li>
          }
        </ul>
        <table>
          <thead>
            <tr><th></th><th>Your team</th><th></th><th>Enemy</th></tr>
          </thead>
          <tbody>
            @for (l of lanes(); track l.role) {
              <tr [class.decider]="v.roles.includes(l.role)">
                <td class="role">{{ short(l.role) }}</td>
                <td [class.me]="l.ours === v.me" [class.ahead]="l.oursAhead">
                  {{ l.ours.participant.champion }} <b>{{ l.ours.rating.toFixed(1) }}</b>
                </td>
                <td class="arrow" [class.pos]="l.oursAhead" [class.neg]="!l.oursAhead">{{ l.oursAhead ? '◀' : '▶' }}</td>
                <td [class.ahead]="!l.oursAhead">
                  {{ l.theirs.participant.champion }} <b>{{ l.theirs.rating.toFixed(1) }}</b>
                </td>
              </tr>
            }
          </tbody>
        </table>
        <small>Ratings are 0–10, judged against the other nine players with role-specific weights.</small>
      </div>
    } @else if (match().remake) {
      <span class="label muted">Remake</span>
    } @else {
      <span class="label muted" title="Shows up once this game's full stats have been downloaded">Analyzing…</span>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 6px 4px;
      background: var(--cream);
      border: var(--line) solid var(--ink);
      border-radius: 8px;
      border-top-width: 6px;
      text-align: center;
      outline: none;
      cursor: default;
    }
    :host(.for-us) {
      border-top-color: var(--win-ink);
    }
    :host(.against) {
      border-top-color: var(--loss-ink);
    }
    :host(:focus-visible) {
      box-shadow: 0 0 0 3px var(--peri-deep);
    }
    .label {
      font-family: var(--font-display);
      font-size: 0.78rem;
      line-height: 1.05;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .label.muted {
      font-family: var(--font-body);
      font-size: 0.65rem;
      text-transform: none;
      color: var(--ink-soft);
    }
    .tag {
      font-size: 0.6rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border: 1.5px solid var(--ink);
      border-radius: 99px;
      padding: 0 6px;
    }
    .tag.carry {
      background: var(--c-orange);
    }
    .tag.deserved {
      background: var(--loss-ink);
      color: #fff;
    }
    .rating {
      font-size: 0.6rem;
      color: var(--ink-soft);
    }

    .details {
      display: none;
      position: absolute;
      right: calc(100% + 8px);
      top: 50%;
      transform: translateY(-50%);
      z-index: 5;
      width: 290px;
      text-align: left;
      background: var(--cream);
      border: 2px solid var(--ink);
      border-radius: 8px;
      box-shadow: 0 3px 0 var(--ink);
      padding: 8px 10px;
      font-size: 0.7rem;
    }
    /* Narrow screens: drop the card below the box instead of off the left edge. */
    @media (max-width: 640px) {
      .details {
        right: 0;
        top: calc(100% + 6px);
        transform: none;
        width: min(290px, calc(100vw - 32px));
      }
    }
    :host(:hover) .details,
    :host(:focus) .details {
      display: block;
    }
    .details strong {
      font-family: var(--font-display);
      font-weight: 400;
      text-transform: uppercase;
      font-size: 0.8rem;
    }
    .reasons {
      margin: 3px 0 6px;
      padding-left: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      font-size: 0.6rem;
      color: var(--ink-soft);
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 1px 2px;
      white-space: nowrap;
    }
    tr.decider td {
      background: var(--butter);
    }
    .role {
      color: var(--ink-soft);
      font-weight: 700;
    }
    td.me {
      text-decoration: underline;
      text-decoration-thickness: 2px;
    }
    td.ahead b {
      color: var(--win-ink);
    }
    .arrow {
      text-align: center;
      font-size: 0.6rem;
    }
    .arrow.pos {
      color: var(--win-ink);
    }
    .arrow.neg {
      color: var(--loss-ink);
    }
    small {
      display: block;
      margin-top: 5px;
      color: var(--ink-soft);
      font-size: 0.6rem;
    }
  `,
})
export class VerdictBox {
  readonly match = input.required<Match>();
  readonly puuid = input.required<string>();

  protected readonly verdict = computed(() => analyzeMatch(this.match(), this.puuid()));
  /** Lanes as us-vs-them rows; the arrow points at whoever won the lane. */
  protected readonly lanes = computed(() => {
    const v = this.verdict();
    if (!v) return [];
    return ROLES.map((r) => v.lanes.find((l) => l.role === r)!)
      .filter(Boolean)
      .map((l) => ({
        role: l.role,
        ours: v.forUs ? l.winner : l.loser,
        theirs: v.forUs ? l.loser : l.winner,
        oursAhead: v.forUs ? l.gap > 0 : l.gap < 0,
      }));
  });

  protected short(role: string): string {
    return SHORT_ROLE[role] ?? role;
  }
}
