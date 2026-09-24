import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; added: number }
  | { kind: 'error'; message: string };

/** The ↻ Update button next to the match history title. */
@Component({
  selector: 'app-update-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [disabled]="!enabled() || state().kind === 'loading'"
      [title]="tooltip()"
      [class.error]="state().kind === 'error'"
      (click)="pressed.emit()"
    >
      <span class="icon" [class.spin]="state().kind === 'loading'" aria-hidden="true">↻</span>
      <span>{{ label() }}</span>
    </button>
    <span class="sr-only" aria-live="polite">{{ state().kind === 'idle' ? '' : tooltip() }}</span>
  `,
  styles: `
    :host {
      display: flex;
    }
    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 100%;
      font: inherit;
      font-family: var(--font-display);
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
      color: #fff;
      background: var(--win-ink);
      border: var(--line) solid var(--ink);
      border-radius: 8px;
      padding: 4px 14px;
      box-shadow: 0 3px 0 var(--ink);
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    button:hover:not(:disabled) {
      transform: translateY(1px);
      box-shadow: 0 2px 0 var(--ink);
    }
    button:active:not(:disabled) {
      transform: translateY(3px);
      box-shadow: 0 0 0 var(--ink);
    }
    button:disabled {
      cursor: default;
      opacity: 0.6;
    }
    button:focus-visible {
      outline: 3px solid var(--peri-deep);
      outline-offset: 2px;
    }
    button.error {
      background: var(--loss-ink);
    }
    .icon {
      display: inline-block;
      font-family: var(--font-body);
      font-size: 1.05rem;
      line-height: 1;
    }
    .spin {
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spin {
        animation: none;
      }
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class UpdateButton {
  readonly state = input.required<UpdateState>();
  /** False until the update Worker's URL is set in public/config.json. */
  readonly enabled = input(true);
  readonly pressed = output();

  protected readonly label = computed(() => {
    const s = this.state();
    switch (s.kind) {
      case 'loading':
        return 'Updating…';
      case 'done':
        return s.added ? `+${s.added} new` : 'Up to date';
      case 'error':
        return 'Retry';
      default:
        return 'Update';
    }
  });

  protected readonly tooltip = computed(() => {
    const s = this.state();
    if (!this.enabled()) return "Live updates aren't set up yet";
    switch (s.kind) {
      case 'loading':
        return 'Fetching your latest games from Riot…';
      case 'done':
        return s.added ? `Added ${s.added} new game${s.added === 1 ? '' : 's'}` : 'No new games since the last update';
      case 'error':
        return `Update failed: ${s.message}`;
      default:
        return 'Pull in new games from Riot now';
    }
  });
}
