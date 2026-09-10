import { useEffect, useMemo, useRef, useState } from "react";
import { fetchGameDetails, type FullGameDetails } from "../lib/api";
import { openExternalUrl } from "../lib/desktop-auth";
import { pad2 } from "../lib/format";
import { useAppStore } from "../stores/useAppStore";
import { Button } from "../ui/Button";
import { GamePoster } from "../ui/GamePoster";
import { SquareAvatar } from "../ui/SquareAvatar";

function cleanCategories(categories: string[] = []): string[] {
  const result: string[] = [];

  let hasController = false;
  let hasOnlineCoop = false;
  let hasLanCoop = false;
  let hasSplitScreen = false;
  let hasOnlinePvp = false;
  let hasPvp = false;
  let hasCrossplay = false;
  let hasMultiplayer = false;
  let hasSolo = false;
  let hasMmo = false;
  let hasVr = false;

  for (const raw of categories) {
    const c = raw.trim();
    if (!c) continue;
    const lower = c.toLowerCase();

    // Normalisation contrôleur / manette
    if (
      lower.includes("contrôleur") ||
      lower.includes("controller") ||
      lower.includes("manette") ||
      lower.includes("dualshock") ||
      lower.includes("dualsense")
    ) {
      hasController = true;
      continue;
    }

    // VR
    if (lower.includes("vr") || lower.includes("réalité virtuelle")) {
      hasVr = true;
      continue;
    }

    // Crossplay
    if (lower.includes("multiplateforme") || lower.includes("cross-platform")) {
      hasCrossplay = true;
      continue;
    }

    // Écran partagé / Coop local
    if (
      lower.includes("écran partagé") ||
      lower.includes("partage d'écran") ||
      lower.includes("split screen") ||
      lower.includes("local coop") ||
      lower.includes("coop en local")
    ) {
      hasSplitScreen = true;
      continue;
    }

    // Coop en ligne
    if (
      (lower.includes("coop") || lower.includes("coopération")) &&
      (lower.includes("ligne") || lower.includes("online"))
    ) {
      hasOnlineCoop = true;
      continue;
    }

    // Coop en LAN
    if (
      (lower.includes("coop") || lower.includes("coopération")) &&
      lower.includes("lan")
    ) {
      hasLanCoop = true;
      continue;
    }

    // JcJ en ligne
    if (
      (lower.includes("jcj") || lower.includes("pvp")) &&
      (lower.includes("ligne") || lower.includes("online"))
    ) {
      hasOnlinePvp = true;
      continue;
    }

    // JcJ générique
    if (lower === "jcj" || lower === "pvp") {
      hasPvp = true;
      continue;
    }

    // MMO
    if (lower.includes("mmo") || lower.includes("massivement")) {
      hasMmo = true;
      continue;
    }

    // Multijoueur générique
    if (
      lower === "multijoueur" ||
      lower === "multi-player" ||
      lower === "multiplayer"
    ) {
      hasMultiplayer = true;
      continue;
    }

    // Solo
    if (
      lower === "solo" ||
      lower === "single-player" ||
      lower === "singleplayer"
    ) {
      hasSolo = true;
      continue;
    }

    // Modes spécifiques personnalisés (ex: Riot)
    if (lower.includes("compétitif") || lower.includes("contre bots")) {
      result.push(c);
      continue;
    }
  }

  // Ordre clair et hiérarchisé des modes
  if (hasOnlineCoop) result.push("Coop en ligne");
  else if (hasLanCoop || hasSplitScreen) result.push("Coopération");

  if (hasMultiplayer) result.push("Multijoueur");
  if (hasCrossplay) result.push("Crossplay");
  if (hasSplitScreen) result.push("Écran partagé");
  if (hasLanCoop) result.push("Coop LAN");
  if (hasOnlinePvp) result.push("JcJ en ligne");
  else if (hasPvp) result.push("JcJ");
  if (hasMmo) result.push("MMO");
  if (hasSolo) result.push("Solo");
  if (hasController) result.push("Compatible manette");
  if (hasVr) result.push("VR");

  return Array.from(new Set(result));
}

export function GameDetailsModal() {
  const target = useAppStore((s) => s.targetGameDetails);
  const close = useAppStore((s) => s.closeGameDetails);
  const openDirectDraft = useAppStore((s) => s.openDirectDraft);

  const [details, setDetails] = useState<FullGameDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setDetails(null);
      setActiveScreenshot(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchGameDetails({
      launcher: target.launcher,
      externalId: target.externalId,
      name: target.name,
    })
      .then((res) => {
        if (!cancelled) {
          setDetails(res);
          if (res?.screenshots && res.screenshots.length > 0) {
            setActiveScreenshot(res.screenshots[0]!);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) return null;

  const name = details?.name || target.name;
  const launcher = target.launcher.toUpperCase();
  const coverUrl = details?.coverUrl ?? target.coverUrl;
  const screenshots = details?.screenshots ?? [];
  const owners = target.owners ?? [];
  const installedOwners = owners.filter((o) => o.installed);

  const thumbnailsContainerRef = useRef<HTMLDivElement>(null);

  const activeIndex = screenshots.findIndex((s) => s === activeScreenshot);
  const currentScreenshotIdx = activeIndex >= 0 ? activeIndex : 0;

  function switchScreenshot(delta: number) {
    if (screenshots.length < 2) return;
    const nextIdx =
      (currentScreenshotIdx + delta + screenshots.length) % screenshots.length;
    const nextUrl = screenshots[nextIdx]!;
    setActiveScreenshot(nextUrl);

    // Faire défiler la miniature dans la vue
    const container = thumbnailsContainerRef.current;
    const thumb = container?.children[nextIdx] as HTMLElement | undefined;
    thumb?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        switchScreenshot(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        switchScreenshot(1);
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const usefulModes = useMemo(
    () => cleanCategories(details?.categories),
    [details?.categories],
  );
  const usefulGenres = useMemo(
    () => (details?.genres ?? []).slice(0, 5),
    [details?.genres],
  );

  function handleCreateEvening() {
    if (!target) return;
    openDirectDraft({
      appId: target.externalId,
      name,
      coverUrl: coverUrl ?? null,
      steamUrl: details?.steamUrl || `https://store.steampowered.com/app/${target.externalId}/`,
      priceLabel: details?.priceLabel ?? undefined,
    });
    close();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/85 p-4 sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col border-2 border-paper bg-ink shadow-press"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-details-title"
      >
        {/* Header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-rule-strong bg-ink-deep px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="pn-stamp inline-flex">{launcher}</span>
            <span className="pn-data font-data text-xs text-smoke">FICHE DU JEU</span>
          </div>
          <button
            type="button"
            className="pn-data text-smoke hover:text-paper"
            onClick={close}
          >
            Fermer ✕
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* Main Hero: Poster + Meta */}
          <div className="grid gap-6 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div className="w-[140px] shrink-0">
              <GamePoster
                name={name}
                launcher={target.launcher}
                externalId={target.externalId}
                coverUrl={coverUrl}
                priority
              />
            </div>

            <div className="min-w-0 flex flex-col justify-between gap-4">
              <div>
                <h2
                  id="game-details-title"
                  className="pn-display text-2xl sm:text-3xl text-paper"
                >
                  {name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-xs text-smoke">
                  {details?.developers && details.developers.length > 0 ? (
                    <span>Dev : <span className="text-paper">{details.developers.join(", ")}</span></span>
                  ) : null}
                  {details?.releaseDate ? (
                    <span>Sortie : <span className="text-paper">{details.releaseDate}</span></span>
                  ) : null}
                  {details?.priceLabel ? (
                    <span>Prix : <span className="text-paper font-bold">{details.priceLabel}</span></span>
                  ) : null}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {target.launcher === "steam" && (
                  <Button
                    variant="primary"
                    onClick={() => handleCreateEvening()}
                  >
                    Lancer une soirée avec ce jeu
                  </Button>
                )}
                {details?.steamUrl ? (
                  <Button
                    variant="second"
                    onClick={() => void openExternalUrl(details.steamUrl!)}
                  >
                    Page Store Steam ↗
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Group Possession / Installation context */}
          {owners.length > 0 ? (
            <section className="border border-rule-strong bg-ink-deep p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
                <p className="pn-data text-paper font-bold">Dans votre groupe</p>
                <p className="pn-data text-smoke">
                  <span className="text-paper font-bold">{pad2(owners.length)}</span> possèdent ·{" "}
                  <span className="text-paper font-bold">{pad2(installedOwners.length)}</span> installés
                </p>
              </div>

              <ul className="m-0 grid gap-2 sm:grid-cols-2 p-0 list-none">
                {owners.map((owner) => (
                  <li
                    key={owner.userId}
                    className="flex items-center justify-between gap-3 border border-rule px-3 py-2 bg-ink"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SquareAvatar
                        name={owner.displayName}
                        avatarUrl={owner.avatarUrl}
                        tone={owner.installed ? "active" : "idle"}
                      />
                      <span className="truncate font-ui text-xs font-bold uppercase text-paper">
                        {owner.displayName}
                      </span>
                    </div>
                    <span
                      className={
                        owner.installed
                          ? "font-data text-[10px] tracking-[0.1em] uppercase text-paper font-bold"
                          : "font-data text-[10px] tracking-[0.1em] uppercase text-smoke"
                      }
                    >
                      {owner.installed ? "✓ Installé" : "Possédé"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Categories / Genres Tags */}
          {(usefulModes.length > 0 || usefulGenres.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {usefulModes.map((cat) => (
                <span
                  key={cat}
                  className="border border-paper bg-ink-raise px-2.5 py-1 font-ui text-[11px] font-bold uppercase tracking-[0.1em] text-paper"
                >
                  {cat}
                </span>
              ))}
              {usefulGenres.map((genre) => (
                <span
                  key={genre}
                  className="border border-rule bg-ink-deep px-2.5 py-1 font-ui text-[11px] uppercase tracking-[0.1em] text-smoke"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* French Description / Summary */}
          {loading ? (
            <div className="border border-rule-strong p-6 text-center">
              <p className="pn-data mb-2">Chargement de la fiche en français…</p>
              <div className="pn-sync mx-auto w-24">
                <i />
              </div>
            </div>
          ) : details?.summary || details?.description ? (
            <section className="border border-rule-strong bg-ink-deep p-5 space-y-4">
              {details.summary ? (
                <div>
                  <h3 className="pn-data text-paper font-bold mb-2">En résumé</h3>
                  <p className="font-ui text-sm leading-relaxed text-paper">
                    {details.summary}
                  </p>
                </div>
              ) : null}

              {details.description && details.description !== details.summary ? (
                <div className="border-t border-rule pt-4">
                  <h3 className="pn-data text-paper font-bold mb-2">À propos du jeu</h3>
                  <p className="font-ui text-xs leading-relaxed text-paper-2 whitespace-pre-line max-h-60 overflow-y-auto pr-2">
                    {details.description}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Screenshots Gallery */}
          {screenshots.length > 0 ? (
            <section className="border border-rule-strong p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="pn-data font-bold text-paper">Captures d'écran</p>
                {screenshots.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-data text-xs text-smoke tabular-nums">
                      {pad2(currentScreenshotIdx + 1)} / {pad2(screenshots.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => switchScreenshot(-1)}
                      aria-label="Capture précédente"
                      title="Capture précédente (Flèche gauche)"
                      className="flex h-7 w-7 items-center justify-center border border-rule-strong bg-ink-deep font-data text-xs font-bold text-paper transition-all duration-90 hover:border-paper hover:bg-paper hover:text-ink-deep active:translate-x-[-1px] active:translate-y-[-1px]"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => switchScreenshot(1)}
                      aria-label="Capture suivante"
                      title="Capture suivante (Flèche droite)"
                      className="flex h-7 w-7 items-center justify-center border border-rule-strong bg-ink-deep font-data text-xs font-bold text-paper transition-all duration-90 hover:border-paper hover:bg-paper hover:text-ink-deep active:translate-x-[-1px] active:translate-y-[-1px]"
                    >
                      →
                    </button>
                  </div>
                ) : null}
              </div>

              {activeScreenshot ? (
                <div className="group relative aspect-video w-full overflow-hidden border border-rule-strong bg-ink-deep select-none">
                  <img
                    src={activeScreenshot}
                    alt={name}
                    className="h-full w-full object-cover"
                  />

                  {screenshots.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => switchScreenshot(-1)}
                        aria-label="Capture précédente"
                        className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center border border-paper bg-ink-deep/90 font-data text-base font-bold text-paper shadow-press transition-all duration-90 hover:bg-paper hover:text-ink-deep active:translate-x-[-1px] active:translate-y-[-1px] opacity-80 group-hover:opacity-100 cursor-pointer"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => switchScreenshot(1)}
                        aria-label="Capture suivante"
                        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center border border-paper bg-ink-deep/90 font-data text-base font-bold text-paper shadow-press transition-all duration-90 hover:bg-paper hover:text-ink-deep active:translate-x-[-1px] active:translate-y-[-1px] opacity-80 group-hover:opacity-100 cursor-pointer"
                      >
                        →
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {screenshots.length > 1 ? (
                <div
                  ref={thumbnailsContainerRef}
                  className="mt-3 flex gap-2 overflow-x-auto pb-2"
                >
                  {screenshots.map((s, index) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setActiveScreenshot(s)}
                      className={
                        activeScreenshot === s
                          ? "h-16 w-28 shrink-0 border-2 border-paper overflow-hidden"
                          : "h-16 w-28 shrink-0 border border-rule overflow-hidden opacity-60 hover:opacity-100 transition-opacity"
                      }
                    >
                      <img
                        src={s}
                        alt={`${name} capture ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t border-rule-strong bg-ink-deep px-6 py-3">
          <span className="pn-data text-smoke">
            {details?.steamUrl ? "Données fournies par le Store Steam (FR)" : "Fiche locale PlayNext"}
          </span>
          <Button variant="second" onClick={close}>
            Fermer
          </Button>
        </footer>
      </div>
    </div>
  );
}
