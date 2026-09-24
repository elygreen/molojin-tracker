import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DdragonService } from '../core/ddragon.service';
import { APEX_TIERS, TIER_COLORS, rankLabel, timeAgo, winRate } from '../core/format';
import { PlayerData } from '../core/models';
import { GameIcon } from '../ui/game-icon';

@Component({
  selector: 'app-profile-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameIcon],
  template: `
    <div class="who">
      <div class="avatar">
        <app-game-icon
          [src]="dd.profileIcon(data().profile.profileIconId)"
          alt="Profile icon"
          [fallback]="data().profile.gameName.charAt(0)"
        />
        <span class="level">{{ data().profile.summonerLevel }}</span>
      </div>
      <div>
        <h1>
          {{ data().profile.gameName }}<span class="tag">#{{ data().profile.tagLine }}</span>
        </h1>
        <p class="meta">
          {{ data().profile.platform.toUpperCase() }} · updated {{ updated() }}
        </p>
      </div>
    </div>

    <div class="rank">
      <div class="queue-label">Ranked Solo/Duo</div>
      @if (rank(); as r) {
        <div class="rank-body">
          <div class="emblem" [style.--tier]="tierColor()" aria-hidden="true">
            <span>{{ emblemText() }}</span>
          </div>
          <div class="rank-text">
            <strong>{{ label() }}</strong>
            <span class="lp">{{ r.lp }} LP</span>
            <span class="record">
              {{ r.wins }}W {{ r.losses }}L · <b>{{ wr() }}%</b>
              @if (r.hotStreak) {
                <span class="streak" title="On a win streak">🔥</span>
              }
            </span>
            <div class="bar" role="img" [attr.aria-label]="'Win rate ' + wr() + '%'">
              <div class="fill" [style.width.%]="wr()"></div>
            </div>
          </div>
        </div>
      } @else {
        <p class="unranked">Unranked this season</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr minmax(260px, 340px);
      gap: 16px;
      align-items: center;
    }
    @media (max-width: 640px) {
      :host {
        grid-template-columns: 1fr;
      }
    }
    .who {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .avatar {
      position: relative;
      flex: none;
      --icon-size: 84px;
      --icon-radius: 14px;
    }
    .avatar app-game-icon {
      border: var(--line) solid var(--ink);
    }
    .level {
      position: absolute;
      bottom: -10px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--ink);
      color: var(--butter);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 1px 8px;
      border-radius: 99px;
    }
    h1 {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(1.6rem, 5vw, 2.3rem);
      font-weight: 400;
      line-height: 1.05;
      overflow-wrap: anywhere;
    }
    .tag {
      color: var(--ink-soft);
      font-size: 0.6em;
      margin-left: 4px;
    }
    .meta {
      margin: 6px 0 0;
      color: var(--ink-soft);
      font-size: 0.85rem;
    }
    .rank {
      background: var(--butter);
      border: var(--line) solid var(--ink);
      border-radius: 10px;
      padding: 10px 14px 14px;
    }
    .queue-label {
      font-family: var(--font-display);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.85rem;
      margin-bottom: 8px;
    }
    .rank-body {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .emblem {
      flex: none;
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      background: var(--tier);
      border: var(--line) solid var(--ink);
      clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
      position: relative;
    }
    .emblem::after {
      content: '';
      position: absolute;
      inset: 5px;
      clip-path: inherit;
      border: 2px solid rgb(255 255 255 / 0.5);
      background: linear-gradient(160deg, rgb(255 255 255 / 0.35), transparent 60%);
    }
    .emblem span {
      font-family: var(--font-display);
      color: #fff;
      font-size: 1.35rem;
      text-shadow: 0 2px 0 var(--ink);
      z-index: 1;
    }
    .rank-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .rank-text strong {
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 1.35rem;
    }
    .lp {
      font-weight: 700;
    }
    .record {
      font-size: 0.85rem;
      color: var(--ink-soft);
    }
    .record b {
      color: var(--ink);
    }
    .bar {
      margin-top: 6px;
      height: 12px;
      border: 2px solid var(--ink);
      border-radius: 99px;
      background: var(--loss);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      background: var(--win);
      border-right: 2px solid var(--ink);
    }
    .unranked {
      margin: 0;
      font-weight: 600;
    }
  `,
})
export class ProfileCard {
  readonly data = input.required<PlayerData>();
  protected readonly dd = inject(DdragonService);

  protected readonly rank = computed(() => this.data().soloRank);
  protected readonly label = computed(() => {
    const r = this.rank();
    return r ? rankLabel(r.tier, r.rank) : '';
  });
  protected readonly tierColor = computed(() => TIER_COLORS[this.rank()?.tier ?? ''] ?? 'var(--slot)');
  protected readonly emblemText = computed(() => {
    const r = this.rank();
    if (!r) return '';
    return APEX_TIERS.has(r.tier) ? r.tier.charAt(0) : r.tier.charAt(0) + r.rank;
  });
  protected readonly wr = computed(() => {
    const r = this.rank();
    return r ? winRate(r.wins, r.wins + r.losses) : 0;
  });
  protected readonly updated = computed(() => timeAgo(Date.parse(this.data().updatedAt)));
}
