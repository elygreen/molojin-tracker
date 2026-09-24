import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, shareReplay, switchMap } from 'rxjs';

const CDN = 'https://ddragon.leagueoflegends.com/cdn';
// Used until versions.json answers, and if it never does.
const FALLBACK_VERSION = '15.18.1';

interface SummonerJson {
  data: Record<string, { key: string; name: string; image: { full: string } }>;
}
interface RuneStyle {
  id: number;
  name: string;
  icon: string;
  slots: { runes: { id: number; name: string; icon: string }[] }[];
}

export interface IconRef {
  url: string;
  name: string;
}

/** Resolves champion, item, spell and rune ids to Data Dragon image URLs. */
@Injectable({ providedIn: 'root' })
export class DdragonService {
  private readonly http = inject(HttpClient);

  private readonly version$ = this.http
    .get<string[]>('https://ddragon.leagueoflegends.com/api/versions.json')
    .pipe(
      map((v) => v[0]),
      catchError(() => of(FALLBACK_VERSION)),
      shareReplay(1),
    );

  private readonly latestVersion = toSignal(this.version$);
  readonly version = computed(() => this.latestVersion() ?? FALLBACK_VERSION);

  private readonly spells = toSignal(
    this.version$.pipe(
      switchMap((v) =>
        this.http.get<SummonerJson>(`${CDN}/${v}/data/en_US/summoner.json`).pipe(
          map((json) => {
            const byId = new Map<number, IconRef>();
            for (const s of Object.values(json.data)) {
              byId.set(Number(s.key), { url: `${CDN}/${v}/img/spell/${s.image.full}`, name: s.name });
            }
            return byId;
          }),
        ),
      ),
      catchError(() => of(new Map<number, IconRef>())),
    ),
  );

  private readonly runes = toSignal(
    this.version$.pipe(
      switchMap((v) => this.http.get<RuneStyle[]>(`${CDN}/${v}/data/en_US/runesReforged.json`)),
      map((styles) => {
        const byId = new Map<number, IconRef>();
        for (const style of styles) {
          byId.set(style.id, { url: `${CDN}/img/${style.icon}`, name: style.name });
          for (const slot of style.slots) {
            for (const rune of slot.runes) {
              byId.set(rune.id, { url: `${CDN}/img/${rune.icon}`, name: rune.name });
            }
          }
        }
        return byId;
      }),
      catchError(() => of(new Map<number, IconRef>())),
    ),
  );

  champion(name: string): string {
    // Match data spells it "FiddleSticks"; the image is "Fiddlesticks.png".
    const file = name === 'FiddleSticks' ? 'Fiddlesticks' : name;
    return `${CDN}/${this.version()}/img/champion/${file}.png`;
  }

  item(id: number): string | null {
    return id ? `${CDN}/${this.version()}/img/item/${id}.png` : null;
  }

  profileIcon(id: number): string {
    return `${CDN}/${this.version()}/img/profileicon/${id}.png`;
  }

  spell(id: number): IconRef | null {
    return this.spells()?.get(id) ?? null;
  }

  rune(id: number | null): IconRef | null {
    return id === null ? null : (this.runes()?.get(id) ?? null);
  }
}
