import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, startWith, switchMap } from 'rxjs';
import { MastersTracker } from '../core/masters';
import { mergeUpdate } from '../core/merge-update';
import { PlayerConfig } from '../core/models';
import { TrackerDataService } from '../core/tracker-data.service';
import { SectionTitle } from '../ui/section-title';
import { LpChart } from './lp-chart';
import { MatchDetails } from './match-details';
import { MatchCard } from './match-card';
import { ProfileCard } from './profile-card';
import { RecentSummary } from './recent-summary';
import { UpdateButton, UpdateState } from './update-button';
import { VerdictBox } from './verdict-box';

const PAGE_SIZE = 20;

/** Everything shown for one tracked player. The route param picks which. */
@Component({
  selector: 'app-player-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionTitle, ProfileCard, RecentSummary, MatchCard, MatchDetails, LpChart, VerdictBox, UpdateButton],
  template: `
    @switch (state().status) {
      @case ('loading') {
        <div class="card notice">Loading…</div>
      }
      @case ('missing') {
        <div class="card notice">
          <h2>No games tracked yet</h2>
          <p>
            Data for <b>{{ player()?.gameName }}#{{ player()?.tagLine }}</b> hasn't been fetched.
            Once the <code>RIOT_API_KEY</code> secret is set, the “Update matches &amp; deploy”
            workflow fills it in.
          </p>
        </div>
      }
      @case ('ready') {
        @let d = data()!;
        <section class="card profile" aria-label="Profile and rank">
          <app-profile-card [data]="d" />
        </section>

        <section class="lp-section" aria-label="LP over time">
          <div class="card chart-card">
            <app-lp-chart [history]="d.rankHistory" />
          </div>
        </section>

        <aside class="stats">
          <section aria-label="Recent form">
            <app-recent-summary [matches]="d.matches" />
          </section>
        </aside>

        <section class="history">
          <div class="history-head">
            <app-section-title class="tall" text="Match history" [showTile]="false" />
            <app-update-button [state]="updateState()" [enabled]="canUpdate()" (pressed)="update()" />
          </div>
          <div class="matches">
            @for (m of visible(); track m.matchId) {
              @let open = expanded().has(m.matchId);
              <div class="match-row">
                <div class="match-slot">
                  <app-match-card [match]="m" [puuid]="d.profile.puuid" />
                </div>
                <app-verdict-box [match]="m" [puuid]="d.profile.puuid" />
                <button
                  class="expand"
                  type="button"
                  [class.win]="!m.remake && m.win"
                  [class.loss]="!m.remake && !m.win"
                  [class.open]="open"
                  [attr.aria-expanded]="open"
                  [attr.aria-label]="(open ? 'Hide' : 'Show') + ' game details'"
                  (click)="toggle(m.matchId)"
                >
                  <svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" /></svg>
                </button>
              </div>
              @if (open) {
                <app-match-details [match]="m" [puuid]="d.profile.puuid" />
              }
            } @empty {
              <div class="card notice">No ranked solo games found yet.</div>
            }
          </div>
          @if (visible().length < d.matches.length) {
            <button class="more" type="button" (click)="shown.set(shown() + pageSize)">
              Show more ({{ d.matches.length - visible().length }} left)
            </button>
          }
        </section>
      }
    }
  `,
  styles: `
    /* Stats sidebar on the left, match history on the right; stacks on narrow screens. */
    :host {
      display: grid;
      grid-template-columns: minmax(250px, 300px) minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }
    @media (max-width: 860px) {
      :host {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .stats {
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: sticky;
      top: 12px;
      min-width: 0;
    }
    @media (max-width: 860px) {
      .stats {
        position: static;
      }
    }
    .history {
      min-width: 0;
    }
    .history-head {
      display: flex;
      align-items: stretch;
      gap: 6px;
      margin-bottom: 8px;
    }
    .history-head app-section-title {
      flex: 1;
      min-width: 0;
      margin: 0;
    }
    .notice {
      grid-column: 1 / -1;
    }
    /* Top row: profile beside the LP graph, both the same height. */
    .profile,
    .lp-section {
      align-self: stretch;
      min-width: 0;
    }
    .profile {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .card.profile {
      padding-block: 10px;
    }
    .chart-card {
      height: 100%;
      display: flex;
      align-items: center;
      padding: 8px 12px 4px;
    }
    .chart-card app-lp-chart {
      flex: 1;
    }
    .card {
      background: var(--cream);
      border: var(--line) solid var(--ink);
      box-shadow: var(--pop);
      border-radius: 10px;
      padding: 12px;
    }
    .notice h2 {
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 1.1rem;
      margin: 0 0 4px;
    }
    .notice p {
      margin: 0;
    }
    .matches {
      display: flex;
      flex-direction: column;
      gap: 6px;
      container-type: inline-size;
    }
    .match-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 92px 26px;
      gap: 6px;
    }
    /* Dropdown handle at the end of each row, tinted like its match. */
    .expand {
      display: grid;
      place-items: end center;
      padding: 0 0 8px;
      border: var(--line) solid var(--ink);
      box-shadow: var(--pop-sm);
      border-radius: 8px;
      background: var(--remake);
      color: var(--ink);
      cursor: pointer;
    }
    .expand.win {
      background: var(--win);
    }
    .expand.loss {
      background: var(--loss);
    }
    .expand:hover {
      filter: brightness(1.06);
    }
    .expand:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 1px;
    }
    .expand svg {
      width: 12px;
      height: 8px;
      transition: transform 0.15s;
    }
    .expand.open svg {
      transform: rotate(180deg);
    }
    .expand path {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    /* Match rows size themselves against this slot, not the whole list. */
    .match-slot {
      container-type: inline-size;
      min-width: 0;
      display: grid;
    }
    @container (max-width: 480px) {
      .match-row {
        grid-template-columns: minmax(0, 1fr) 76px 22px;
      }
    }
    .more {
      display: block;
      margin: 10px auto 0;
      font: inherit;
      font-family: var(--font-display);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--butter);
      color: var(--ink);
      border: var(--line) solid var(--ink);
      border-radius: 99px;
      padding: 5px 16px;
      cursor: pointer;
      box-shadow: 0 3px 0 var(--ink);
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .more:hover {
      transform: translateY(1px);
      box-shadow: 0 2px 0 var(--ink);
    }
    .more:active {
      transform: translateY(3px);
      box-shadow: 0 0 0 var(--ink);
    }
  `,
})
export class PlayerPage {
  /** Bound from the route; empty on the root route, which shows the first player. */
  readonly id = input<string>('');
  private readonly tracker = inject(TrackerDataService);
  private readonly masters = inject(MastersTracker);

  protected readonly player = computed<PlayerConfig | null>(() => {
    const players = this.tracker.players() ?? [];
    return players.find((p) => p.id === this.id()) ?? players[0] ?? null;
  });

  protected readonly state = toSignal(
    toObservable(computed(() => this.player()?.id ?? null)).pipe(
      switchMap((id) =>
        id === null
          ? of({ status: 'loading' as const, data: null })
          : this.tracker.playerData(id).pipe(
              map((data) => (data ? { status: 'ready' as const, data } : { status: 'missing' as const, data: null })),
              startWith({ status: 'loading' as const, data: null }),
            ),
      ),
    ),
    { initialValue: { status: 'loading' as const, data: null } },
  );

  /** The loaded data, replaced in place when a live update comes back. */
  protected readonly data = linkedSignal(() => this.state().data);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly shown = linkedSignal({ source: this.player, computation: () => PAGE_SIZE });
  /** Match ids whose details are open. */
  protected readonly expanded = linkedSignal({ source: this.player, computation: () => new Set<string>() });
  protected readonly visible = computed(() => this.data()?.matches.slice(0, this.shown()) ?? []);

  protected readonly canUpdate = computed(() => Boolean(this.tracker.config()?.updateUrl));
  protected readonly updateState = linkedSignal<PlayerConfig | null, UpdateState>({
    source: this.player,
    computation: () => ({ kind: 'idle' }),
  });
  private resetTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => this.masters.rank.set(this.data()?.soloRank ?? null));
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.resetTimer);
      this.masters.rank.set(null);
    });
  }

  protected update(): void {
    const player = this.player();
    const current = this.data();
    if (!player || !current || this.updateState().kind === 'loading') return;
    clearTimeout(this.resetTimer);
    this.updateState.set({ kind: 'loading' });
    this.tracker.fetchLatest(player.id, current.matches[0]?.matchId).subscribe({
      next: (update) => {
        // Ignore a reply that lands after switching to another player.
        if (this.player()?.id !== player.id) return;
        const merged = mergeUpdate(this.data() ?? current, update);
        this.data.set(merged.data);
        this.settle({ kind: 'done', added: merged.added });
      },
      error: (err: HttpErrorResponse) => {
        if (this.player()?.id !== player.id) return;
        const message = (err.error as { error?: string } | null)?.error ?? (err.status ? `error ${err.status}` : 'network error');
        this.settle({ kind: 'error', message });
      },
    });
  }

  protected toggle(matchId: string): void {
    const next = new Set(this.expanded());
    if (!next.delete(matchId)) next.add(matchId);
    this.expanded.set(next);
  }

  /** Shows the result for a few seconds, then returns to the plain button. */
  private settle(state: UpdateState): void {
    this.updateState.set(state);
    this.resetTimer = setTimeout(() => this.updateState.set({ kind: 'idle' }), state.kind === 'error' ? 6000 : 4000);
  }
}
