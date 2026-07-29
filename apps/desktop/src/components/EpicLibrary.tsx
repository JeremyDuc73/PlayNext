import { useEffect, useState } from "react";
import {
  disconnectEpic,
  exchangeEpicCode,
  fetchEpicStatus,
  fetchMyLibrary,
  startEpicLink,
  syncEpicLibrary,
  type LibraryGame,
} from "../lib/api";
import { runningInDesktopShell } from "../lib/desktop-auth";
import { scanEpicLocal } from "../lib/epic";

type Props = {
  enabled: boolean;
  onBanner: (message: string) => void;
};

export function EpicLibrary({ enabled, onBanner }: Props) {
  const isDesktop = runningInDesktopShell();
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [epicLoginUrl, setEpicLoginUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "installed">("all");

  async function refreshStatus() {
    try {
      const status = await fetchEpicStatus();
      setLinked(status.linked);
    } catch {
      setLinked(false);
    }
  }

  async function refreshGames() {
    const list = await fetchMyLibrary();
    setGames(list.filter((g) => g.launcher === "epic"));
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([refreshStatus(), refreshGames()])
      .catch(() => {
        if (!cancelled) onBanner("Impossible de charger Epic.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  async function onConnect() {
    if (linking) return;
    setLinking(true);
    try {
      const { url } = await startEpicLink();
      setEpicLoginUrl(url);
      onBanner(
        "Clique le lien « Ouvrir la page Epic » (1 onglet), copie authorizationCode, puis colle-le ici.",
      );
    } catch {
      onBanner("Impossible de préparer le login Epic.");
      setEpicLoginUrl(null);
    } finally {
      setLinking(false);
    }
  }

  async function onExchangeCode() {
    const code = authCode.trim();
    if (!code) {
      onBanner("Colle d’abord le authorizationCode Epic.");
      return;
    }
    setLinking(true);
    try {
      await exchangeEpicCode(code);
      setLinked(true);
      setEpicLoginUrl(null);
      setAuthCode("");
      onBanner("Compte Epic lié. Tu peux scanner Epic.");
    } catch (error) {
      onBanner(
        error instanceof Error
          ? error.message
          : "Échange du code Epic échoué.",
      );
    } finally {
      setLinking(false);
    }
  }

  async function onDisconnect() {
    try {
      await disconnectEpic();
      setLinked(false);
      onBanner("Compte Epic déconnecté.");
    } catch {
      onBanner("Déconnexion Epic échouée.");
    }
  }

  async function onScan() {
    if (!linked) {
      onBanner("Connecte d’abord ton compte Epic.");
      return;
    }
    setScanning(true);
    try {
      let installed: Array<{ externalId: string; name?: string }> = [];
      let warn = "";
      if (isDesktop) {
        const local = await scanEpicLocal();
        installed = local.games.map((g) => ({
          externalId: g.externalId,
          name: g.name,
        }));
        if (!local.epicFound) {
          warn = " (launcher Epic non détecté localement)";
        } else if (local.warnings.length > 0) {
          warn = ` (${local.warnings.length} avertissement(s) local)`;
        }
      }

      const sync = await syncEpicLibrary(installed);
      await refreshGames();
      onBanner(
        `Epic OK — ${sync.synced} jeux (${sync.ownedCount} possédés, ${sync.installed} installés)${warn}.`,
      );
    } catch (error) {
      onBanner(
        error instanceof Error
          ? `Scan Epic échoué : ${error.message}`
          : "Scan Epic échoué.",
      );
    } finally {
      setScanning(false);
    }
  }

  const visible = games.filter((game) =>
    filter === "installed" ? game.installed : true,
  );
  const linkingUi = !linked && epicLoginUrl !== null;

  return (
    <section className="library-section" aria-label="Bibliothèque Epic">
      <div className="library-toolbar">
        <div>
          <h2>Bibliothèque Epic</h2>
          <p className="muted">
            Compte Epic → jeux possédés + manifests installés locaux. Chemins
            jamais synchronisés.
          </p>
        </div>
        <div className="actions">
          {linked ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onScan()}
                disabled={scanning}
              >
                {scanning ? "Scan Epic…" : "Scanner Epic"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void onDisconnect()}
              >
                Déconnecter Epic
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onConnect()}
              disabled={linking}
            >
              {linking ? "Préparation…" : "Connecter Epic"}
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

      {linkingUi ? (
        <div style={{ marginBottom: "1rem" }}>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            1) Ouvre{" "}
            <a
              href={epicLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ display: "inline-block" }}
            >
              Ouvrir la page Epic
            </a>{" "}
            — 2) copie <code>authorizationCode</code> — 3) colle et valide.
          </p>
          <div className="actions" style={{ gap: "0.5rem" }}>
            <input
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Coller authorizationCode Epic…"
              aria-label="Code d’autorisation Epic"
              style={{
                flex: 1,
                minWidth: "12rem",
                padding: "0.55rem 0.75rem",
                borderRadius: "0.4rem",
                border: "1px solid var(--border, #444)",
                background: "transparent",
                color: "inherit",
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onExchangeCode()}
              disabled={linking || !authCode.trim()}
            >
              Valider le code
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {linked
            ? "Aucun jeu Epic pour l’instant. Lance un scan."
            : "Connecte Epic, colle le authorizationCode, puis scanne."}
        </p>
      ) : (
        <ul className="game-list">
          {visible.map((game) => (
            <li key={game.id} className="game-row">
              <div>
                <strong>{game.name}</strong>
                <div className="muted">
                  Epic · {game.externalId}
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
