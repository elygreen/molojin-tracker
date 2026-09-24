import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type Wave = 'sine' | 'square' | 'tight' | 'zigzag';

const WAVE_PATHS: Record<Wave, string> = {
  sine: 'M0 20 Q 12.5 2 25 20 T 50 20 T 75 20 T 100 20',
  square: 'M0 28 H12 V12 H25 V28 H37 V12 H50 V28 H62 V12 H75 V28 H87 V12 H100',
  tight: 'M0 20 Q 4 6 8 20 T 16 20 T 24 20 T 32 20 T 40 20 T 48 20 T 56 20 T 64 20 T 72 20 T 80 20 T 88 20 T 96 20 T 104 20',
  zigzag: 'M0 28 L10 12 L20 28 L30 12 L40 28 L50 12 L60 28 L70 12 L80 28 L90 12 L100 28',
};

/**
 * The poster-style heading from the reference art: a small colored tile with a
 * waveform next to a pale-yellow title bar.
 */
@Component({
  selector: 'app-section-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tile" [style.background]="tileColor()" aria-hidden="true">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
        <path [attr.d]="path()" />
      </svg>
    </div>
    <h2 class="bar">{{ text() }}</h2>
  `,
  styles: `
    :host {
      display: flex;
      gap: 10px;
      align-items: stretch;
      margin: 0 0 14px;
    }
    :host(.flip) {
      flex-direction: row-reverse;
    }
    .tile {
      flex: 0 0 76px;
      border: var(--line) solid var(--ink);
      border-radius: 8px;
      display: grid;
      place-items: center;
      padding: 4px 8px;
    }
    svg {
      width: 100%;
      height: 26px;
      overflow: visible;
    }
    path {
      fill: none;
      stroke: var(--cream);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .bar {
      flex: 1;
      margin: 0;
      background: var(--butter);
      border: var(--line) solid var(--ink);
      border-radius: 8px;
      padding: 6px 16px;
      font-family: var(--font-display);
      font-size: clamp(1.15rem, 3.4vw, 1.6rem);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink);
      text-align: center;
    }
  `,
})
export class SectionTitle {
  readonly text = input.required<string>();
  readonly wave = input<Wave>('sine');
  readonly tileColor = input('var(--peri-deep)');

  protected readonly path = computed(() => WAVE_PATHS[this.wave()]);
}
