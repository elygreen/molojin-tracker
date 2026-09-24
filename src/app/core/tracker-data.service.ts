import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, of } from 'rxjs';
import { PlayerConfig, PlayerData } from './models';

/** Reads the static JSON the GitHub Action commits under public/. */
@Injectable({ providedIn: 'root' })
export class TrackerDataService {
  private readonly http = inject(HttpClient);

  readonly players = toSignal(
    this.http.get<PlayerConfig[]>('players.json').pipe(catchError(() => of([] as PlayerConfig[]))),
  );

  /** Emits null when the player has no data file yet. */
  playerData(id: string): Observable<PlayerData | null> {
    return this.http.get<PlayerData>(`data/${id}.json`).pipe(catchError(() => of(null)));
  }
}
