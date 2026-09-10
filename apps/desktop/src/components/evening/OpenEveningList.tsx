import { eveningDisplayTitle, type EveningSummary } from "../../lib/evenings";
import { formatParisWhen } from "../../lib/paris";
import { Button } from "../../ui/Button";

export type OpenEveningListProps = {
  evenings: EveningSummary[];
  onOpen: (id: string) => void;
  canOrganize?: boolean;
  onCancel?: (id: string) => void;
};

export function OpenEveningList(props: OpenEveningListProps) {
  return (
    <section className="border border-rule-strong p-6">
      <div className="mb-3 border-b border-rule pb-3">
        <p className="pn-data text-paper">Soirées en cours & à venir</p>
      </div>
      <ul className="m-0 list-none p-0">
        {props.evenings.map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule py-3 last:border-b-0"
          >
            <span className="truncate font-ui text-xs font-bold uppercase tracking-[0.1em] text-paper">
              {eveningDisplayTitle(item.title, item.createdAt, item.scheduledAt)}
            </span>
            <span className="pn-data truncate">
              {formatParisWhen(item.scheduledAt ?? item.createdAt)}
              {" · "}
              {item.status === "closed"
                ? "Confirmée"
                : item.status === "revealed"
                  ? "Résultat"
                  : item.status === "voting"
                    ? "Vote"
                    : item.kind === "direct"
                      ? "Direct"
                      : "Lobby"}
            </span>
            <div className="flex items-center gap-3">
              <Button variant="second" onClick={() => props.onOpen(item.id)}>
                Ouvrir
              </Button>
              {props.canOrganize && props.onCancel ? (
                <button
                  type="button"
                  className="pn-data text-smoke hover:text-veto"
                  onClick={() => props.onCancel!(item.id)}
                >
                  Annuler
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
