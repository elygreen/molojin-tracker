import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';

/**
 * An icon from Data Dragon with a flat fallback tile, so a missing image or an
 * empty item slot still keeps the grid lined up.
 */
@Component({
  selector: 'app-game-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src() && !failed()) {
      <img [src]="src()" [alt]="alt()" [title]="alt()" loading="lazy" (error)="failed.set(true)" />
    } @else if (fallback()) {
      <span class="fallback" [title]="alt()">{{ fallback() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      width: var(--icon-size, 24px);
      height: var(--icon-size, 24px);
      border-radius: var(--icon-radius, 5px);
      background: var(--slot);
      overflow: hidden;
      flex: none;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .fallback {
      font-family: var(--font-display);
      font-size: calc(var(--icon-size, 24px) * 0.42);
      color: var(--ink);
    }
  `,
})
export class GameIcon {
  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly fallback = input('');

  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });
}
