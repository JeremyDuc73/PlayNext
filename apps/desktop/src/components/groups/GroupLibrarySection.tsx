import { useState, useMemo } from "react";
import type {
  GroupLibraryGame,
  HiddenGroupGame,
} from "../../lib/groups";
import { pad2 } from "../../lib/format";
import { EmptyHint } from "../../ui/EmptyHint";
import { GamePoster } from "../../ui/GamePoster";
import { PosterGrid } from "../../ui/PosterGrid";

export type LibraryFilter = "all" | "shared" | "installed";

export type GroupLibrarySectionProps = {
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  onRefreshLibrary: () => void;
  visibleLibrary: GroupLibraryGame[];
  currentUserId: string;
  onHide: (game: GroupLibraryGame) => void;
  hidden: HiddenGroupGame[];
  onUnhide: (launcher: string, externalId: string) => void;
  busy: boolean;
};

export function GroupLibrarySection({
  filter,
  onFilterChange,
  onRefreshLibrary,
  visibleLibrary,
  currentUserId,
  onHide,
  hidden,
  onUnhide,
  busy,
}: GroupLibrarySectionProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return visibleLibrary;
    const q = query.trim().toLowerCase();
    return visibleLibrary.filter((g) => g.name.toLowerCase().includes(q));
  }, [visibleLibrary, query]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule-strong pb-4">
        <div className="flex flex-wrap items-center gap-3">
          {(
            [
              ["shared", "En commun"],
              ["all", "Tous"],
              ["installed", "Installés"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={
                filter === key
                  ? "border border-paper bg-paper px-3 py-1.5 font-ui text-xs font-bold uppercase tracking-[0.14em] text-ink-deep"
                  : "border border-rule px-3 py-1.5 font-ui text-xs uppercase tracking-[0.14em] text-smoke hover:border-paper hover:text-paper"
              }
              onClick={() => onFilterChange(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 max-w-sm items-center gap-2">
          <input
            className="w-full border border-rule-strong bg-ink-deep px-3 py-1.5 font-data text-xs tracking-[0.08em] uppercase outline-none focus:border-paper"
            placeholder="Filtrer par nom…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="pn-data border border-rule px-3 py-1.5 hover:border-paper hover:text-paper"
            disabled={busy}
            onClick={onRefreshLibrary}
          >
            Sync
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyHint
          title={query ? "Aucun résultat" : "Rien ici"}
          body={query ? `Aucun jeu ne correspond à « ${query} ».` : "Synchronisez vos bibliothèques dans l’onglet Bibliothèque pour voir vos jeux en commun !"}
        />
      ) : (
        <PosterGrid
          label="Bibliothèque du groupe"
          density="compact"
          animateKey={`${filter}:${filtered.length}:${query}`}
        >
          {filtered.map((game, index) => {
            const mine = game.owners.find(
              (o) => o.userId === currentUserId,
            );
            return (
              <div key={game.key} role="listitem">
                <GamePoster
                  name={game.name}
                  launcher={game.launcher}
                  externalId={game.externalId}
                  coverUrl={game.coverUrl}
                  priority={index < 24}
                  subtitle={`${pad2(game.ownedCount)}/${pad2(game.memberCount)} · ${game.launcher}`}
                  footer={
                    mine ? (
                      <button
                        type="button"
                        className="pn-data mt-1 hover:text-paper"
                        disabled={busy}
                        onClick={() => onHide(game)}
                      >
                        Masquer
                      </button>
                    ) : null
                  }
                />
              </div>
            );
          })}
        </PosterGrid>
      )}

      {hidden.length > 0 ? (
        <div className="border-t border-rule-strong pt-6">
          <p className="pn-data mb-3">
            Masqués · {pad2(hidden.length)}
          </p>
          <PosterGrid
            label="Jeux masqués"
            density="compact"
            animateKey={`hidden:${hidden.length}`}
          >
            {hidden.map((game) => (
              <div
                key={`${game.launcher}:${game.externalId}`}
                role="listitem"
              >
                <GamePoster
                  name={game.name}
                  launcher={game.launcher}
                  externalId={game.externalId}
                  footer={
                    <button
                      type="button"
                      className="pn-data mt-1 hover:text-paper"
                      disabled={busy}
                      onClick={() =>
                        void onUnhide(game.launcher, game.externalId)
                      }
                    >
                      Réafficher
                    </button>
                  }
                />
              </div>
            ))}
          </PosterGrid>
        </div>
      ) : null}
    </div>
  );
}
