import {
  eveningDisplayTitle,
  type EveningSummary,
} from "../../lib/evenings";
import { pad2 } from "../../lib/format";
import { isEveningPast } from "../../lib/paris";

export type EveningHistoryProps = {
  history: EveningSummary[];
  isOwner: boolean;
  busy: boolean;
  onDelete: (id: string) => void;
  onClearAll: () => void;
};

export function EveningHistory({
  history,
  isOwner,
  busy,
  onDelete,
  onClearAll,
}: EveningHistoryProps) {
  const entries = history.filter(
    (item) =>
      item.status === "cancelled" ||
      (item.status === "closed" && isEveningPast(item.scheduledAt, item.createdAt)),
  );
  if (entries.length === 0) return null;

  const statusLabel = (item: EveningSummary): string => {
    switch (item.status) {
      case "closed":
        return isEveningPast(item.scheduledAt, item.createdAt)
          ? "Terminée"
          : "Confirmée";
      case "cancelled":
        return "Annulée";
      case "revealed":
        return "Résultat";
      case "voting":
        return "Vote en cours";
      case "lobby":
        return "Lobby";
      case "selection":
        return "Sélection";
    }
  };

  return (
    <section className="border border-rule-strong p-6">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-3">
        <p className="pn-data text-paper">Historique des soirées</p>
        <div className="flex items-baseline gap-4">
          <p className="pn-data">{pad2(entries.length)} entrées</p>
          {isOwner ? (
            <button
              type="button"
              className="pn-data text-veto hover:text-paper"
              disabled={busy}
              onClick={onClearAll}
            >
              Tout effacer
            </button>
          ) : null}
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {entries.map((item) => (
          <li
            key={item.id}
            className={
              isOwner
                ? "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-4 border-b border-rule py-3 last:border-b-0"
                : "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-rule py-3 last:border-b-0"
            }
          >
            <span className="truncate font-ui text-xs font-bold uppercase tracking-[0.1em] text-paper">
              {eveningDisplayTitle(
                item.title,
                item.createdAt,
                item.scheduledAt,
              )}
            </span>
            <span className="truncate text-sm text-paper-2">
              {item.winnerName?.trim() || "—"}
            </span>
            <span className="pn-data">{statusLabel(item)}</span>
            <time className="pn-data" dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleDateString("fr-FR")}
            </time>
            {isOwner ? (
              <button
                type="button"
                className="pn-data text-veto hover:text-paper"
                disabled={busy}
                onClick={() => onDelete(item.id)}
              >
                Effacer
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
