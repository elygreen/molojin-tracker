import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { APEX_FLOOR, TIERS, TIER_COLORS, absoluteLp, bandLabel, rankLabel } from '../core/format';
import { RankSnapshot } from '../core/models';

const HEIGHT = 200;
const PAD = { top: 12, right: 14, bottom: 24, left: 50 };

interface Point {
  x: number;
  y: number;
  snap: RankSnapshot;
  /** Games played since the first snapshot. */
  game: number;
  abs: number;
  delta: number | null;
  games: number;
  result: 'win' | 'loss' | 'mixed' | null;
}

/**
 * LP over time. Each workflow run that sees the rank change stores a snapshot,
 * so every game adds a point (two games between runs share one segment).
 * The y-axis is continuous LP: faint lines every division, bold lines at tiers.
 */
@Component({
  selector: 'app-lp-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (width() > 0) {
      <svg
        [attr.width]="width()"
        [attr.height]="height"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height"
        role="img"
        [attr.aria-label]="summary()"
        (pointermove)="hover($event)"
        (pointerleave)="active.set(null)"
      >
        @for (b of bands(); track b.floor) {
          <rect
            [attr.x]="pad.left"
            [attr.y]="b.yTop"
            [attr.width]="plotW()"
            [attr.height]="b.yBottom - b.yTop"
            [attr.fill]="b.color"
            opacity="0.1"
          />
          @if (b.showLabel) {
            <text class="band-label" [attr.x]="pad.left - 8" [attr.y]="(b.yTop + b.yBottom) / 2">
              {{ b.label }}
            </text>
          }
        }
        @for (l of lines(); track l.lp) {
          <line
            [class.tier-line]="l.tier"
            [class.div-line]="!l.tier"
            [attr.x1]="pad.left"
            [attr.x2]="width() - pad.right"
            [attr.y1]="l.y"
            [attr.y2]="l.y"
          />
          @if (l.tier) {
            <text class="tier-label" [attr.x]="width() - pad.right - 4" [attr.y]="l.y - 4">{{ l.tier }}</text>
          }
        }

        @for (t of xTicks(); track t.game) {
          <text class="x-tick" [attr.x]="t.x" [attr.y]="height - 6">{{ t.game }}</text>
        }
        <text class="x-title" [attr.x]="pad.left" [attr.y]="height - 6">Games</text>

        @if (activePoint(); as a) {
          <line class="crosshair" [attr.x1]="a.x" [attr.x2]="a.x" [attr.y1]="pad.top" [attr.y2]="height - pad.bottom" />
        }

        <path class="lp-line" [attr.d]="path()" />

        @for (p of points(); track p.snap.t) {
          @if (showDots() || p === activePoint() || $last) {
            <circle
              [class]="'dot ' + (p.result ?? 'start')"
              [attr.cx]="p.x"
              [attr.cy]="p.y"
              [attr.r]="p === activePoint() ? 6 : 4.5"
            />
          }
        }
      </svg>

      @if (points().length === 1) {
        <p class="first-note">
          LP tracking started {{ startDate() }}. Each game you play from now on adds a point.
        </p>
      }

      @if (activePoint(); as a) {
        <div
          class="tip"
          [style.left.px]="a.x"
          [style.top.px]="a.y"
          [class.flip]="a.x > width() - 170"
        >
          <strong>{{ label(a.snap) }} · {{ a.snap.lp }} LP</strong>
          @if (a.delta !== null) {
            <span [class.up]="a.delta > 0" [class.down]="a.delta < 0">
              {{ a.delta > 0 ? '+' : '' }}{{ a.delta }} LP
              @if (a.games === 1) {
                · {{ a.result === 'win' ? 'Win' : 'Loss' }}
              } @else if (a.games > 1) {
                · {{ a.games }} games
              }
            </span>
          } @else {
            <span>Tracking started</span>
          }
          <small>{{ date(a.snap.t) }}</small>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
    }
    svg {
      display: block;
      overflow: visible;
      touch-action: pan-y;
    }
    .band-label {
      font-size: 10px;
      font-weight: 700;
      fill: var(--ink-soft);
      text-anchor: end;
      dominant-baseline: central;
    }
    .div-line {
      stroke: var(--ink);
      stroke-opacity: 0.18;
      stroke-dasharray: 3 4;
    }
    .tier-line {
      stroke: var(--ink);
      stroke-width: 2;
      stroke-opacity: 0.75;
    }
    .tier-label {
      font-family: var(--font-display);
      font-size: 10px;
      letter-spacing: 0.06em;
      fill: var(--ink);
      text-anchor: end;
    }
    .x-tick {
      font-size: 10px;
      fill: var(--ink-soft);
      text-anchor: middle;
    }
    .x-title {
      font-size: 10px;
      fill: var(--ink-soft);
      text-anchor: end;
      transform: translateX(-8px);
    }
    .crosshair {
      stroke: var(--ink);
      stroke-opacity: 0.35;
    }
    .lp-line {
      fill: none;
      stroke: var(--ink);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .dot {
      stroke: var(--cream);
      stroke-width: 2;
      fill: var(--ink);
    }
    .dot.win {
      fill: var(--win-ink);
    }
    .dot.loss {
      fill: var(--loss-ink);
    }
    .first-note {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      margin: 0;
      max-width: 80%;
      text-align: center;
      font-size: 0.75rem;
      background: var(--cream);
      border: 2px solid var(--ink);
      border-radius: 8px;
      padding: 4px 10px;
    }
    .tip {
      position: absolute;
      transform: translate(12px, -50%);
      display: flex;
      flex-direction: column;
      gap: 1px;
      pointer-events: none;
      white-space: nowrap;
      background: var(--cream);
      border: 2px solid var(--ink);
      border-radius: 8px;
      padding: 5px 9px;
      font-size: 0.72rem;
      box-shadow: 0 3px 0 var(--ink);
      z-index: 2;
    }
    .tip.flip {
      transform: translate(calc(-100% - 12px), -50%);
    }
    .tip .up {
      color: var(--win-ink);
      font-weight: 700;
    }
    .tip .down {
      color: var(--loss-ink);
      font-weight: 700;
    }
    .tip small {
      color: var(--ink-soft);
    }
  `,
})
export class LpChart {
  readonly history = input.required<RankSnapshot[]>();

  protected readonly height = HEIGHT;
  protected readonly pad = PAD;
  protected readonly width = signal(0);
  protected readonly active = signal<number | null>(null);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const observer = new ResizeObserver(([entry]) => this.width.set(Math.floor(entry.contentRect.width)));
    observer.observe(host);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  protected readonly plotW = computed(() => Math.max(0, this.width() - PAD.left - PAD.right));
  private readonly plotH = HEIGHT - PAD.top - PAD.bottom;

  private readonly raw = computed(() =>
    this.history()
      .filter((s) => TIERS.includes(s.tier))
      .map((s) => ({ snap: s, abs: absoluteLp(s.tier, s.rank, s.lp), total: s.wins + s.losses })),
  );

  /** LP range padded out to whole divisions, at least three divisions tall. */
  private readonly domain = computed(() => {
    const abs = this.raw().map((r) => r.abs);
    if (!abs.length) return { lo: 0, hi: 300 };
    let lo = Math.floor((Math.min(...abs) - 25) / 100) * 100;
    let hi = Math.ceil((Math.max(...abs) + 25) / 100) * 100;
    while (hi - lo < 300) {
      hi += 100;
      if (hi - lo < 300) lo -= 100;
    }
    return { lo: Math.max(0, lo), hi };
  });

  private readonly maxGame = computed(() => {
    const r = this.raw();
    return r.length ? Math.max(1, r[r.length - 1].total - r[0].total) : 1;
  });

  private yOf(abs: number): number {
    const { lo, hi } = this.domain();
    return PAD.top + (1 - (abs - lo) / (hi - lo)) * this.plotH;
  }

  private xOf(game: number): number {
    return PAD.left + (game / this.maxGame()) * this.plotW();
  }

  protected readonly points = computed<Point[]>(() => {
    const r = this.raw();
    const first = r[0]?.total ?? 0;
    return r.map((cur, i) => {
      const prev = r[i - 1];
      const game = cur.total - first;
      let result: Point['result'] = null;
      if (prev) {
        const w = cur.snap.wins - prev.snap.wins;
        const l = cur.snap.losses - prev.snap.losses;
        result = w > 0 && l === 0 ? 'win' : l > 0 && w === 0 ? 'loss' : 'mixed';
      }
      return {
        // A lone snapshot sits at the left edge so the note beside it has room.
        x: this.xOf(r.length === 1 ? 0 : game),
        y: this.yOf(cur.abs),
        snap: cur.snap,
        game,
        abs: cur.abs,
        delta: prev ? cur.abs - prev.abs : null,
        games: prev ? cur.total - prev.total : 0,
        result,
      };
    });
  });

  /** Per-game dots only while each game gets at least ~10px; the line carries it otherwise. */
  protected readonly showDots = computed(() => this.plotW() / this.maxGame() >= 10);

  protected readonly path = computed(() =>
    this.points()
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(''),
  );

  protected readonly bands = computed(() => {
    const { lo, hi } = this.domain();
    const bandPx = (100 / (hi - lo)) * this.plotH;
    const out = [];
    for (let floor = lo; floor < hi; floor += 100) {
      const tier = floor >= APEX_FLOOR ? 'MASTER' : TIERS[Math.floor(floor / 400)];
      out.push({
        floor,
        yTop: this.yOf(floor + 100),
        yBottom: this.yOf(floor),
        color: TIER_COLORS[tier],
        label: bandLabel(floor),
        showLabel: bandPx >= 12,
      });
    }
    return out;
  });

  protected readonly lines = computed(() => {
    const { lo, hi } = this.domain();
    const out: { lp: number; y: number; tier: string | null }[] = [];
    for (let lp = lo; lp <= hi; lp += 100) {
      const isTier = lp <= APEX_FLOOR && lp % 400 === 0;
      out.push({ lp, y: this.yOf(lp), tier: isTier ? (TIERS[lp / 400] ?? null) : null });
    }
    return out;
  });

  protected readonly xTicks = computed(() => {
    const max = this.maxGame();
    if (this.points().length < 2) return [];
    const target = Math.max(2, Math.floor(this.plotW() / 70));
    const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => max / s <= target) ?? 200;
    const ticks = [];
    for (let g = 0; g <= max; g += step) ticks.push({ game: g, x: this.xOf(g) });
    return ticks;
  });

  protected readonly activePoint = computed(() => {
    const i = this.active();
    return i === null ? null : (this.points()[i] ?? null);
  });

  protected readonly summary = computed(() => {
    const p = this.points();
    if (!p.length) return 'No LP history yet';
    const last = p[p.length - 1];
    return `LP over ${last.game} games, now ${this.label(last.snap)} ${last.snap.lp} LP`;
  });

  protected readonly startDate = computed(() => {
    const first = this.points()[0];
    return first ? this.date(first.snap.t) : '';
  });

  protected hover(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const x = event.clientX - svg.getBoundingClientRect().left;
    let best: number | null = null;
    let bestDist = Infinity;
    this.points().forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    this.active.set(best);
  }

  protected label(s: RankSnapshot): string {
    return rankLabel(s.tier, s.rank);
  }

  protected date(t: number): string {
    return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
}
