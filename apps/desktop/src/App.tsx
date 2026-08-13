import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import clsx from "clsx";
import { GroupsPanel } from "./components/GroupsPanel";
import { LibraryHub } from "./components/LibraryHub";
import { ProfilePanel } from "./components/ProfilePanel";
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
import { fetchOpenEvenings } from "./lib/evenings";
import { gsap, prefersReducedMotion, useGSAP, viewSwap } from "./lib/motion";
import { Banner } from "./ui/Banner";
import { BrandMark } from "./ui/BrandMark";
import { Button } from "./ui/Button";
import { DiscordIcon } from "./ui/DiscordIcon";
import { SquareAvatar } from "./ui/SquareAvatar";

type AppInfo = {
  name: string;
  version: string;
  platform: string;
};

function microsoftErrorMessage(reason: string): string {
  if (reason === "enable_public_client") {
    return "Lien Microsoft échoué : plateforme Mobile/desktop + public client (docs/XBOX.md).";
  }
  if (reason === "code_expired") {
    return "Lien Microsoft échoué : code déjà utilisé. Réessaie une seule fois.";
  }
  if (reason === "xbox_link_failed") {
    return "Lien Microsoft échoué. Vérifie docs/XBOX.md.";
  }
  return `Lien Microsoft échoué (${reason}).`;
}

function notificationMessage(message: string): string {
  const clean = message.trim();
  if (
    /duplicate key|failed to fetch|unauthenticated|epic_token_|microsoft_disconnect_|_failed_|_error_|_timeout|_cancelled|invalid_state|^HTTP \d/i.test(
      clean,
    )
  ) {
    return "Action impossible. Réessaie.";
  }
  return clean;
}

type HealthResponse = {
  ok: boolean;
  service: string;
  database: "up" | "down";
};

type NavId = "evening" | "group" | "library" | "profile";

const TABS: { id: NavId; label: string }[] = [
  { id: "evening", label: "Soirée" },
  { id: "group", label: "Groupe" },
  { id: "library", label: "Bibliothèque" },
];

const RAIL_COPY: Record<NavId, string> = {
  evening: "Choisir un jeu",
  group: "Groupe",
  library: "Bibliothèque partagée",
  profile: "Profil",
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
  const [epicLinkedSignal, setEpicLinkedSignal] = useState(0);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(
    null,
  );
  const [nav, setNav] = useState<NavId>("evening");
  const [openEveningGroupId, setOpenEveningGroupId] = useState<string | null>(
    null,
  );
  const seenOpenEveningId = useRef<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const isDesktop = runningInDesktopShell();
  const shellRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const notify = (message: string) =>
    setAuthBanner(notificationMessage(message));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    const xbox = params.get("xbox");
    const invite = params.get("invite");
    if (auth === "ok") {
      setAuthBanner("Connexion Discord réussie.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (auth === "error") {
      const reason = params.get("reason") ?? "unknown";
      notify(`Connexion Discord échouée (${reason}).`);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (xbox === "ok") {
      setAuthBanner("Compte Microsoft / Xbox lié.");
      setMicrosoftLinkedSignal((n) => n + 1);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (xbox === "error") {
      const reason = params.get("reason") ?? "unknown";
      notify(microsoftErrorMessage(reason));
      setMicrosoftLinkedSignal((n) => n + 1);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (invite) {
      setPendingInviteCode(invite);
      setAuthBanner("Invitation détectée — connexion requise.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applyDeepLink(url: string) {
      const parsed = parseAuthDeepLink(url);
      if (!parsed) return;

      if (parsed.kind === "invite") {
        if (!cancelled) {
          setPendingInviteCode(parsed.code);
          setAuthBanner("Invitation reçue.");
        }
        return;
      }

      if (parsed.kind === "microsoft") {
        if (!cancelled) {
          if (parsed.error) {
            notify(microsoftErrorMessage(parsed.error));
            setMicrosoftLinkedSignal((n) => n + 1);
          } else if (parsed.ok) {
            setAuthBanner("Compte Microsoft / Xbox lié.");
            setMicrosoftLinkedSignal((n) => n + 1);
          }
        }
        return;
      }

      if (parsed.kind !== "discord") return;

      if (parsed.error) {
        if (!cancelled) {
          notify(`Connexion Discord échouée (${parsed.error}).`);
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
        } catch (error) {
          if (!cancelled) {
            notify(
              error instanceof Error
                ? `Échange de session desktop échoué (${error.message}).`
                : "Échange de session desktop échoué.",
            );
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
          for (const url of current) await applyDeepLink(url);
        }
        await onOpenUrl(async (urls) => {
          for (const url of urls) await applyDeepLink(url);
        });
      } catch {
        /* web preview */
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
            version: "0.3.0",
            platform: "web-preview",
          });
        }
      }
    }

    async function loadHealth() {
      try {
        const response = await fetch(`${getApiUrl()}/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void check({ timeout: 10000 })
        .then((update) => {
          if (!cancelled && update) setAvailableUpdate(update);
        })
        .catch(() => {
          // Une mise à jour indisponible ne doit pas bloquer l’application.
        });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!user) {
      seenOpenEveningId.current = null;
      setOpenEveningGroupId(null);
      return;
    }
    let cancelled = false;

    async function checkOpenEvening() {
      try {
        const open = (await fetchOpenEvenings())[0];
        if (cancelled) return;
        if (!open) {
          seenOpenEveningId.current = null;
          setOpenEveningGroupId(null);
          return;
        }
        setOpenEveningGroupId(open.groupId);
        if (seenOpenEveningId.current === open.id) return;
        seenOpenEveningId.current = open.id;
        setNav((current) => {
          if (current === "evening") return current;
          if (open.status === "lobby") notify("Lobby ouvert.");
          else if (open.status === "selection") notify("Sélection en cours.");
          else if (open.status === "voting") notify("Vote en cours.");
          return "evening";
        });
      } catch {
        // Le polling ne doit pas spammer l’écran.
      }
    }

    void checkOpenEvening();
    const timer = window.setInterval(() => {
      void checkOpenEvening();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useGSAP(
    () => {
      viewSwap(viewRef.current);
    },
    { dependencies: [nav, Boolean(user)], scope: shellRef },
  );

  async function onLoginClick() {
    setLoginPending(true);
    setAuthBanner(isDesktop ? "Fenêtre Discord ouverte." : null);
    try {
      const payload = await startDiscordLogin();
      if (!payload || payload.kind !== "discord") return;
      if (payload.error) {
        notify(`Connexion Discord échouée (${payload.error}).`);
        return;
      }
      if (!payload.handoff) {
        setAuthBanner("Retour Discord introuvable.");
        return;
      }
      const nextUser = await exchangeHandoff(payload.handoff);
      setUser(nextUser);
      setAuthBanner("Connexion Discord réussie.");
    } catch (error) {
      notify(
        error instanceof Error
          ? `Connexion Discord échouée (${error.message}).`
          : "Connexion Discord échouée.",
      );
    } finally {
      if (isDesktop) setLoginPending(false);
    }
  }

  async function logout() {
    await logoutRequest();
    setUser(null);
    setAuthBanner("Déconnecté.");
    setLoginPending(false);
  }

  async function installUpdate() {
    if (!availableUpdate || updateBusy) return;
    setUpdateBusy(true);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch {
      setUpdateBusy(false);
      notify("Mise à jour impossible. Réessaie plus tard.");
    }
  }

  const apiOk = Boolean(apiHealth?.ok) && !apiError;

  return (
    <div ref={shellRef} className="flex min-h-screen bg-ink-deep text-paper">
      <aside className="sticky top-0 flex h-screen w-rail shrink-0 flex-col items-center border-r border-rule-strong bg-ink-deep py-5">
        <BrandMark size={28} />
        <p
          className="mt-auto pn-data mb-4 uppercase"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
        >
          {user ? RAIL_COPY[nav] : "Choisir ensemble"}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-stretch border-b border-rule-strong bg-ink-deep">
          <div className="flex items-center gap-3 px-5">
            <div>
              <span className="font-display text-lg uppercase tracking-[-0.03em]">
                PlayNext
              </span>
              <span className="pn-accent mt-1" />
            </div>
          </div>

          {user ? (
            <nav className="flex items-stretch" aria-label="Principal">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={clsx(
                    "cursor-pointer px-5 font-ui text-xs font-bold uppercase tracking-[0.16em] transition-colors duration-90",
                    nav === tab.id
                      ? "bg-paper text-ink-deep"
                      : "bg-transparent text-paper hover:bg-ink-raise",
                  )}
                  onClick={() => setNav(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-4 px-5">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="pn-data">
                {apiOk ? "À jour" : "Hors sync"}
              </span>
              {apiOk ? (
                <span className="pn-sync w-16" aria-hidden>
                  <i />
                </span>
              ) : null}
            </div>
            {user ? (
              <>
                <SquareAvatar
                  name={user.displayName}
                  avatarUrl={user.avatarUrl}
                />
                <button
                  type="button"
                  className={
                    nav === "profile"
                      ? "pn-data text-paper"
                      : "pn-data hover:text-paper"
                  }
                  onClick={() => setNav("profile")}
                >
                  Profil
                </button>
                <button
                  type="button"
                  className="pn-data hover:text-paper"
                  onClick={() => void logout()}
                >
                  Quitter
                </button>
              </>
            ) : (
              <span className="pn-data">{authLoading ? "…" : "Invité"}</span>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto bg-ink">
          <div className="p-5 md:p-7">
            {availableUpdate && !updateDismissed ? (
              <UpdateNotice
                update={availableUpdate}
                busy={updateBusy}
                onInstall={() => void installUpdate()}
                onDismiss={() => setUpdateDismissed(true)}
              />
            ) : null}
            {authBanner ? (
              <div className="mb-5">
                <Banner onDismiss={() => setAuthBanner(null)}>
                  {authBanner}
                </Banner>
              </div>
            ) : null}

            {user ? (
              <div ref={viewRef}>
                {nav === "library" ? (
                  <LibraryHub
                    enabled
                    microsoftLinkedSignal={microsoftLinkedSignal}
                    epicLinkedSignal={epicLinkedSignal}
                    onBanner={notify}
                  />
                ) : nav === "profile" ? (
                  <ProfilePanel
                    user={user}
                    isDesktop={isDesktop}
                    microsoftLinkedSignal={microsoftLinkedSignal}
                    epicLinkedSignal={epicLinkedSignal}
                    onConnectionChanged={(provider) => {
                      if (provider === "microsoft") {
                        setMicrosoftLinkedSignal((n) => n + 1);
                      } else {
                        setEpicLinkedSignal((n) => n + 1);
                      }
                    }}
                    onBanner={notify}
                  />
                ) : (
                  <GroupsPanel
                    enabled
                    focus={nav === "evening" ? "evening" : "group"}
                    currentUserId={user.id}
                    focusGroupId={openEveningGroupId}
                    pendingInviteCode={pendingInviteCode}
                    onPendingInviteConsumed={() => setPendingInviteCode(null)}
                    onBanner={notify}
                  />
                )}
              </div>
            ) : (
              <GuestBoot
                authLoading={authLoading}
                loginPending={loginPending}
                onLogin={() => void onLoginClick()}
              />
            )}
          </div>
        </main>

        <footer className="flex justify-between border-t border-rule px-5 py-3">
          <span className="pn-data">
            {appInfo ? `v${appInfo.version}` : "—"}
            {isDesktop ? "" : " · Web"}
          </span>
          <span className="pn-data">Choisir ensemble.</span>
        </footer>
      </div>
    </div>
  );
}

function GuestBoot({
  authLoading,
  loginPending,
  onLogin,
}: {
  authLoading: boolean;
  loginPending: boolean;
  onLogin: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return;
      gsap.from(ref.current.children, {
        y: 16,
        opacity: 0,
        stagger: 0.07,
        duration: 0.4,
        ease: "power2.out",
      });
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="grid min-h-[70vh] items-center gap-10 border border-rule-strong lg:grid-cols-[1.1fr_0.9fr]"
    >
      <div className="p-8 md:p-12">
        <p className="pn-data mb-4">Choisir ensemble</p>
        <h1 className="pn-display text-[clamp(3rem,8vw,6rem)] text-paper">
          Play
          <br />
          Next
        </h1>
        <span className="pn-accent my-6" />
        <p className="max-w-sm text-sm text-paper-2">
          Rassemblez les jeux du groupe, puis choisissez ensemble avec un vote
          simple et secret.
        </p>
        <div className="mt-8">
          <Button
            variant="primary"
            disabled={authLoading || loginPending}
            onClick={onLogin}
            className="inline-flex items-center gap-3"
          >
            <DiscordIcon size={16} />
            {authLoading
              ? "…"
              : loginPending
                ? "Discord…"
                : "Continuer avec Discord"}
          </Button>
        </div>
      </div>
      <div className="hidden h-full border-l border-rule-strong bg-ink-deep lg:block" aria-hidden />
    </div>
  );
}

function UpdateNotice({
  update,
  busy,
  onInstall,
  onDismiss,
}: {
  update: Update;
  busy: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-4 border border-rule-strong p-3">
      <span className="pn-stamp">MISE À JOUR</span>
      <p className="pn-data flex-1 text-paper">
        Version {update.version} disponible.
      </p>
      <Button variant="primary" disabled={busy} onClick={onInstall}>
        {busy ? "Installation…" : "Installer"}
      </Button>
      <button
        type="button"
        className="pn-data px-2 py-2 text-smoke hover:text-paper"
        onClick={onDismiss}
      >
        Plus tard
      </button>
    </div>
  );
}
