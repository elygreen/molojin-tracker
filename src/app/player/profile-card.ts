import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DdragonService } from '../core/ddragon.service';
import { APEX_TIERS, TIER_COLORS, rankLabel, timeAgo, winRate } from '../core/format';
import { PlayerData } from '../core/models';
import { GameIcon } from '../ui/game-icon';

// Master and up alternates purple and pink sparkles, 8 of each.
const SPARKLE_COUNT: Record<string, number> = { emerald: 6, diamond: 11, apex: 16 };

/** Fixed pseudo-random numbers so sparkles stay put between renders. */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

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
      @if (rank(); as r) {
        <div class="rank-body">
          <div class="emblem-wrap" [class]="flair()" aria-hidden="true">
            <div class="halo">
              <div class="emblem" [style.--tier]="tierColor()">
                <span>{{ emblemText() }}</span>
              </div>
            </div>
            @for (s of sparkles(); track $index) {
              <span
                class="sparkle"
                [class.alt]="s.alt"
                [style.left.%]="s.x"
                [style.top.%]="s.y"
                [style.width.px]="s.size"
                [style.height.px]="s.size"
                [style.animation-delay.s]="s.delay"
                [style.animation-duration.s]="s.duration"
              ></span>
            }
          </div>
          <div class="rank-text">
            <div class="rank-line">
              <strong>{{ label() }}</strong>
              <span class="queue-label">SoloQ</span>
            </div>
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
        <div class="rank-line">
          <p class="unranked">Unranked this season</p>
          <span class="queue-label">SoloQ</span>
        </div>
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
    /* High-tier flair on the emblem: sparkles for Emerald and Diamond, a purple glow from Master up. */
    .emblem-wrap {
      position: relative;
      flex: none;
      --spark: #fff;
      --spark-glow: #fff;
    }
    .emblem-wrap.emerald {
      --spark: #45d980;
      --spark-glow: #12a150;
    }
    .emblem-wrap.diamond {
      --spark: #3ee6ff;
      --spark-glow: #0aa7c9;
    }
    .emblem-wrap.apex {
      --spark: #c9a2ff;
      --spark-glow: #7a3ff0;
    }
    .sparkle.alt {
      --spark: #ff9ad5;
      --spark-glow: #e83e9c;
    }
    /*
     * The hexagon is clipped, so the glow is a drop-shadow on a layer holding
     * only the emblem: it follows the shape and leaves the sparkles crisp.
     */
    .emblem-wrap.apex .halo {
      animation: glow 2.4s ease-in-out infinite alternate;
    }
    @keyframes glow {
      from {
        filter: drop-shadow(0 0 3px #b98cff) drop-shadow(0 0 6px rgb(143 106 214 / 0.6));
      }
      to {
        filter: drop-shadow(0 0 6px #b98cff) drop-shadow(0 0 16px rgb(143 106 214 / 0.95));
      }
    }
    .sparkle {
      position: absolute;
      z-index: 1;
      pointer-events: none;
      translate: -50% -50%;
      background: var(--spark);
      clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
      filter: drop-shadow(0 0 0.5px var(--ink)) drop-shadow(0 0 4px var(--spark-glow));
      animation: twinkle 1.8s ease-in-out infinite both;
      scale: 0;
    }
    @keyframes twinkle {
      0%,
      100% {
        scale: 0;
        rotate: 0deg;
        opacity: 0;
      }
      50% {
        scale: 1;
        rotate: 90deg;
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .sparkle {
        animation: none;
        scale: 0.8;
        opacity: 0.9;
      }
      .emblem-wrap.apex .halo {
        animation: none;
        filter: drop-shadow(0 0 5px #b98cff) drop-shadow(0 0 10px rgb(143 106 214 / 0.8));
      }
    }
    .rank-line {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .queue-label {
      flex: none;
      font-family: var(--font-display);
      letter-spacing: 0.03em;
      font-size: 0.95rem;
      line-height: 1.1;
      opacity: 0.45;
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
      font-size: 1.2rem;
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
  protected readonly flair = computed(() => {
    const tier = this.rank()?.tier;
    return tier === 'EMERALD' ? 'emerald' : tier === 'DIAMOND' ? 'diamond' : tier && APEX_TIERS.has(tier) ? 'apex' : '';
  });

  /** Sparkles in a ring around the emblem, each twinkling on its own timing. */
  protected readonly sparkles = computed(() => {
    const count = SPARKLE_COUNT[this.flair()] ?? 0;
    return Array.from({ length: count }, (_, i) => {
      const angle = ((i + seeded(i) * 0.7) / count) * Math.PI * 2;
      // Percent of the emblem's size from its center: just outside the hexagon's edge.
      const radius = 58 + seeded(i + 50) * 16;
      return {
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
        size: 7 + seeded(i + 100) * 7,
        delay: -seeded(i + 150) * 2,
        duration: 1.3 + seeded(i + 200) * 1.1,
        alt: this.flair() === 'apex' && i % 2 === 1,
      };
    });
  });

  protected readonly wr = computed(() => {
    const r = this.rank();
    return r ? winRate(r.wins, r.wins + r.losses) : 0;
  });
  protected readonly updated = computed(() => timeAgo(Date.parse(this.data().updatedAt)));
}
