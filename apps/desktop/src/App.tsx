import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SteamLibrary } from "./components/SteamLibrary";
import { XboxLibrary } from "./components/XboxLibrary";
import {
  exchangeHandoff,
  fetchMe,
  getApiUrl,
  logoutRequest,
  type User,
} from "./lib/api";
import {
  parseAuthDeepLink,
  runningInDesktopShell,
  startDiscordLogin,
} from "./lib/desktop-auth";

type AppInfo = {
  name: string;
  version: string;
  platform: string;
};

function microsoftErrorMessage(reason: string): string {
  if (reason === "enable_public_client") {
    return "Lien Microsoft échoué : Entra traite encore l’app comme Web (secret requis). Ajoute la plateforme « Mobile and desktop applications » avec la même redirect, retire Web si besoin, public client = Yes. Voir docs/XBOX.md.";
  }
  if (reason === "code_expired") {
    return "Lien Microsoft échoué : code déjà utilisé. Reclique « Connecter Microsoft » et valide tout de suite (un seul essai).";
  }
  if (reason === "xbox_link_failed") {
    return "Lien Microsoft échoué. Vérifie CLIENT_ID + redirect + public client (docs/XBOX.md), puis réessaie.";
  }
  return `Lien Microsoft échoué (${reason}).`;
}

type HealthResponse = {
  ok: boolean;
  service: string;
  database: "up" | "down";
};

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [apiHealth, setApiHealth] = useState<HealthResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBanner, setAuthBanner] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const [microsoftLinkedSignal, setMicrosoftLinkedSignal] = useState(0);
  const isDesktop = runningInDesktopShell();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    const xbox = params.get("xbox");
    if (auth === "ok") {
      setAuthBanner("Connexion Discord réussie.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (auth === "error") {
      const reason = params.get("reason") ?? "unknown";
      setAuthBanner(`Connexion Discord échouée (${reason}).`);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (xbox === "ok") {
      setAuthBanner("Compte Microsoft / Xbox lié.");
      setMicrosoftLinkedSignal((n) => n + 1);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (xbox === "error") {
      const reason = params.get("reason") ?? "unknown";
      setAuthBanner(microsoftErrorMessage(reason));
      setMicrosoftLinkedSignal((n) => n + 1);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applyDeepLink(url: string) {
      const parsed = parseAuthDeepLink(url);
      if (!parsed) return;

      if (parsed.kind === "microsoft") {
        if (!cancelled) {
          if (parsed.error) {
            setAuthBanner(microsoftErrorMessage(parsed.error));
            setMicrosoftLinkedSignal((n) => n + 1);
          } else if (parsed.ok) {
            setAuthBanner("Compte Microsoft / Xbox lié. Tu peux scanner Xbox.");
            setMicrosoftLinkedSignal((n) => n + 1);
          }
        }
        return;
      }

      if (parsed.error) {
        if (!cancelled) {
          setAuthBanner(`Connexion Discord échouée (${parsed.error}).`);
          setLoginPending(false);
        }
        return;
      }

      if (parsed.handoff) {
        try {
          const nextUser = await exchangeHandoff(parsed.handoff);
          if (!cancelled) {
            setUser(nextUser);
            setAuthBanner("Connexion Discord réussie.");
            setLoginPending(false);
          }
        } catch {
          if (!cancelled) {
            setAuthBanner("Échange de session desktop échoué. Réessaie.");
            setLoginPending(false);
          }
        }
      }
    }

    async function listenDeepLinks() {
      if (!isDesktop) return;
      try {
        const { getCurrent, onOpenUrl } = await import(
          "@tauri-apps/plugin-deep-link"
        );
        const current = await getCurrent();
        if (current?.length) {
          for (const url of current) {
            await applyDeepLink(url);
          }
        }
        await onOpenUrl(async (urls) => {
          for (const url of urls) {
            await applyDeepLink(url);
          }
        });
      } catch {
        // Plugin unavailable in web preview — ignore.
      }
    }

    async function loadNative() {
      try {
        const info = await invoke<AppInfo>("get_app_info");
        if (!cancelled) setAppInfo(info);
      } catch {
        if (!cancelled) {
          setAppInfo({
            name: "PlayNext",
            version: "0.1.0",
            platform: "web-preview",
          });
        }
      }
    }

    async function loadHealth() {
      try {
        const response = await fetch(`${getApiUrl()}/health`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as HealthResponse;
        if (!cancelled) {
          setApiHealth(data);
          setApiError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setApiHealth(null);
          setApiError(error instanceof Error ? error.message : "unreachable");
        }
      }
    }

    async function loadMe() {
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    void loadNative();
    void loadHealth();
    void loadMe();
    void listenDeepLinks();

    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  async function onLoginClick() {
    setLoginPending(isDesktop);
    setAuthBanner(
      isDesktop
        ? "Navigateur ouvert — valide Discord, l’app récupérera la session."
        : null,
    );
    await startDiscordLogin();
  }

  async function logout() {
    await logoutRequest();
    setUser(null);
    setAuthBanner("Déconnecté.");
    setLoginPending(false);
  }

  const apiState = apiError ? "down" : apiHealth?.ok ? "ok" : "down";
  const apiLabel = apiError
    ? `API hors ligne (${apiError})`
    : apiHealth?.ok
      ? `API ok · DB ${apiHealth.database}`
      : "API en attente…";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div className="brand-copy">
            <div className="brand-name">PlayNext</div>
            <div className="brand-tag">Ce soir, on décide vite.</div>
          </div>
        </div>
        <div className="status-pill" data-state={apiState} title={getApiUrl()}>
          <span className="status-dot" />
          {apiLabel}
        </div>
      </header>

      <main className={user ? "main-logged" : "hero"}>
        {authBanner ? <p className="auth-banner">{authBanner}</p> : null}

        {user ? (
          <>
            <div className="logged-header">
              <div>
                <h1>Salut, {user.displayName}</h1>
                <p>
                  Scanne Steam et Xbox, puis on pourra croiser avec tes amis.
                </p>
              </div>
              <div className="user-card compact">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="user-avatar"
                  />
                ) : (
                  <div className="user-avatar fallback" aria-hidden="true" />
                )}
                <div>
                  <strong>{user.displayName}</strong>
                  <div className="muted">@{user.username}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={logout}
                >
                  Quitter
                </button>
              </div>
            </div>

            <SteamLibrary
              enabled={Boolean(user)}
              onBanner={(message) => setAuthBanner(message)}
            />
            <XboxLibrary
              enabled={Boolean(user)}
              microsoftLinkedSignal={microsoftLinkedSignal}
              onBanner={(message) => setAuthBanner(message)}
            />
          </>
        ) : (
          <>
            <h1>À quoi on joue&nbsp;?</h1>
            <p>
              Détection locale, bibliothèques croisées, votes masqués et un veto
              chacun. Discord pour se retrouver — PlayNext pour trancher.
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void onLoginClick()}
                disabled={authLoading || loginPending}
              >
                {authLoading
                  ? "Vérification…"
                  : loginPending
                    ? "En attente de Discord…"
                    : "Continuer avec Discord"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Relancer le statut
              </button>
            </div>
          </>
        )}
      </main>

      {!user ? (
        <section className="panel-row" aria-label="Prochaines étapes">
          <article className="panel">
            <h2>Où on en est</h2>
            <ul>
              <li>Discord desktop OK</li>
              <li>Scan Steam en cours d’intégration</li>
              <li>Ensuite : groupes</li>
            </ul>
          </article>
          <article className="panel">
            <h2>Mode</h2>
            <p>{isDesktop ? "Shell Tauri (desktop)" : "Aperçu navigateur"}</p>
          </article>
          <article className="panel">
            <h2>Runtime</h2>
            <p>
              {appInfo
                ? `${appInfo.name} ${appInfo.version} · ${appInfo.platform}`
                : "Chargement natif…"}
            </p>
          </article>
        </section>
      ) : null}

      <footer className="footer">
        <span>
          Direction visuelle : encre, laiton, patine — pas le violet gaming par
          défaut.
        </span>
        <span>Voir BACKLOG.md</span>
      </footer>
    </div>
  );
}
