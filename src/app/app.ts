import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { TrackerDataService } from './core/tracker-data.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly players = inject(TrackerDataService).players;

  private readonly routeId = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.split(/[/?#]/).filter(Boolean)[0] ?? ''),
    ),
    { initialValue: '' },
  );

  /** The player whose page is open; the title's name chip will become the player switcher. */
  protected readonly current = computed(() => {
    const players = this.players() ?? [];
    return players.find((p) => p.id === this.routeId()) ?? players[0] ?? null;
  });
}
