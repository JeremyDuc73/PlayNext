import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  const isDesktop = runningInDesktopShell();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === "ok") {
      setAuthBanner("Connexion Discord réussie.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (auth === "error") {
      const reason = params.get("reason") ?? "unknown";
      setAuthBanner(`Connexion Discord échouée (${reason}).`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applyDeepLink(url: string) {
      const parsed = parseAuthDeepLink(url);
      if (!parsed) return;

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

      <main className="hero">
        {authBanner ? <p className="auth-banner">{authBanner}</p> : null}

        {user ? (
          <>
            <h1>Salut, {user.displayName}</h1>
            <p>
              Compte Discord lié
              {isDesktop ? " dans l’app Windows" : ""}. Prochaine étape : build
              installable, puis scan Steam sur ton PC.
            </p>
            <div className="user-card">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="user-avatar"
                />
              ) : (
                <div className="user-avatar fallback" aria-hidden="true" />
              )}
              <div>
                <strong>{user.displayName}</strong>
                <div className="muted">@{user.username}</div>
              </div>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-secondary" disabled>
                Scan Steam — après build Windows
              </button>
              <button type="button" className="btn btn-ghost" onClick={logout}>
                Se déconnecter
              </button>
            </div>
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

      <section className="panel-row" aria-label="Prochaines étapes">
        <article className="panel">
          <h2>Où on en est</h2>
          <ul>
            <li>Discord web validé</li>
            <li>Handoff desktop `playnext://`</li>
            <li>Build Windows ensuite</li>
            <li>Puis scan Steam réel</li>
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
