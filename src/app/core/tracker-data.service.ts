import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, of } from 'rxjs';
import { PlayerConfig, PlayerData } from './models';

export interface SiteConfig {
  /** The Cloudflare Worker behind the Update button (see worker/README.md); empty disables it. */
  updateUrl: string;
}

/** What the update Worker returns: the latest few games plus current rank. */
export type LiveUpdate = Pick<PlayerData, 'updatedAt' | 'profile' | 'soloRank' | 'matches'> & {
  /** True when the Worker also started the workflow that saves these games to the site. */
  persisting?: boolean;
};

/** Reads the static JSON the GitHub Action commits under public/. */
@Injectable({ providedIn: 'root' })
export class TrackerDataService {
  private readonly http = inject(HttpClient);

  readonly players = toSignal(
    this.http.get<PlayerConfig[]>('players.json').pipe(catchError(() => of([] as PlayerConfig[]))),
  );

  readonly config = toSignal(
    this.http.get<SiteConfig>('config.json').pipe(catchError(() => of({ updateUrl: '' }))),
  );

  /** Emits null when the player has no data file yet. */
  playerData(id: string): Observable<PlayerData | null> {
    return this.http.get<PlayerData>(`data/${id}.json`).pipe(catchError(() => of(null)));
  }

  /** Asks the update Worker for the player's latest games straight from Riot. */
  fetchLatest(id: string, newestKnown: string | undefined): Observable<LiveUpdate> {
    const base = this.config()?.updateUrl.replace(/\/$/, '') ?? '';
    const params: Record<string, string> = { player: id };
    if (newestKnown) params['known'] = newestKnown;
    return this.http.get<LiveUpdate>(`${base}/update`, { params });
  }
}
