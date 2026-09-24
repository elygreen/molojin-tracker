import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DdragonService } from '../core/ddragon.service';
import { duration, kdaRatio, timeAgo } from '../core/format';
import { Match } from '../core/models';
import { GameIcon } from '../ui/game-icon';

@Component({
  selector: 'app-match-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GameIcon],
  host: {
    '[class.win]': 'outcome() === "win"',
    '[class.loss]': 'outcome() === "loss"',
    '[class.remake]': 'outcome() === "remake"',
  },
  template: `
    <div class="result">
      <span class="queue">Ranked Solo</span>
      <span class="ago" [title]="startedAt()">{{ ago() }}</span>
      <span class="divider"></span>
      <strong class="outcome">{{ outcomeLabel() }}</strong>
      <span class="len">{{ length() }}</span>
      @if (match().lpChange !== null) {
        <span class="lp" [class.neg]="match().lpChange! < 0">
          {{ match().lpChange! > 0 ? '+' : '' }}{{ match().lpChange }} LP
        </span>
      }
    </div>

    <div class="loadout">
      <div class="champ">
        <app-game-icon
          [src]="dd.champion(match().champion)"
          [alt]="match().champion"
          [fallback]="match().champion.slice(0, 2)"
        />
        <span class="lvl">{{ match().champLevel }}</span>
      </div>
      <div class="stack">
        @for (s of match().spells; track $index) {
          <app-game-icon [src]="dd.spell(s)?.url ?? null" [alt]="dd.spell(s)?.name ?? 'Summoner spell'" />
        }
      </div>
      <div class="stack runes">
        <app-game-icon [src]="dd.rune(match().keystone)?.url ?? null" [alt]="dd.rune(match().keystone)?.name ?? 'Keystone'" />
        <app-game-icon
          class="sub"
          [src]="dd.rune(match().secondaryStyle)?.url ?? null"
          [alt]="dd.rune(match().secondaryStyle)?.name ?? 'Secondary tree'"
        />
      </div>
      <div class="kda">
        <div class="kda-nums">
          {{ match().kills }} / <span class="deaths">{{ match().deaths }}</span> / {{ match().assists }}
        </div>
        <div class="kda-ratio">{{ ratio() }}{{ ratio() === 'Perfect' ? '' : ':1' }} KDA</div>
        @if (match().multikill) {
          <span class="multikill">{{ match().multikill }}</span>
        }
      </div>
    </div>

    <ul class="stats">
      <li><span>P/Kill</span> {{ kp() }}%</li>
      <li><span>CS</span> {{ match().cs }} ({{ csPerMin() }})</li>
      <li><span>Vision</span> {{ match().visionScore }}</li>
      <li><span>Dmg</span> {{ damage() }}</li>
    </ul>

    <div class="items">
      @for (item of match().items; track $index) {
        <app-game-icon [src]="dd.item(item)" [alt]="'Item ' + item" />
      }
      <app-game-icon class="trinket" [src]="dd.item(match().trinket)" alt="Trinket" />
    </div>

    <div class="teams">
      @for (team of teams(); track $index) {
        <ul>
          @for (p of team; track p.puuid) {
            <li [class.me]="p.puuid === puuid()">
              <app-game-icon [src]="dd.champion(p.champion)" [alt]="p.champion" [fallback]="p.champion.charAt(0)" />
              <span class="pname" [title]="p.gameName + '#' + p.tagLine">{{ p.gameName }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styleUrl: './match-card.scss',
})
export class MatchCard {
  readonly match = input.required<Match>();
  readonly puuid = input.required<string>();
  protected readonly dd = inject(DdragonService);

  protected readonly outcome = computed(() => (this.match().remake ? 'remake' : this.match().win ? 'win' : 'loss'));
  protected readonly outcomeLabel = computed(
    () => ({ win: 'Victory', loss: 'Defeat', remake: 'Remake' })[this.outcome()],
  );
  protected readonly ago = computed(() => timeAgo(this.match().gameStart));
  protected readonly startedAt = computed(() => new Date(this.match().gameStart).toLocaleString());
  protected readonly length = computed(() => duration(this.match().durationSec));
  protected readonly ratio = computed(() => {
    const m = this.match();
    return kdaRatio(m.kills, m.deaths, m.assists);
  });
  protected readonly kp = computed(() => Math.round(this.match().killParticipation * 100));
  protected readonly csPerMin = computed(() =>
    (this.match().cs / Math.max(1, this.match().durationSec / 60)).toFixed(1),
  );
  protected readonly damage = computed(() => this.match().damage.toLocaleString());
  protected readonly teams = computed(() => {
    const ps = this.match().participants;
    return [ps.filter((p) => p.teamId === 100), ps.filter((p) => p.teamId === 200)];
  });
}
