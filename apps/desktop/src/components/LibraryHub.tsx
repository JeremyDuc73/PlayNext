import { useEffect, useMemo, useState } from "react";
import {
  disconnectEpic,
  disconnectMicrosoft,
  addManualGame,
  deleteManualGame,
  exchangeEpicCode,
  fetchEpicStatus,
  fetchMyHiddenLibrary,
  fetchMicrosoftStatus,
  fetchMyLibrary,
  hideLibraryGame,
  startMicrosoftLink,
  syncEpicLibrary,
  syncSteamLibrary,
  syncXboxLibrary,
  unhideLibraryGame,
  searchManualGames,
  syncRiotLibrary,
  type ManualCatalogGame,
  type HiddenLibraryGame,
  type LibraryGame,
} from "../lib/api";
import {
  openExternalUrl,
  runningInDesktopShell,
  startMicrosoftLoginNative,
} from "../lib/desktop-auth";
import { scanEpicLocal, startEpicLoginNative } from "../lib/epic";
import {
  dedupePreferLaunchers,
  isJunkGameName,
} from "../lib/library-filter";
import { pad2 } from "../lib/format";
import { metaMapKey, resolveGameMeta, type GameMeta } from "../lib/meta";
import { scanSteamLocal } from "../lib/steam";
import { scanXboxLocal } from "../lib/xbox";
import { scanRiotLocal } from "../lib/riot";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyHint } from "../ui/EmptyHint";
import { GamePoster } from "../ui/GamePoster";
import { PosterGrid } from "../ui/PosterGrid";

type Props = {
  enabled: boolean;
  microsoftLinkedSignal?: number;
  onBanner: (message: string) => void;
};

type LauncherFilter = "all" | "steam" | "xbox" | "epic" | "riot" | "manual";
const LIBRARY_CACHE_KEY = "playnext_library_cache";

type LibraryCache = {
  games: LibraryGame[];
  hiddenGames: HiddenLibraryGame[];
  savedAt: string;
};

export function LibraryHub({
  enabled,
  microsoftLinkedSignal = 0,
  onBanner,
}: Props) {
  const isDesktop = runningInDesktopShell();
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [hiddenGames, setHiddenGames] = useState<HiddenLibraryGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [launcher, setLauncher] = useState<LauncherFilter>("all");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<ManualCatalogGame[]>([]);
  const [manualBusy, setManualBusy] = useState(false);
  const [manualDeleteTarget, setManualDeleteTarget] =
    useState<LibraryGame | null>(null);

  const [msConfigured, setMsConfigured] = useState(false);
  const [msLinked, setMsLinked] = useState(false);
  const [epicLinked, setEpicLinked] = useState(false);
  const [resolvedMeta, setResolvedMeta] = useState<Map<string, GameMeta>>(
    new Map(),
  );

  async function refreshGames() {
    try {
      const [nextGames, nextHiddenGames] = await Promise.all([
        fetchMyLibrary(),
        fetchMyHiddenLibrary(),
      ]);
      setGames(nextGames);
      setHiddenGames(nextHiddenGames);
      try {
        localStorage.setItem(
          LIBRARY_CACHE_KEY,
          JSON.stringify({
            games: nextGames,
            hiddenGames: nextHiddenGames,
            savedAt: new Date().toISOString(),
          } satisfies LibraryCache),
        );
      } catch {
        // Local storage is optional.
      }
      void resolveGameMeta(
        nextGames.map((game) => ({
          launcher: game.launcher,
          externalId: game.externalId,
          name: game.name,
        })),
      )
        .then(setResolvedMeta)
        .catch(() => undefined);
    } catch (error) {
      try {
        const cached = JSON.parse(
          localStorage.getItem(LIBRARY_CACHE_KEY) ?? "null",
        ) as LibraryCache | null;
        if (cached?.games && cached.hiddenGames) {
          setGames(cached.games);
          setHiddenGames(cached.hiddenGames);
          onBanner("Dernière bibliothèque disponible hors connexion.");
          return;
        }
      } catch {
        // Fall through to the normal error handling.
      }
      throw error;
    }
  }

  async function onHideGame(game: LibraryGame) {
    setBusy("hide-game");
    try {
      await hideLibraryGame(game.launcher, game.externalId);
      await refreshGames();
      onBanner("Jeu masqué.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Masquage impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function onUnhideGame(game: HiddenLibraryGame) {
    setBusy("unhide-game");
    try {
      await unhideLibraryGame(game.launcher, game.externalId);
      await refreshGames();
      onBanner("Jeu réaffiché.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Réaffichage impossible.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteManualGame() {
    if (!manualDeleteTarget) return;
    const game = manualDeleteTarget;
    setBusy("delete-manual");
    try {
      await deleteManualGame(game.externalId);
      await refreshGames();
      setManualDeleteTarget(null);
      onBanner("Jeu supprimé de la bibliothèque.");
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Suppression impossible.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onSearchManual() {
    if (manualQuery.trim().length < 2) {
      onBanner("Saisis au moins 2 caractères.");
      return;
    }
    setManualBusy(true);
    try {
      setManualResults(await searchManualGames(manualQuery.trim()));
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Recherche IGDB échouée.",
      );
    } finally {
      setManualBusy(false);
    }
  }

  async function onAddManual(game: ManualCatalogGame) {
    setManualBusy(true);
    try {
      await addManualGame(game.igdbId);
      await refreshGames();
      onBanner(`${game.name} ajouté à la bibliothèque.`);
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Ajout impossible.");
    } finally {
      setManualBusy(false);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      refreshGames(),
      fetchMicrosoftStatus()
        .then((s) => {
          if (!cancelled) {
            setMsConfigured(s.configured);
            setMsLinked(s.linked);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMsConfigured(false);
            setMsLinked(false);
          }
        }),
      fetchEpicStatus()
        .then((s) => {
          if (!cancelled) {
            setEpicLinked(s.linked);
          }
        })
        .catch(() => {
          if (!cancelled) setEpicLinked(false);
        }),
    ])
      .catch(() => {
        if (!cancelled) onBanner("Impossible de charger la bibliothèque.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, microsoftLinkedSignal]);

  const cleaned = useMemo(
    () => games.filter((g) => !isJunkGameName(g.name)),
    [games],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped =
      launcher === "all" ? dedupePreferLaunchers(cleaned) : cleaned;
    return scoped.filter((g) => {
      if (launcher !== "all" && g.launcher !== launcher) return false;
      if (installedOnly && !g.installed) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cleaned, launcher, installedOnly, query]);

  const counts = useMemo(() => {
    const dedupedAll = dedupePreferLaunchers(cleaned);
    const c = {
      all: dedupedAll.length,
      steam: 0,
      xbox: 0,
      epic: 0,
      riot: 0,
      manual: 0,
    };
    for (const g of cleaned) {
      if (g.launcher === "steam") c.steam += 1;
      if (g.launcher === "xbox") c.xbox += 1;
      if (g.launcher === "epic") c.epic += 1;
      if (g.launcher === "riot") c.riot += 1;
      if (g.launcher === "manual") c.manual += 1;
    }
    return c;
  }, [cleaned]);

  async function onConnectMs() {
    setBusy("ms-link");
    try {
      const url = await startMicrosoftLink(isDesktop ? "desktop" : "web");
      if (isDesktop) {
        const payload = await startMicrosoftLoginNative(url);
        if (payload.kind !== "microsoft") {
          throw new Error("microsoft_callback_invalid");
        }
        if (payload.error) {
          onBanner(`Lien Microsoft échoué (${payload.error}).`);
        } else if (payload.ok) {
          setMsLinked(true);
          onBanner("Compte Microsoft / Xbox lié.");
        }
        return;
      }
      onBanner("Navigateur ouvert — valide Microsoft.");
      await openExternalUrl(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      onBanner(reason || "Connexion Microsoft impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function onConnectEpic() {
    if (!isDesktop) {
      onBanner("La liaison Epic automatique nécessite l’application Windows.");
      return;
    }
    setBusy("epic-link");
    try {
      const code = await startEpicLoginNative();
      await exchangeEpicCode(code);
      setEpicLinked(true);
      onBanner("Compte Epic lié.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (reason === "epic_login_cancelled") {
        onBanner("Connexion Epic annulée.");
      } else if (reason === "epic_login_timeout") {
        onBanner("Connexion Epic expirée.");
      } else {
        onBanner(reason || "Connexion Epic impossible.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function onSyncAll() {
    if (!isDesktop) {
      onBanner("La synchronisation nécessite l’application Windows.");
      return;
    }

    setBusy("sync-all");
    try {
      const tasks: Array<Promise<unknown>> = [
        (async () => {
          const local = await scanSteamLocal();
          if (!local.steamFound) return;
          await syncSteamLibrary(local.games, local.steamId);
        })(),
        (async () => {
          const local = await scanRiotLocal();
          await syncRiotLibrary(
            local.games.map((game) => ({
              externalId: game.externalId,
              name: game.name,
            })),
          );
        })(),
      ];

      if (msLinked) {
        tasks.push(
          (async () => {
            const local = await scanXboxLocal();
            await syncXboxLibrary(
              local.games.map((game) => ({
                externalId: game.externalId,
                name: game.name,
              })),
            );
          })(),
        );
      }

      if (epicLinked) {
        tasks.push(
          (async () => {
            const local = await scanEpicLocal();
            await syncEpicLibrary(
              local.games.map((game) => ({
                externalId: game.externalId,
                name: game.name,
              })),
            );
          })(),
        );
      }

      const results = await Promise.allSettled(tasks);
      await refreshGames();
      onBanner(
        results.some((result) => result.status === "rejected")
          ? "Synchronisation partielle."
          : "Synchronisation terminée.",
      );
    } catch {
      onBanner("Synchronisation impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-rule-strong pb-5">
        <div>
          <p className="pn-data mb-2">Catalogue</p>
          <h2 className="pn-display text-[clamp(2.2rem,5vw,4rem)]">
            Bibliothèque
            <br />
            partagée
          </h2>
          <span className="pn-accent mt-4" />
        </div>
        <p className="pn-data">
          {pad2(counts.all)} titres · Steam {pad2(counts.steam)} · Xbox{" "}
          {pad2(counts.xbox)} · Epic {pad2(counts.epic)} · Riot{" "}
          {pad2(counts.riot)} · Manuel{" "}
          {pad2(counts.manual)}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-rule-strong pb-4">
        {(
          [
            ["all", "Tous"],
            ["steam", "Steam"],
            ["xbox", "Xbox"],
            ["epic", "Epic"],
            ["riot", "Riot"],
            ["manual", "Manuel"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              launcher === key
                ? "bg-paper px-3 py-2 font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-ink-deep"
                : "px-3 py-2 font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-smoke hover:text-paper"
            }
            onClick={() => setLauncher(key)}
          >
            {label}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-rule-strong" aria-hidden />
        <button
          type="button"
          className={
            installedOnly
              ? "pn-data text-paper"
              : "pn-data hover:text-paper"
          }
          onClick={() => setInstalledOnly((v) => !v)}
        >
          Installés
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="second"
            disabled={Boolean(busy) || manualBusy}
            onClick={() => {
              setManualOpen((open) => !open);
              setManualResults([]);
            }}
          >
            Ajouter un jeu
          </Button>
          <Button
            variant="primary"
            disabled={Boolean(busy) || !isDesktop}
            onClick={() => void onSyncAll()}
          >
            {busy === "sync-all" ? "Synchronisation…" : "Synchroniser"}
          </Button>
          {msLinked ? (
            <span className="pn-data text-paper">Xbox lié</span>
          ) : msConfigured ? (
            <Button
              variant="second"
              disabled={Boolean(busy)}
              onClick={() => void onConnectMs()}
            >
              Lier Xbox
            </Button>
          ) : null}
          {epicLinked ? (
            <span className="pn-data text-paper">Epic lié</span>
          ) : (
            <Button
              variant="second"
              disabled={Boolean(busy)}
              onClick={() => void onConnectEpic()}
            >
              Lier Epic
            </Button>
          )}
        </div>
      </div>

      {manualOpen ? (
        <section className="mb-5 border border-rule-strong p-4">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
            <div>
              <p className="pn-data mb-1">Ajout manuel</p>
              <h3 className="pn-display text-2xl">Chercher dans IGDB</h3>
            </div>
            <button
              type="button"
              className="pn-data hover:text-paper"
              onClick={() => setManualOpen(false)}
            >
              Fermer
            </button>
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onSearchManual();
            }}
          >
            <input
              className="min-w-[240px] flex-1 border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-veto"
              value={manualQuery}
              onChange={(event) => setManualQuery(event.target.value)}
              placeholder="Titre du jeu"
              aria-label="Titre du jeu à chercher"
            />
            <Button variant="primary" type="submit" disabled={manualBusy}>
              {manualBusy ? "Recherche…" : "Rechercher"}
            </Button>
          </form>
          {manualResults.length > 0 ? (
            <ul className="mt-4 grid list-none gap-2 p-0 md:grid-cols-2">
              {manualResults.map((game) => {
                const alreadyAdded = games.some(
                  (item) =>
                    item.launcher === "manual" &&
                    item.externalId === String(game.igdbId),
                );
                return (
                  <li
                    key={game.igdbId}
                    className="flex items-center gap-3 border-b border-rule py-2"
                  >
                    {game.coverUrl ? (
                      <img
                        src={game.coverUrl}
                        alt=""
                        className="h-16 w-12 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-16 w-12 items-center justify-center bg-ink-raise pn-display text-xl text-smoke-dim">
                        {game.name.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-ui text-xs font-bold uppercase tracking-[0.08em]">
                        {game.name}
                      </span>
                      {game.year ? (
                        <span className="pn-data">{game.year}</span>
                      ) : null}
                    </span>
                    <Button
                      variant="ghost"
                      disabled={manualBusy || alreadyAdded}
                      onClick={() => void onAddManual(game)}
                    >
                      {alreadyAdded ? "Ajouté" : "Ajouter"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          type="search"
          className="min-w-[220px] max-w-md flex-1 border border-rule-strong bg-ink-deep px-3 py-2.5 font-data text-[11px] tracking-[0.1em] uppercase outline-none focus:border-paper"
          placeholder="Chercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {msLinked ? (
          <Button
            variant="ghost"
            onClick={() =>
              void disconnectMicrosoft()
                .then(() => setMsLinked(false))
                .then(() => onBanner("Microsoft déconnecté."))
                .catch((error) =>
                  onBanner(
                    error instanceof Error
                      ? error.message
                      : "Déconnexion Xbox échouée.",
                  ),
                )
            }
          >
            Déconnecter Xbox
          </Button>
        ) : null}
        {epicLinked ? (
          <Button
            variant="ghost"
            onClick={() =>
              void disconnectEpic()
                .then(() => setEpicLinked(false))
                .then(() => onBanner("Epic déconnecté."))
                .catch(() => onBanner("Déconnexion Epic échouée."))
            }
          >
            Déconnecter Epic
          </Button>
        ) : null}
      </div>

      <p className="pn-data mb-4">
        {pad2(visible.length)} jeu{visible.length > 1 ? "x" : ""}
        {busy ? (
          <>
            {" · "}
            <span className="inline-flex items-center gap-2">
              Synchro <span className="pn-sync w-20"><i /></span>
            </span>
          </>
        ) : null}
      </p>

      {loading ? (
        <EmptyHint title="Chargement…" />
      ) : visible.length === 0 ? (
        <EmptyHint
          title="Rien à afficher"
            body="Scanne Steam / Xbox / Epic / Riot."
        />
      ) : (
        <PosterGrid
          label="Bibliothèque"
          animateKey={`${launcher}:${installedOnly}:${visible.length}:${query}`}
        >
          {visible.map((game, index) => {
            const meta = resolvedMeta.get(
              metaMapKey(game.launcher, game.externalId),
            );
            return (
              <div key={game.id} role="listitem">
                <GamePoster
                  name={game.name}
                  launcher={game.launcher}
                  externalId={game.externalId}
                  coverUrl={meta?.coverUrl ?? game.coverUrl}
                  fallbackUrls={meta?.fallbackUrls}
                  priority={index < 24}
                  subtitle={`${game.launcher}${
                    game.installed ? " · installé" : ""
                  }`}
                  footer={
                    <button
                      type="button"
                      className={
                        game.launcher === "manual"
                          ? "pn-data mt-1 text-veto hover:text-paper"
                          : "pn-data mt-1 hover:text-paper"
                      }
                      disabled={Boolean(busy)}
                      onClick={() =>
                        game.launcher === "manual"
                          ? setManualDeleteTarget(game)
                          : void onHideGame(game)
                      }
                    >
                      {game.launcher === "manual" ? "Supprimer" : "Masquer"}
                    </button>
                  }
                />
              </div>
            );
          })}
        </PosterGrid>
      )}
      {hiddenGames.length > 0 ? (
        <section className="mt-8 border-t border-rule-strong pt-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h3 className="pn-display text-2xl">Jeux masqués</h3>
            <span className="pn-data">{pad2(hiddenGames.length)}</span>
          </div>
          <PosterGrid label="Jeux masqués" animateKey={`hidden:${hiddenGames.length}`}>
            {hiddenGames.map((game) => (
              <div key={game.id} role="listitem">
                <GamePoster
                  name={game.name}
                  launcher={game.launcher}
                  externalId={game.externalId}
                  coverUrl={game.coverUrl}
                  subtitle={game.launcher}
                  footer={
                    <button
                      type="button"
                      className="pn-data mt-1 hover:text-paper"
                      disabled={Boolean(busy)}
                      onClick={() => void onUnhideGame(game)}
                    >
                      Réafficher
                    </button>
                  }
                />
              </div>
            ))}
          </PosterGrid>
        </section>
      ) : null}
      </section>
      {manualDeleteTarget ? (
        <ConfirmDialog
          title="Supprimer ce jeu ?"
          confirmLabel="Supprimer"
          busy={busy === "delete-manual"}
          onConfirm={() => void onDeleteManualGame()}
          onCancel={() => {
            if (busy !== "delete-manual") setManualDeleteTarget(null);
          }}
        >
          {`« ${manualDeleteTarget.name} » sera retiré de ta bibliothèque.`}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
