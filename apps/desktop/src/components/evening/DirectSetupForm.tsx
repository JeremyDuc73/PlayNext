import type { DirectEveningDraft } from "../../lib/evenings";
import type { GroupMember } from "../../lib/groups";
import type { EveningWhenValue } from "../../lib/paris";
import type { SteamCatalogHit } from "../../lib/steam";
import { Button } from "../../ui/Button";
import { EveningWhenField } from "../../ui/EveningWhen";
import { GamePoster } from "../../ui/GamePoster";
import { SteamSearch } from "../../ui/SteamSearch";

export type DirectSetupFormProps = {
  title: string;
  setTitle: (v: string) => void;
  when: EveningWhenValue;
  setWhen: (v: EveningWhenValue) => void;
  game: DirectEveningDraft | null;
  onPickGame: (hit: SteamCatalogHit) => void;
  onClearGame: () => void;
  members: GroupMember[];
  selectedParticipants: string[];
  toggleParticipant: (id: string) => void;
  busy: boolean;
  onAbort: () => void;
  onLaunch: () => void;
};

export function DirectSetupForm(props: DirectSetupFormProps) {
  return (
    <div className="grid max-w-3xl gap-5 border border-rule-strong p-6">
      <div>
        <p className="pn-data mb-2">Soirée</p>
        <h3 className="pn-display text-4xl">Proposer un jeu</h3>
        <span className="pn-accent mt-3" />
      </div>
      <EveningWhenField value={props.when} onChange={props.setWhen} />
      {props.game ? (
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-4 border border-rule-strong p-3">
          <GamePoster
            name={props.game.name}
            launcher="steam"
            externalId={props.game.appId}
            coverUrl={props.game.coverUrl}
          />
          <div className="self-center">
            <p className="font-ui text-sm font-bold uppercase tracking-[0.08em]">
              {props.game.name}
            </p>
            <p className="pn-data mt-1">{props.game.priceLabel ?? "Steam"}</p>
            <button
              type="button"
              className="pn-data mt-2 hover:text-paper"
              onClick={props.onClearGame}
            >
              Changer
            </button>
          </div>
        </div>
      ) : (
        <SteamSearch disabled={props.busy} onPick={props.onPickGame} />
      )}
      <input
        className="border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-paper"
        placeholder="Titre"
        value={props.title}
        maxLength={80}
        onChange={(event) => props.setTitle(event.target.value)}
      />
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {props.members.map((member) => {
          const on = props.selectedParticipants.includes(member.id);
          return (
            <li key={member.id}>
              <button
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "border border-paper bg-ink-raise px-3 py-2 font-ui text-xs uppercase tracking-[0.1em]"
                    : "border border-rule-strong px-3 py-2 font-ui text-xs uppercase tracking-[0.1em] text-smoke"
                }
                onClick={() => props.toggleParticipant(member.id)}
              >
                {member.displayName}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          disabled={props.busy || !props.game}
          onClick={props.onLaunch}
        >
          Lancer
        </Button>
        <Button variant="ghost" disabled={props.busy} onClick={props.onAbort}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
