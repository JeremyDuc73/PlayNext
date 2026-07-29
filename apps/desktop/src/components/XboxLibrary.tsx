import { useEffect, useState } from "react";
import {
  disconnectMicrosoft,
  fetchMicrosoftStatus,
  fetchMyLibrary,
  startMicrosoftLink,
  syncXboxLibrary,
  type LibraryGame,
} from "../lib/api";
import {
  openExternalUrl,
  runningInDesktopShell,
} from "../lib/desktop-auth";
import { scanXboxLocal } from "../lib/xbox";

type Props = {
  enabled: boolean;
  microsoftLinkedSignal?: number;
  onBanner: (message: string) => void;
};

export function XboxLibrary({
  enabled,
  microsoftLinkedSignal = 0,
  onBanner,
}: Props) {
  const isDesktop = runningInDesktopShell();
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [linked, setLinked] = useState(false);
  const [filter, setFilter] = useState<"all" | "installed">("all");

  async function refreshStatus() {
    try {
      const status = await fetchMicrosoftStatus();
      setConfigured(status.configured);
      setLinked(status.linked);
    } catch {
      setConfigured(false);
      setLinked(false);
    }
  }

  async function refreshGames() {
    const list = await fetchMyLibrary();
    setGames(list.filter((g) => g.launcher === "xbox"));
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLinking(false);
    setLoading(true);
    void Promise.all([refreshStatus(), refreshGames()])
      .catch(() => {
        if (!cancelled) onBanner("Impossible de charger Xbox.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, microsoftLinkedSignal]);

  // Desktop deep-link can miss the callback — poll until linked or timeout.
  useEffect(() => {
    if (!linking) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      void fetchMicrosoftStatus()
        .then((status) => {
          if (status.linked) {
            setLinked(true);
            setLinking(false);
            onBanner("Compte Microsoft / Xbox lié. Tu peux scanner Xbox.");
          } else if (Date.now() - started > 120_000) {
            setLinking(false);
            onBanner(
              "Toujours pas lié. Si tu as validé Microsoft, le secret .env est probablement faux (Value, pas Secret ID).",
            );
          }
        })
        .catch(() => {
          /* ignore transient */
        });
    }, 2000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking]);

  async function onConnect() {
    setLinking(true);
    try {
      const url = await startMicrosoftLink(isDesktop ? "desktop" : "web");
      onBanner(
        isDesktop
          ? "Navigateur ouvert — connecte ton compte Microsoft, l’app récupérera le lien."
          : "Redirection Microsoft…",
      );
      await openExternalUrl(url);
    } catch {
      onBanner(
        "Impossible de démarrer le login Microsoft. Vérifie MICROSOFT_CLIENT_ID (docs/XBOX.md).",
      );
      setLinking(false);
    }
  }

  async function onDisconnect() {
    try {
      await disconnectMicrosoft();
      setLinked(false);
      onBanner("Compte Microsoft déconnecté.");
    } catch {
      onBanner("Déconnexion Microsoft échouée.");
    }
  }

  async function onScan() {
    if (!linked) {
      onBanner("Connecte d’abord ton compte Microsoft / Xbox.");
      return;
    }
    setScanning(true);
    try {
      let installed: Array<{ externalId: string; name?: string }> = [];
      let warn = "";
      if (isDesktop) {
        const local = await scanXboxLocal();
        installed = local.games.map((g) => ({
          externalId: g.externalId,
          name: g.name,
        }));
        if (local.warnings.length > 0) {
          warn = ` (${local.warnings.length} avertissement(s) local)`;
        }
      }

      const sync = await syncXboxLibrary(installed);
      await refreshGames();
      onBanner(
        `Xbox OK — ${sync.synced} jeux (${sync.historyCount} historique, ${sync.installed} installés, ${sync.installedOnlyCount} installés hors historique)${warn}.`,
      );
    } catch (error) {
      onBanner(
        error instanceof Error
          ? `Scan Xbox échoué : ${error.message}`
          : "Scan Xbox échoué.",
      );
    } finally {
      setScanning(false);
    }
  }

  const visible = games.filter((game) =>
    filter === "installed" ? game.installed : true,
  );

  return (
    <section className="library-section" aria-label="Bibliothèque Xbox">
      <div className="library-toolbar">
        <div>
          <h2>Bibliothèque Xbox</h2>
          <p className="muted">
            Compte Microsoft → historique PC Xbox Live + packages installés
            locaux. Chemins jamais synchronisés.
          </p>
        </div>
        <div className="actions">
          {!configured ? (
            <span className="muted">Configure MICROSOFT_CLIENT_ID</span>
          ) : linked ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onScan()}
                disabled={scanning}
              >
                {scanning ? "Scan Xbox…" : "Scanner Xbox"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onDisconnect()}
              >
                Déconnecter MS
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onConnect()}
              disabled={linking}
            >
              {linking ? "En attente Microsoft…" : "Connecter Microsoft"}
            </button>
          )}
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
          {linked
            ? "Aucun jeu Xbox pour l’instant. Lance un scan."
            : "Connecte Microsoft pour importer ta biblio Xbox / Game Pass (jeux déjà lancés)."}
        </p>
      ) : (
        <ul className="game-list">
          {visible.map((game) => (
            <li key={game.id} className="game-row">
              <div>
                <strong>{game.name}</strong>
                <div className="muted">
                  Xbox · {game.externalId}
                  {game.installed ? " · installé" : " · non installé"}
                </div>
              </div>
              <span
                className="game-badge"
                data-state={game.installed ? "ok" : "idle"}
              >
                {game.installed ? "Installé" : "Possédé / joué"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
