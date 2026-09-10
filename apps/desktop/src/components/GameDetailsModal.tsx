import { useEffect, useState } from "react";
import { fetchGameDetails, type FullGameDetails } from "../lib/api";
import { openExternalUrl } from "../lib/desktop-auth";
import { pad2 } from "../lib/format";
import { useAppStore } from "../stores/useAppStore";
import { Button } from "../ui/Button";
import { GamePoster } from "../ui/GamePoster";
import { SquareAvatar } from "../ui/SquareAvatar";

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
          {((details?.categories && details.categories.length > 0) ||
            (details?.genres && details.genres.length > 0)) && (
            <div className="flex flex-wrap gap-2">
              {details?.categories?.map((cat) => (
                <span
                  key={cat}
                  className="border border-paper bg-ink-raise px-2.5 py-1 font-ui text-[11px] font-bold uppercase tracking-[0.1em] text-paper"
                >
                  {cat}
                </span>
              ))}
              {details?.genres?.map((genre) => (
                <span
                  key={genre}
                  className="border border-rule px-2.5 py-1 font-ui text-[11px] uppercase tracking-[0.1em] text-smoke"
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
              <p className="pn-data text-paper font-bold mb-3">Captures d'écran</p>
              {activeScreenshot ? (
                <div className="relative aspect-video w-full overflow-hidden border border-rule-strong bg-ink-deep">
                  <img
                    src={activeScreenshot}
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}

              {screenshots.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {screenshots.map((s, index) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setActiveScreenshot(s)}
                      className={
                        activeScreenshot === s
                          ? "h-16 w-28 shrink-0 border-2 border-paper overflow-hidden"
                          : "h-16 w-28 shrink-0 border border-rule overflow-hidden opacity-60 hover:opacity-100"
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
