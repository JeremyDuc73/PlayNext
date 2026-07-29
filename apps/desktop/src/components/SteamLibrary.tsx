import { useEffect, useState } from "react";
import {
  fetchMyLibrary,
  syncSteamLibrary,
  type LibraryGame,
} from "../lib/api";
import { scanSteamLocal } from "../lib/steam";
import { runningInDesktopShell } from "../lib/desktop-auth";

type Props = {
  enabled: boolean;
  onBanner: (message: string) => void;
};

export function SteamLibrary({ enabled, onBanner }: Props) {
  const isDesktop = runningInDesktopShell();
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"all" | "installed">("all");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void fetchMyLibrary()
      .then((list) => {
        if (!cancelled) {
          setGames(list.filter((g) => g.launcher === "steam"));
        }
      })
      .catch(() => {
        if (!cancelled) onBanner("Impossible de charger la bibliothèque.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // intentionally only when login state flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  async function onScan() {
    if (!isDesktop) {
      onBanner("Le scan Steam nécessite l’application Windows.");
      return;
    }
    setScanning(true);
    try {
      const result = await scanSteamLocal();
      if (!result.steamFound) {
        onBanner(
          result.warnings[0] ??
            "Steam introuvable sur ce PC. Vérifie qu’il est installé.",
        );
        return;
      }

      const sync = await syncSteamLibrary(result.games, result.steamId);
      const list = await fetchMyLibrary();
      setGames(list.filter((g) => g.launcher === "steam"));

      const warn =
        result.warnings.length > 0
          ? ` (${result.warnings.length} avertissement(s))`
          : "";
      const ownedPart = sync.ownedEnriched
        ? `, ${sync.ownedCount} possédés (API Steam)`
        : sync.hint
          ? ` — ${sync.hint}`
          : "";
      onBanner(
        `Steam OK — ${sync.synced} jeux sync, ${sync.installed} installés${ownedPart}, ${result.libraryCount} biblio(s)${warn}.`,
      );
    } catch (error) {
      onBanner(
        error instanceof Error
          ? `Scan Steam échoué : ${error.message}`
          : "Scan Steam échoué.",
      );
    } finally {
      setScanning(false);
    }
  }

  const visible = games.filter((game) =>
    filter === "installed" ? game.installed : true,
  );

  return (
    <section className="library-section" aria-label="Bibliothèque Steam">
      <div className="library-toolbar">
        <div>
          <h2>Bibliothèque Steam</h2>
          <p className="muted">
            Scan local uniquement — aucun chemin n’est envoyé au serveur.
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onScan()}
            disabled={!isDesktop || scanning}
          >
            {scanning
              ? "Scan en cours…"
              : isDesktop
                ? "Scanner Steam"
                : "Scan Steam (app Windows)"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              setFilter((f) => (f === "installed" ? "all" : "installed"))
            }
          >
            {filter === "installed" ? "Voir tous" : "Installés seulement"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          Aucun jeu pour l’instant. Lance un scan depuis l’app Windows.
        </p>
      ) : (
        <ul className="game-list">
          {visible.map((game) => (
            <li key={game.id} className="game-row">
              <div>
                <strong>{game.name}</strong>
                <div className="muted">
                  Steam · {game.externalId}
                  {game.installed ? " · installé" : " · non installé"}
                </div>
              </div>
              <span
                className="game-badge"
                data-state={game.installed ? "ok" : "idle"}
              >
                {game.installed ? "Installé" : "Possédé"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
