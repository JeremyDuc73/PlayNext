import { pad2 } from "../lib/format";
import { SquareAvatar } from "./SquareAvatar";

type Person = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  ready: boolean;
  veto?: boolean;
};

type Props = {
  people: Person[];
  readyLabel?: string;
  waitingLabel?: string;
};

export function PresenceRow({
  people,
  readyLabel = "Déposé",
  waitingLabel = "Attente",
}: Props) {
  const readyCount = people.filter((p) => p.ready).length;

  return (
    <div className="grid gap-4">
      <div>
        <p className="pn-display text-[42px] text-paper">
          {pad2(readyCount)} / {pad2(people.length)}
        </p>
        <div className="pn-gauge mt-3" aria-hidden>
          {people.map((p) => (
            <i key={p.id} data-done={p.ready ? "" : undefined} />
          ))}
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {people.map((person, i) => (
          <li key={person.id} className="pn-ledger-row" data-ticket>
            <span className="font-data text-[10px] tracking-[0.12em] text-smoke-dim">
              {pad2(i + 1)}
            </span>
            <SquareAvatar
              name={person.displayName}
              avatarUrl={person.avatarUrl}
              tone={person.veto ? "veto" : person.ready ? "active" : "idle"}
            />
            <span className="truncate font-ui text-sm text-paper">
              {person.displayName}
            </span>
            <span
              className={
                person.veto
                  ? "font-data text-[10px] tracking-[0.12em] text-veto uppercase"
                  : "font-data text-[10px] tracking-[0.12em] text-smoke uppercase"
              }
            >
              {person.veto ? (
                "Veto"
              ) : person.ready ? (
                readyLabel
              ) : (
                <>
                  {waitingLabel} <span className="pn-caret ml-1 align-middle" />
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
