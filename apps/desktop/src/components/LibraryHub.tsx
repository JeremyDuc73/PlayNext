import { useEffect, useMemo, useState } from "react";
import {
  disconnectEpic,
  disconnectMicrosoft,
  exchangeEpicCode,
  fetchEpicStatus,
  fetchMicrosoftStatus,
  fetchMyLibrary,
  startEpicLink,
  startMicrosoftLink,
  syncEpicLibrary,
  syncSteamLibrary,
  syncXboxLibrary,
  type LibraryGame,
} from "../lib/api";
import {
  openExternalUrl,
  runningInDesktopShell,
} from "../lib/desktop-auth";
import { scanEpicLocal } from "../lib/epic";
import {
  dedupePreferLaunchers,
  isJunkGameName,
} from "../lib/library-filter";
import { pad2 } from "../lib/format";
import { scanSteamLocal } from "../lib/steam";
import { scanXboxLocal } from "../lib/xbox";
import { Button } from "../ui/Button";
import { EmptyHint } from "../ui/EmptyHint";
import { GamePoster } from "../ui/GamePoster";
import { PosterGrid } from "../ui/PosterGrid";

type Props = {
  enabled: boolean;
  microsoftLinkedSignal?: number;
  onBanner: (message: string) => void;
};

type LauncherFilter = "all" | "steam" | "xbox" | "epic";

export function LibraryHub({
  enabled,
  microsoftLinkedSignal = 0,
  onBanner,
}: Props) {
  const isDesktop = runningInDesktopShell();
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [launcher, setLauncher] = useState<LauncherFilter>("all");
  const [installedOnly, setInstalledOnly] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [busy, setBusy] = useState<string | null>(null);

  const [msConfigured, setMsConfigured] = useState(false);
  const [msLinked, setMsLinked] = useState(false);
  const [epicLinked, setEpicLinked] = useState(false);
  const [epicLoginUrl, setEpicLoginUrl] = useState<string | null>(null);
  const [epicCode, setEpicCode] = useState("");

  async function refreshGames() {
    setGames(await fetchMyLibrary());
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
          if (!cancelled) setEpicLinked(s.linked);
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
    };
    for (const g of cleaned) {
      if (g.launcher === "steam") c.steam += 1;
      if (g.launcher === "xbox") c.xbox += 1;
      if (g.launcher === "epic") c.epic += 1;
    }
    return c;
  }, [cleaned]);

  async function onScanSteam() {
    if (!isDesktop) {
      onBanner("Le scan Steam nécessite l’application Windows.");
      return;
    }
    setBusy("steam");
    try {
      const result = await scanSteamLocal();
      if (!result.steamFound) {
        onBanner(result.warnings[0] ?? "Steam introuvable.");
        return;
      }
      const sync = await syncSteamLibrary(result.games, result.steamId);
      await refreshGames();
      onBanner(
        `Steam — ${sync.synced} jeux, ${sync.installed} installés.`,
      );
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Scan Steam échoué.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onConnectMs() {
    setBusy("ms-link");
    try {
      const url = await startMicrosoftLink(isDesktop ? "desktop" : "web");
      onBanner("Navigateur ouvert — valide Microsoft.");
      await openExternalUrl(url);
    } catch {
      onBanner("Login Microsoft impossible (docs/XBOX.md).");
    } finally {
      setBusy(null);
    }
  }

  async function onScanXbox() {
    if (!msLinked) {
      onBanner("Connecte d’abord Microsoft / Xbox.");
      return;
    }
    setBusy("xbox");
    try {
      let installed: Array<{ externalId: string; name?: string }> = [];
      if (isDesktop) {
        const local = await scanXboxLocal();
        installed = local.games.map((g) => ({
          externalId: g.externalId,
          name: g.name,
        }));
      }
      const sync = await syncXboxLibrary(installed);
      await refreshGames();
      onBanner(
        `Xbox — ${sync.synced} jeux (${sync.installed} installés).`,
      );
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Scan Xbox échoué.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onConnectEpic() {
    setBusy("epic-link");
    try {
      const { url } = await startEpicLink();
      setEpicLoginUrl(url);
      onBanner("Ouvre Epic, copie authorizationCode, colle-le.");
    } catch {
      onBanner("Login Epic impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function onExchangeEpic() {
    if (!epicCode.trim()) return;
    setBusy("epic-link");
    try {
      await exchangeEpicCode(epicCode.trim());
      setEpicLinked(true);
      setEpicLoginUrl(null);
      setEpicCode("");
      onBanner("Epic lié.");
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Code Epic invalide.");
    } finally {
      setBusy(null);
    }
  }

  async function onScanEpic() {
    if (!epicLinked) {
      onBanner("Connecte d’abord Epic.");
      return;
    }
    setBusy("epic");
    try {
      let installed: Array<{ externalId: string; name?: string }> = [];
      if (isDesktop) {
        const local = await scanEpicLocal();
        installed = local.games.map((g) => ({
          externalId: g.externalId,
          name: g.name,
        }));
      }
      const sync = await syncEpicLibrary(installed);
      await refreshGames();
      onBanner(
        `Epic — ${sync.synced} jeux (${sync.installed} installés).`,
      );
    } catch (error) {
      onBanner(
        error instanceof Error ? error.message : "Scan Epic échoué.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
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
          {pad2(counts.xbox)} · Epic {pad2(counts.epic)}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-rule-strong pb-4">
        {(
          [
            ["all", "Tous"],
            ["steam", "Steam"],
            ["xbox", "Xbox"],
            ["epic", "Epic"],
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
            variant="primary"
            disabled={Boolean(busy) || !isDesktop}
            onClick={() => void onScanSteam()}
          >
            {busy === "steam" ? "…" : "Scan Steam"}
          </Button>
          {msLinked ? (
            <Button
              variant="second"
              disabled={Boolean(busy)}
              onClick={() => void onScanXbox()}
            >
              {busy === "xbox" ? "…" : "Scan Xbox"}
            </Button>
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
            <Button
              variant="second"
              disabled={Boolean(busy)}
              onClick={() => void onScanEpic()}
            >
              {busy === "epic" ? "…" : "Scan Epic"}
            </Button>
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

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          type="search"
          className="min-w-[220px] max-w-md flex-1 border border-rule-strong bg-ink-deep px-3 py-2.5 font-data text-[11px] tracking-[0.1em] uppercase outline-none focus:border-paper"
          placeholder="Chercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant="ghost"
          onClick={() =>
            setDensity((d) =>
              d === "comfortable" ? "compact" : "comfortable",
            )
          }
        >
          {density === "comfortable" ? "Densité +" : "Densité −"}
        </Button>
        {msLinked ? (
          <Button
            variant="ghost"
            onClick={() =>
              void disconnectMicrosoft()
                .then(() => setMsLinked(false))
                .then(() => onBanner("Microsoft déconnecté."))
                .catch(() => onBanner("Déconnexion MS échouée."))
            }
          >
            MS off
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
            Epic off
          </Button>
        ) : null}
      </div>

      {epicLoginUrl ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 border border-rule-strong p-3">
          <a
            href={epicLoginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pn-btn-second"
          >
            Page Epic
          </a>
          <input
            className="min-w-[200px] flex-1 border border-rule-strong bg-ink-deep px-3 py-2 font-data text-[11px] uppercase outline-none focus:border-paper"
            value={epicCode}
            onChange={(e) => setEpicCode(e.target.value)}
            placeholder="authorizationCode"
          />
          <Button
            variant="primary"
            disabled={Boolean(busy) || !epicCode.trim()}
            onClick={() => void onExchangeEpic()}
          >
            Valider
          </Button>
        </div>
      ) : null}

      <p className="pn-data mb-4">
        {pad2(visible.length)} jeu{visible.length > 1 ? "x" : ""}
        {busy ? (
          <>
            {" · "}
            <span className="inline-flex items-center gap-2">
              Sync <span className="pn-sync w-20"><i /></span>
            </span>
          </>
        ) : null}
      </p>

      {loading ? (
        <EmptyHint title="Chargement…" />
      ) : visible.length === 0 ? (
        <EmptyHint
          title="Rien à afficher"
          body="Scanne Steam / Xbox / Epic."
        />
      ) : (
        <PosterGrid
          label="Bibliothèque"
          density={density}
          animateKey={`${launcher}:${installedOnly}:${visible.length}:${query}`}
        >
          {visible.map((game) => (
            <div key={game.id} role="listitem">
              <GamePoster
                name={game.name}
                launcher={game.launcher}
                externalId={game.externalId}
                coverUrl={game.coverUrl}
                subtitle={`${game.launcher}${
                  game.installed ? " · installé" : ""
                }`}
              />
            </div>
          ))}
        </PosterGrid>
      )}
    </section>
  );
}
