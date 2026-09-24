import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, startWith, switchMap } from 'rxjs';
import { PlayerConfig } from '../core/models';
import { TrackerDataService } from '../core/tracker-data.service';
import { SectionTitle } from '../ui/section-title';
import { LpChart } from './lp-chart';
import { MatchCard } from './match-card';
import { ProfileCard } from './profile-card';
import { RecentSummary } from './recent-summary';
import { VerdictBox } from './verdict-box';

const PAGE_SIZE = 20;

/** Everything shown for one tracked player. The route param picks which. */
@Component({
  selector: 'app-player-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionTitle, ProfileCard, RecentSummary, MatchCard, LpChart, VerdictBox],
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
        @let d = state().data!;
        <section class="lp-section">
          <app-section-title text="LP tracker" wave="zigzag" tileColor="var(--c-green)" />
          <div class="card chart-card">
            <app-lp-chart [history]="d.rankHistory" />
          </div>
        </section>

        <aside class="stats">
          <section class="card">
            <app-profile-card [data]="d" />
          </section>

          <section>
            <app-section-title text="Recent form" wave="square" tileColor="var(--c-orange)" />
            <app-recent-summary [matches]="d.matches" />
          </section>
        </aside>

        <section class="history">
          <app-section-title class="flip" text="Match history" wave="tight" tileColor="var(--c-purple)" />
          <div class="matches">
            @for (m of visible(); track m.matchId) {
              <div class="match-row">
                <div class="match-slot">
                  <app-match-card [match]="m" [puuid]="d.profile.puuid" />
                </div>
                <app-verdict-box [match]="m" [puuid]="d.profile.puuid" />
              </div>
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
    .notice,
    .lp-section {
      grid-column: 1 / -1;
      min-width: 0;
    }
    .chart-card {
      padding: 8px 12px 4px;
    }
    .card {
      background: var(--cream);
      border: var(--line) solid var(--ink);
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
      grid-template-columns: minmax(0, 1fr) 92px;
      gap: 6px;
    }
    /* Match rows size themselves against this slot, not the whole list. */
    .match-slot {
      container-type: inline-size;
      min-width: 0;
      display: grid;
    }
    @container (max-width: 480px) {
      .match-row {
        grid-template-columns: minmax(0, 1fr) 76px;
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

  protected readonly pageSize = PAGE_SIZE;
  protected readonly shown = linkedSignal({ source: this.player, computation: () => PAGE_SIZE });
  protected readonly visible = computed(() => this.state().data?.matches.slice(0, this.shown()) ?? []);
}
