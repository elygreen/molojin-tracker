import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { rankLabel, winRate } from './core/format';
import { LP_PER_WIN, MastersTracker } from './core/masters';
import { PlayerConfig } from './core/models';
import { TrackerDataService } from './core/tracker-data.service';
import { Confetti } from './ui/confetti';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Confetti],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly players = inject(TrackerDataService).players;
  protected readonly masters = inject(MastersTracker);
  protected readonly lpPerWin = LP_PER_WIN;

  /** Title bar style being previewed via ?mast=1…4; empty is the current look. */
  protected readonly variant = new URLSearchParams(location.search).get('mast') ?? '';

  protected readonly rankText = computed(() => {
    const r = this.masters.rank();
    return r ? rankLabel(r.tier, r.rank) : '';
  });

  protected readonly ticker = computed(() => {
    const r = this.masters.rank();
    if (!r) return [];
    const items = [
      `${rankLabel(r.tier, r.rank)} · ${r.lp} LP`,
      `${r.wins}W ${r.losses}L`,
      `${winRate(r.wins, r.wins + r.losses)}% win rate`,
    ];
    const wins = this.masters.winsLeft();
    if (wins) items.push(`${wins} wins to Masters`);
    if (r.hotStreak) items.push('On a heater');
    return items;
  });

  private readonly routeId = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.split(/[/?#]/).filter(Boolean)[0] ?? ''),
    ),
    { initialValue: '' },
  );

  /** The player whose page is open; the title's name chip will become the player switcher. */
  protected readonly current = computed<PlayerConfig | null>(() => {
    const players = this.players() ?? [];
    return players.find((p) => p.id === this.routeId()) ?? players[0] ?? null;
  });
}
