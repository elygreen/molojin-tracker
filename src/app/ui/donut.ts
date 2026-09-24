import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Chunky ring gauge in the style of the reference infographic's percentage donuts. */
@Component({
  selector: 'app-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 100 100" role="img" [attr.aria-label]="label() + ': ' + percent() + '%'">
      <circle class="track" cx="50" cy="50" r="38" [style.stroke]="trackColor()" />
      <circle
        class="value"
        cx="50"
        cy="50"
        r="38"
        [style.stroke]="color()"
        [attr.stroke-dasharray]="dash()"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="50" class="pct">{{ percent() }}%</text>
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: var(--donut-size, 96px);
      aspect-ratio: 1;
    }
    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    circle {
      fill: none;
      stroke-width: 16;
    }
    .value {
      stroke-linecap: butt;
    }
    .pct {
      font-family: var(--font-display);
      font-size: 20px;
      fill: var(--ink);
      text-anchor: middle;
      dominant-baseline: central;
    }
  `,
})
export class Donut {
  readonly percent = input.required<number>();
  readonly label = input('');
  readonly color = input('var(--win)');
  readonly trackColor = input('var(--loss)');

  private readonly circumference = 2 * Math.PI * 38;
  protected readonly dash = computed(() => {
    const filled = (Math.max(0, Math.min(100, this.percent())) / 100) * this.circumference;
    return `${filled} ${this.circumference}`;
  });
}
