import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { TrackerDataService } from './core/tracker-data.service';
import { PlayerPage } from './player/player-page';

/** Sends the bare URL to the first player listed in players.json. */
const firstPlayer = () => {
  const router = inject(Router);
  return toObservable(inject(TrackerDataService).players).pipe(
    filter((players) => players !== undefined),
    take(1),
    map((players) => (players.length ? router.createUrlTree(['/', players[0].id]) : true)),
  );
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [firstPlayer], component: PlayerPage },
  { path: ':id', component: PlayerPage },
];
