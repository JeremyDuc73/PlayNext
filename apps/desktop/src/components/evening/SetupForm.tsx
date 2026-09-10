import type { EveningVibe } from "../../lib/evenings";
import type { GroupMember } from "../../lib/groups";
import type { EveningWhenValue } from "../../lib/paris";
import { pad2 } from "../../lib/format";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { EveningWhenField } from "../../ui/EveningWhen";

export const VIBES: { value: EveningVibe; label: string }[] = [
  { value: "any", label: "Libre" },
  { value: "chill", label: "Détente" },
  { value: "competitive", label: "Compétitif" },
  { value: "campaign", label: "Campagne" },
  { value: "party", label: "Groupe" },
];

export type SetupFormProps = {
  title: string;
  setTitle: (v: string) => void;
  durationMinutes: number | null;
  setDurationMinutes: (v: number | null) => void;
  shortlistSize: number;
  setShortlistSize: (v: number) => void;
  vibe: EveningVibe;
  setVibe: (v: EveningVibe) => void;
  requireInstalled: boolean;
  setRequireInstalled: (v: boolean) => void;
  when: EveningWhenValue;
  setWhen: (v: EveningWhenValue) => void;
  members: GroupMember[];
  selectedParticipants: string[];
  toggleParticipant: (id: string) => void;
  busy: boolean;
  onAbort: () => void;
  onLaunch: () => void;
};

export function SetupForm(props: SetupFormProps) {
  const durationValue = props.durationMinutes ?? 0;
  const durationHours = Math.floor(durationValue / 60);
  const durationRemainder = durationValue % 60;
  const setDuration = (hours: number, minutes: number) => {
    const total = Math.min(600, Math.max(15, hours * 60 + minutes));
    props.setDurationMinutes(total);
  };

  return (
    <div className="grid max-w-3xl gap-5 border border-rule-strong p-6">
      <div>
        <p className="pn-data mb-2">Soirée</p>
        <h3 className="pn-display text-4xl">Préparer la soirée</h3>
        <span className="pn-accent mt-3" />
      </div>
      <EveningWhenField value={props.when} onChange={props.setWhen} />
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[200px] flex-1 border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-paper"
          placeholder="Titre"
          value={props.title}
          maxLength={80}
          onChange={(e) => props.setTitle(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2 border border-rule-strong bg-ink-deep px-3 py-2.5 font-data text-xs tracking-[0.1em] uppercase">
          <span>Durée</span>
          <input
            className="w-10 border border-rule-strong bg-ink px-2 py-1 text-right font-data text-xs outline-none focus:border-veto"
            type="number"
            min={0}
            max={10}
            value={props.durationMinutes === null ? "" : durationHours}
            disabled={props.durationMinutes === null}
            aria-label="Heures"
            onChange={(e) =>
              setDuration(Number(e.target.value) || 0, durationRemainder)
            }
          />
          <span>h</span>
          <select
            className="border border-rule-strong bg-ink px-2 py-1 font-data text-xs outline-none focus:border-veto"
            value={props.durationMinutes === null ? 0 : durationRemainder}
            disabled={props.durationMinutes === null}
            aria-label="Minutes"
            onChange={(e) =>
              setDuration(durationHours, Number(e.target.value))
            }
          >
            {Array.from({ length: 12 }, (_, index) => index * 5).map(
              (minutes) => (
                <option key={minutes} value={minutes}>
                  {String(minutes).padStart(2, "0")}
                </option>
              ),
            )}
          </select>
          <span>min</span>
        </div>
        <Checkbox
          checked={props.durationMinutes === null}
          label="Sans limite"
          onChange={(checked) =>
            props.setDurationMinutes(checked ? null : 90)
          }
        />
        <select
          className="border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase"
          value={props.shortlistSize}
          onChange={(e) => props.setShortlistSize(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {pad2(n)} jeux
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap border border-rule-strong">
        {VIBES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              props.vibe === option.value
                ? "bg-paper px-3 py-2.5 font-ui text-xs font-bold uppercase tracking-[0.12em] text-ink-deep"
                : "border-r border-rule-strong px-3 py-2.5 font-ui text-xs font-bold uppercase tracking-[0.12em] text-smoke last:border-r-0"
            }
            onClick={() => props.setVibe(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox
          checked={props.requireInstalled}
          label="Installé"
          onChange={props.setRequireInstalled}
        />
      </div>
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
        <Button variant="primary" disabled={props.busy} onClick={props.onLaunch}>
          Lancer le lobby
        </Button>
        <Button variant="ghost" disabled={props.busy} onClick={props.onAbort}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
