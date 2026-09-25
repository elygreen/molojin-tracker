import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DdragonService } from '../core/ddragon.service';
import { kdaRatio, kdaTier, shortRank, titleCase } from '../core/format';
import { GameRanking, rankPlayers } from '../core/match-analysis';
import { Match, MatchParticipant } from '../core/models';
import { GameIcon } from '../ui/game-icon';

interface Row {
  p: MatchParticipant;
  rank: GameRanking | null;
  ratio: string;
  kp: number;
  csPerMin: string;
  items: number[];
}

interface Team {
  teamId: number;
  win: boolean;
  rows: Row[];
}

/** The op.gg-style expanded scoreboard under a match: both teams, one row per player. */
@Component({
  selector: 'app-match-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameIcon],
  template: `
    @for (team of teams(); track team.teamId) {
      <section class="team" [class.win]="team.win && !match().remake" [class.loss]="!team.win && !match().remake">
        <div class="row head">
          <span class="col-player">
            <b>{{ match().remake ? 'Remake' : team.win ? 'Victory' : 'Defeat' }}</b>
            ({{ team.teamId === 100 ? 'Blue' : 'Red' }} team)
          </span>
          <span class="col-score">Score</span>
          <span class="col-kda">KDA</span>
          <span class="col-dmg">Damage</span>
          <span class="col-taken">Taken</span>
          <span class="col-cs">CS</span>
          <span class="col-items">Build</span>
        </div>
        @for (r of team.rows; track r.p.puuid) {
          <div class="row" [class.me]="r.p.puuid === puuid()">
            <span class="col-player">
              <span class="champ">
                <app-game-icon [src]="dd.champion(r.p.champion)" [alt]="r.p.champion" [fallback]="r.p.champion.slice(0, 2)" />
                @if (r.p.level) {
                  <span class="lvl">{{ r.p.level }}</span>
                }
              </span>
              <span class="who">
                <span class="name" [title]="r.p.gameName + '#' + r.p.tagLine">{{ r.p.gameName }}</span>
                @if (r.p.soloTier !== undefined) {
                  <span class="tier" [attr.data-tier]="tierKey(r.p.soloTier)" [title]="tierTitle(r.p.soloTier)">
                    {{ r.p.soloTier ? short(r.p.soloTier) : 'Unranked' }}
                  </span>
                }
              </span>
            </span>

            <span class="col-score">
              @if (r.rank; as s) {
                <span class="rating">{{ s.rating.toFixed(1) }}</span>
                <span class="place" [class.mvp]="s.badge === 'MVP'" [class.ace]="s.badge === 'ACE'">
                  {{ s.badge ?? ordinal(s.place) }}
                </span>
              } @else {
                <span class="muted">–</span>
              }
            </span>

            <span class="col-kda">
              <span class="nums">
                {{ r.p.kills }}/<span class="deaths">{{ r.p.deaths }}</span>/{{ r.p.assists }}
                <small>({{ r.kp }}%)</small>
              </span>
              <span class="ratio" [class]="tier(r.ratio)">{{ r.ratio }}{{ r.ratio === 'Perfect' ? '' : ':1' }}</span>
            </span>

            <span class="col-dmg">
              <span class="num">{{ fmt(r.p.damage) }}</span>
              <span class="bar"><span class="fill dealt" [style.width.%]="share(r.p.damage, maxDamage())"></span></span>
            </span>

            <span class="col-taken">
              <span class="num">{{ fmt(r.p.damageTaken) }}</span>
              <span class="bar"><span class="fill taken" [style.width.%]="share(r.p.damageTaken, maxTaken())"></span></span>
            </span>

            <span class="col-cs">
              <span class="num">{{ r.p.cs ?? '–' }}</span>
              <small>{{ r.csPerMin }}/m</small>
            </span>

            <span class="col-items">
              @for (item of r.items; track $index) {
                <app-game-icon [src]="dd.item(item)" [alt]="'Item ' + item" />
              }
              <app-game-icon class="trinket" [src]="dd.item(r.p.trinket ?? 0)" alt="Trinket" />
            </span>
          </div>
        }
      </section>
    }
    @if (!hasBuilds()) {
      <p class="note">Builds and damage taken show up once this game is re-downloaded on the next data refresh.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 6px;
      container-type: inline-size;
      background: var(--cream);
      border: var(--line) solid var(--ink);
      border-radius: 8px;
      padding: 6px;
      font-size: 0.72rem;
    }
    .team {
      border: 1.5px solid var(--ink);
      border-radius: 6px;
      overflow: hidden;
      --row-tint: var(--remake-tint);
      --head: var(--remake);
    }
    .team.win {
      --row-tint: var(--win-tint);
      --head: var(--win);
    }
    .team.loss {
      --row-tint: var(--loss-tint);
      --head: var(--loss);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(96px, 1fr) 76px 92px 74px 74px 52px 158px;
      align-items: center;
      gap: 8px;
      padding: 3px 8px;
      background: var(--row-tint);
    }
    .row + .row {
      border-top: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
    }
    .row.head {
      background: var(--head);
      font-size: 0.64rem;
      color: var(--ink);
      padding-block: 4px;
    }
    .row.head .col-player b {
      font-family: var(--font-display);
      font-weight: 400;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .row.head span:not(.col-player) {
      text-align: center;
    }
    .row.me {
      background: color-mix(in srgb, var(--butter) 70%, var(--row-tint));
      font-weight: 700;
    }
    .col-player {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .champ {
      position: relative;
      --icon-size: 28px;
      --icon-radius: 50%;
    }
    .champ app-game-icon {
      border: 1.5px solid var(--ink);
    }
    .lvl {
      position: absolute;
      right: -4px;
      bottom: -3px;
      min-width: 14px;
      text-align: center;
      background: var(--ink);
      color: var(--butter);
      font-size: 0.55rem;
      font-weight: 700;
      border-radius: 99px;
      padding: 0 2px;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .tier {
      flex: none;
      font-size: 0.58rem;
      font-weight: 700;
      line-height: 1.4;
      padding: 0 4px;
      border-radius: 4px;
      border: 1px solid var(--ink);
      background: var(--cream);
      color: var(--ink-soft);
    }
    .tier[data-tier='DIAMOND'] {
      background: #cfe0fb;
      color: #2f56b8;
    }
    .tier[data-tier='EMERALD'] {
      background: #d2f0dc;
      color: #1f7a45;
    }
    .tier[data-tier='PLATINUM'] {
      background: #d3eeee;
      color: #1f6e72;
    }
    .tier[data-tier='MASTER'] {
      background: #e6dbfa;
      color: #6a3fc0;
    }
    .tier[data-tier='GRANDMASTER'] {
      background: #fbdcd6;
      color: #b8321f;
    }
    .tier[data-tier='CHALLENGER'] {
      background: #fcefc4;
      color: #9a6a00;
    }
    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .col-score {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .rating {
      font-weight: 700;
      min-width: 22px;
      text-align: right;
    }
    .place {
      min-width: 32px;
      text-align: center;
      background: var(--slot);
      border: 1.5px solid var(--ink);
      border-radius: 99px;
      padding: 0 5px;
      font-size: 0.62rem;
      font-weight: 700;
    }
    .place.mvp {
      background: var(--c-orange);
    }
    .place.ace {
      background: var(--c-purple);
      color: #fff;
    }
    .col-kda {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.3;
      white-space: nowrap;
    }
    .deaths {
      color: var(--loss-ink);
    }
    small,
    .muted {
      font-weight: 400;
      color: var(--ink-soft);
      font-size: 0.62rem;
    }
    .ratio {
      font-size: 0.64rem;
      color: var(--ink-soft);
    }
    .ratio.good {
      color: var(--kda-good);
      font-weight: 700;
    }
    .ratio.great {
      color: var(--kda-great);
      font-weight: 700;
    }
    .col-dmg,
    .col-taken,
    .col-cs {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      line-height: 1.2;
    }
    .bar {
      width: 100%;
      height: 6px;
      border: 1px solid var(--ink);
      border-radius: 99px;
      background: var(--cream);
      overflow: hidden;
    }
    .fill {
      display: block;
      height: 100%;
    }
    .fill.dealt {
      background: var(--c-red);
    }
    .fill.taken {
      background: var(--ink-soft);
    }
    .col-items {
      display: flex;
      gap: 2px;
      --icon-size: 20px;
    }
    .col-items app-game-icon {
      border: 1px solid var(--ink);
    }
    .trinket {
      --icon-radius: 50%;
      margin-left: 2px;
    }
    .note {
      margin: 0;
      font-size: 0.64rem;
      color: var(--ink-soft);
      text-align: center;
    }

    /* Narrow lists: the build drops onto its own line under each player. */
    @container (max-width: 620px) {
      .row {
        grid-template-columns: minmax(80px, 1fr) 70px 80px 62px 62px 44px;
        column-gap: 6px;
      }
      .col-items {
        grid-column: 1 / -1;
        padding-left: 34px;
      }
      .row.head .col-items {
        display: none;
      }
    }
    @container (max-width: 440px) {
      .row {
        grid-template-columns: minmax(0, 1fr) 62px 74px 52px;
      }
      .col-taken,
      .col-cs {
        display: none;
      }
    }
  `,
})
export class MatchDetails {
  readonly match = input.required<Match>();
  readonly puuid = input.required<string>();
  protected readonly dd = inject(DdragonService);
  protected readonly tier = kdaTier;

  private readonly ranks = computed(() => rankPlayers(this.match()));

  protected readonly teams = computed<Team[]>(() => {
    const m = this.match();
    const minutes = Math.max(1, m.durationSec / 60);
    const ranks = this.ranks();
    const myTeamWon = m.win;
    return [100, 200].map((teamId) => {
      const members = m.participants.filter((p) => p.teamId === teamId);
      const teamKills = members.reduce((s, p) => s + p.kills, 0);
      return {
        teamId,
        win: teamId === m.teamId ? myTeamWon : !myTeamWon,
        rows: members.map((p) => ({
          p,
          rank: ranks?.find((r) => r.participant.puuid === p.puuid) ?? null,
          ratio: kdaRatio(p.kills, p.deaths, p.assists),
          kp: teamKills ? Math.round(((p.kills + p.assists) / teamKills) * 100) : 0,
          csPerMin: ((p.cs ?? 0) / minutes).toFixed(1),
          items: p.items ?? [0, 0, 0, 0, 0, 0],
        })),
      };
    });
  });

  protected readonly maxDamage = computed(() => Math.max(1, ...this.match().participants.map((p) => p.damage ?? 0)));
  protected readonly maxTaken = computed(() => Math.max(1, ...this.match().participants.map((p) => p.damageTaken ?? 0)));
  protected readonly hasBuilds = computed(() => this.match().participants.some((p) => p.items));

  protected readonly short = shortRank;

  protected tierKey(soloTier: string | null): string {
    return soloTier?.split(' ')[0] ?? 'UNRANKED';
  }

  protected tierTitle(soloTier: string | null): string {
    return soloTier ? soloTier.split(' ').map((w, i) => (i === 0 ? titleCase(w) : w)).join(' ') : 'Unranked';
  }

  protected share(value: number | undefined, max: number): number {
    return ((value ?? 0) / max) * 100;
  }

  protected fmt(value: number | undefined): string {
    return value === undefined ? '–' : value.toLocaleString();
  }

  protected ordinal(n: number): string {
    const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return n + suffix;
  }
}
