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
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .avatar {
      position: relative;
      flex: none;
      --icon-size: 52px;
      --icon-radius: 10px;
    }
    .avatar app-game-icon {
      border: var(--line) solid var(--ink);
    }
    .level {
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--ink);
      color: var(--butter);
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0 6px;
      border-radius: 99px;
    }
    h1 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.3rem;
      font-weight: 400;
      line-height: 1.1;
      overflow-wrap: anywhere;
    }
    .tag {
      color: var(--ink-soft);
      font-size: 0.65em;
      margin-left: 3px;
    }
    .meta {
      margin: 3px 0 0;
      color: var(--ink-soft);
      font-size: 0.72rem;
    }
    .rank {
      background: var(--butter);
      border: var(--line) solid var(--ink);
      border-radius: 8px;
      padding: 8px 10px 10px;
    }
    .queue-label {
      font-family: var(--font-display);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.7rem;
      margin-bottom: 6px;
    }
    .rank-body {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .emblem {
      flex: none;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      background: var(--tier);
      clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
      position: relative;
    }
    .emblem::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(160deg, rgb(255 255 255 / 0.4), transparent 60%);
    }
    .emblem span {
      font-family: var(--font-display);
      color: #fff;
      font-size: 0.95rem;
      text-shadow: 0 1px 0 var(--ink);
      z-index: 1;
    }
    .rank-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
      font-size: 0.8rem;
    }
    .rank-text strong {
      font-family: var(--font-display);
      font-weight: 400;
      font-size: 1.05rem;
      line-height: 1.1;
    }
    .lp {
      font-weight: 700;
    }
    .record {
      font-size: 0.72rem;
      color: var(--ink-soft);
    }
    .record b {
      color: var(--ink);
    }
    .bar {
      margin-top: 4px;
      height: 8px;
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
