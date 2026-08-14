import { useEffect, useMemo, useState } from "react";
import {
  disconnectEpic,
  disconnectMicrosoft,
  exchangeEpicCode,
  fetchEpicStatus,
  fetchMicrosoftStatus,
  fetchMyLibrary,
  retryUnknownPlayable,
  stampLibraryPlayable,
  startMicrosoftLink,
  type LibraryGame,
  type User,
} from "../lib/api";
import {
  openExternalUrl,
  startMicrosoftLoginNative,
} from "../lib/desktop-auth";
import { startEpicLoginNative } from "../lib/epic";
import { pad2 } from "../lib/format";
import {
  launcherLabel,
  playableStatus,
  playableStatusLabel,
  summarizePlayable,
} from "../lib/playable-status";
import { Button } from "../ui/Button";
import { PlayableStamp } from "../ui/PlayableStamp";
import { SquareAvatar } from "../ui/SquareAvatar";

type Props = {
  user: User;
  isDesktop: boolean;
  microsoftLinkedSignal: number;
  epicLinkedSignal: number;
  onConnectionChanged: (provider: "microsoft" | "epic") => void;
  onBanner: (message: string) => void;
};

export function ProfilePanel({
  user,
  isDesktop,
  microsoftLinkedSignal,
  epicLinkedSignal,
  onConnectionChanged,
  onBanner,
}: Props) {
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false);
  const [microsoftLinked, setMicrosoftLinked] = useState(false);
  const [epicLinked, setEpicLinked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [libraryGames, setLibraryGames] = useState<LibraryGame[]>([]);
  const [libraryQueued, setLibraryQueued] = useState(0);
  const [restFilter, setRestFilter] = useState<"all" | "pending" | "unknown">(
    "all",
  );

  const ranking = useMemo(
    () => summarizePlayable(libraryGames),
    [libraryGames],
  );
  const restVisible = useMemo(() => {
    if (restFilter === "all") return ranking.remaining;
    return ranking.remaining.filter(
      (game) => playableStatus(game) === restFilter,
    );
  }, [ranking.remaining, restFilter]);

  async function refreshLibrary() {
    const library = await fetchMyLibrary();
    setLibraryGames(library.games);
    setLibraryQueued(library.groupPlayableQueued);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchMicrosoftStatus(),
      fetchEpicStatus(),
    ])
      .then(([microsoft, epic]) => {
        if (cancelled) return;
        setMicrosoftConfigured(microsoft.configured);
        setMicrosoftLinked(microsoft.linked);
        setEpicLinked(epic.linked);
      })
      .catch(() => {
        if (cancelled) return;
        setMicrosoftConfigured(false);
        setMicrosoftLinked(false);
        setEpicLinked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [microsoftLinkedSignal, epicLinkedSignal]);

  useEffect(() => {
    let cancelled = false;
    void refreshLibrary().catch(() => {
      if (cancelled) return;
      setLibraryGames([]);
      setLibraryQueued(0);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (libraryQueued <= 0) return;
    const timer = window.setInterval(() => {
      void refreshLibrary().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryQueued]);

  async function linkMicrosoft() {
    setBusy("microsoft-link");
    try {
      const url = await startMicrosoftLink(isDesktop ? "desktop" : "web");
      if (isDesktop) {
        const payload = await startMicrosoftLoginNative(url);
        if (payload.kind !== "microsoft") {
          throw new Error("microsoft_callback_invalid");
        }
        if (payload.error) throw new Error(payload.error);
        setMicrosoftLinked(true);
        onConnectionChanged("microsoft");
        onBanner("Compte Microsoft / Xbox lié.");
      } else {
        await openExternalUrl(url);
        onBanner("Connexion Microsoft ouverte.");
      }
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function linkEpic() {
    if (!isDesktop) {
      onBanner("La liaison Epic nécessite l’application Windows.");
      return;
    }
    setBusy("epic-link");
    try {
      const code = await startEpicLoginNative();
      await exchangeEpicCode(code);
      setEpicLinked(true);
      onConnectionChanged("epic");
      onBanner("Compte Epic lié.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function unlinkMicrosoft() {
    setBusy("microsoft-unlink");
    try {
      await disconnectMicrosoft();
      setMicrosoftLinked(false);
      onConnectionChanged("microsoft");
      onBanner("Compte Microsoft / Xbox déconnecté.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Déconnexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function unlinkEpic() {
    setBusy("epic-unlink");
    try {
      await disconnectEpic();
      setEpicLinked(false);
      onConnectionChanged("epic");
      onBanner("Compte Epic déconnecté.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Déconnexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function onStampPlayable(game: LibraryGame, playable: boolean) {
    setBusy("playable");
    try {
      await stampLibraryPlayable(game.launcher, game.externalId, playable);
      await refreshLibrary();
      onBanner(playable ? "Classé multi." : "Classé solo.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Classement impossible.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRetryUnknown() {
    setBusy("retry-playable");
    try {
      const reopened = await retryUnknownPlayable();
      await refreshLibrary();
      onBanner(
        reopened > 0 ? "Sans réponse relancés." : "Rien à relancer.",
      );
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Relance impossible.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="grid max-w-4xl gap-6">
      <header className="border-b border-rule-strong pb-5">
        <p className="pn-data mb-2">Compte</p>
        <div className="flex items-center gap-4">
          <SquareAvatar name={user.displayName} avatarUrl={user.avatarUrl} />
          <div>
            <h2 className="pn-display text-4xl">Profil</h2>
            <p className="pn-data mt-2">{user.displayName}</p>
          </div>
        </div>
        <span className="pn-accent mt-4" />
      </header>

      <section className="border border-rule-strong">
        <div className="border-b border-rule-strong p-4">
          <p className="pn-data">Comptes de jeux</p>
          <h3 className="pn-display mt-2 text-2xl">Bibliothèques liées</h3>
        </div>
        <div className="divide-y divide-rule-strong">
          <ConnectionRow
            name="Microsoft / Xbox"
            description="Historique PC et jeux installés."
            linked={microsoftLinked}
            action={
              microsoftLinked
                ? unlinkMicrosoft
                : microsoftConfigured
                  ? linkMicrosoft
                  : undefined
            }
            actionLabel={microsoftLinked ? "Déconnecter" : "Lier"}
            busy={busy === "microsoft-link" || busy === "microsoft-unlink"}
            unavailable={!microsoftConfigured && !microsoftLinked}
          />
          <ConnectionRow
            name="Epic Games"
            description="Jeux possédés et installés."
            linked={epicLinked}
            action={epicLinked ? unlinkEpic : linkEpic}
            actionLabel={epicLinked ? "Déconnecter" : "Lier"}
            busy={busy === "epic-link" || busy === "epic-unlink"}
            unavailable={!isDesktop && !epicLinked}
          />
        </div>
      </section>

      <section className="border border-rule-strong">
        <div className="border-b border-rule-strong p-4">
          <p className="pn-data">Multi / solo</p>
          <h3 className="pn-display mt-2 text-2xl">Classement</h3>
          <p className="mt-3 max-w-2xl text-sm text-paper-2">
            Steam Store puis IGDB. Tampon Multi / Solo sur un titre restant :
            ça compte pour le groupe. Relancer ne retente que les sans réponse.
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-rule-strong border-b border-rule-strong sm:grid-cols-4 sm:divide-y-0">
          <StatCell label="Titres" value={pad2(ranking.total)} />
          <StatCell label="Classés" value={pad2(ranking.classified)} />
          <StatCell label="En attente" value={pad2(ranking.pending)} />
          <StatCell label="Sans réponse" value={pad2(ranking.unknown)} />
        </div>
        {ranking.pending > 0 ? (
          <p className="flex items-center gap-2 border-b border-rule-strong px-4 py-3 pn-data">
            Classement <span className="pn-sync w-20"><i /></span>
          </p>
        ) : null}
        {ranking.remaining.length === 0 ? (
          <p className="px-4 py-6 pn-data">Tous les titres sont classés.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-rule-strong px-4 py-3">
              {(
                [
                  ["all", "Restants"],
                  ["pending", "En attente"],
                  ["unknown", "Sans réponse"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={
                    restFilter === key
                      ? "pn-data text-paper"
                      : "pn-data hover:text-paper"
                  }
                  onClick={() => setRestFilter(key)}
                >
                  {label}
                </button>
              ))}
              {ranking.unknown > 0 ? (
                <div className="ml-auto">
                  <Button
                    variant="second"
                    disabled={Boolean(busy)}
                    onClick={() => void onRetryUnknown()}
                  >
                    {busy === "retry-playable"
                      ? "Relance…"
                      : "Relancer les sans réponse"}
                  </Button>
                </div>
              ) : null}
            </div>
            {restVisible.length === 0 ? (
              <p className="px-4 py-6 pn-data">Aucun titre dans ce filtre.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {restVisible.map((game, index) => {
                  const status = playableStatus(game);
                  return (
                    <li
                      key={`${game.launcher}:${game.externalId}`}
                      className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-4 py-3"
                    >
                      <span className="pn-data text-smoke-dim">
                        {pad2(index + 1)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-ui text-xs font-bold uppercase tracking-[0.08em]">
                          {game.name}
                        </span>
                        <span className="pn-data mt-1 block">
                          {launcherLabel(game.launcher)}
                          {" · "}
                          {playableStatusLabel(status)}
                        </span>
                      </span>
                      <PlayableStamp
                        disabled={Boolean(busy)}
                        onPick={(playable) =>
                          void onStampPlayable(game, playable)
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="border border-rule-strong p-4">
        <p className="pn-data mb-2">Données</p>
        <h3 className="pn-display text-2xl">Ce que PlayNext conserve</h3>
        <p className="mt-3 max-w-2xl text-sm text-paper-2">
          Les identifiants de jeux, leur launcher, leur état d’installation et
          vos réglages de masquage. Les chemins locaux et les fichiers de votre
          PC ne sont jamais synchronisés.
        </p>
      </section>
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4">
      <p className="pn-data">{label}</p>
      <p className="pn-display mt-2 text-3xl">{value}</p>
    </div>
  );
}

function ConnectionRow({
  name,
  description,
  linked,
  action,
  actionLabel,
  busy,
  unavailable,
}: {
  name: string;
  description: string;
  linked: boolean;
  action?: () => Promise<void>;
  actionLabel: string;
  busy: boolean;
  unavailable: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div>
        <p className="font-ui font-bold uppercase tracking-[0.08em]">{name}</p>
        <p className="pn-data mt-1">{linked ? "Lié" : description}</p>
      </div>
      {action && !unavailable ? (
        <Button
          variant={linked ? "ghost" : "second"}
          disabled={busy}
          onClick={() => void action()}
        >
          {busy ? "…" : actionLabel}
        </Button>
      ) : (
        <span className="pn-data">Non configuré</span>
      )}
    </div>
  );
}
