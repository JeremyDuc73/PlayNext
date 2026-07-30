import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { GroupsPanel } from "./components/GroupsPanel";
import { LibraryHub } from "./components/LibraryHub";
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

type HealthResponse = {
  ok: boolean;
  service: string;
  database: "up" | "down";
};

type NavId = "evening" | "group" | "library";

const TABS: { id: NavId; label: string }[] = [
  { id: "evening", label: "Soirée" },
  { id: "group", label: "Groupe" },
  { id: "library", label: "Bibliothèque" },
];

const RAIL_COPY: Record<NavId, string> = {
  evening: "Ce soir, on décide",
  group: "Groupe",
  library: "Bibliothèque partagée",
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
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(
    null,
  );
  const [nav, setNav] = useState<NavId>("evening");
  const isDesktop = runningInDesktopShell();
  const shellRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

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
            setAuthBanner(microsoftErrorMessage(parsed.error));
            setMicrosoftLinkedSignal((n) => n + 1);
          } else if (parsed.ok) {
            setAuthBanner("Compte Microsoft / Xbox lié.");
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
            setAuthBanner("Échange de session desktop échoué.");
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
            version: "0.1.0",
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

  useGSAP(
    () => {
      viewSwap(viewRef.current);
    },
    { dependencies: [nav, Boolean(user)], scope: shellRef },
  );

  async function onLoginClick() {
    setLoginPending(true);
    setAuthBanner(isDesktop ? "Navigateur ouvert — valide Discord." : null);
    await startDiscordLogin();
  }

  async function logout() {
    await logoutRequest();
    setUser(null);
    setAuthBanner("Déconnecté.");
    setLoginPending(false);
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
          {user ? RAIL_COPY[nav] : "Ce soir, on décide"}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-topbar shrink-0 items-stretch border-b border-rule-strong">
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
            {authBanner ? (
              <div className="mb-5">
                <Banner>{authBanner}</Banner>
              </div>
            ) : null}

            {user ? (
              <div ref={viewRef}>
                {nav === "library" ? (
                  <LibraryHub
                    enabled
                    microsoftLinkedSignal={microsoftLinkedSignal}
                    onBanner={(message) => setAuthBanner(message)}
                  />
                ) : (
                  <GroupsPanel
                    enabled
                    focus={nav === "evening" ? "evening" : "group"}
                    currentUserId={user.id}
                    pendingInviteCode={pendingInviteCode}
                    onPendingInviteConsumed={() => setPendingInviteCode(null)}
                    onBanner={(message) => setAuthBanner(message)}
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
          <span className="pn-data">Ce soir, on décide.</span>
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
        <p className="pn-data mb-4">Ce soir, on décide</p>
        <h1 className="pn-display text-[clamp(3rem,8vw,6rem)] text-paper">
          Play
          <br />
          Next
        </h1>
        <span className="pn-accent my-6" />
        <p className="max-w-sm text-sm text-paper-2">
          Shortlist. Bulletins scellés. Un veto. On tranche ce soir.
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
