import { useMemo, type ReactNode } from "react";
import clsx from "clsx";
import { coverCandidates, fallbackPosterStyle } from "../lib/covers";
import { useCoverSrc } from "../lib/useCoverSrc";

type Props = {
  name: string;
  launcher: string;
  externalId: string;
  coverUrl?: string | null;
  fallbackUrls?: string[];
  subtitle?: string;
  selected?: boolean;
  vetoed?: boolean;
  vetoBy?: string;
  index?: string;
  onClick?: () => void;
  footer?: ReactNode;
  wide?: boolean;
};

export function GamePoster({
  name,
  launcher,
  externalId,
  coverUrl,
  fallbackUrls,
  subtitle,
  selected,
  vetoed,
  vetoBy,
  index,
  onClick,
  footer,
  wide,
}: Props) {
  const sources = useMemo(
    () =>
      coverCandidates({
        coverUrl,
        launcher,
        externalId,
        fallbackUrls,
      }),
    [coverUrl, launcher, externalId, fallbackUrls],
  );
  const { src, failed, onLoad, onError } = useCoverSrc(sources);
  const fallback = fallbackPosterStyle(name);

  const art = (
    <div
      className={clsx(
        "pn-cover",
        wide && "pn-cover-wide",
        selected && "pn-cover-held",
        vetoed && "pn-cover-veto",
      )}
      style={failed || !src ? { background: fallback.background } : undefined}
    >
      {index ? (
        <span className="absolute left-2 top-2 z-10 font-data text-[11px] tracking-[0.14em] text-paper">
          {index}
        </span>
      ) : null}
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
          onError={onError}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center pn-display text-4xl text-smoke-dim">
          {fallback.initial}
        </span>
      )}
      {vetoed ? <span className="pn-veto-stamp">VETO</span> : null}
    </div>
  );

  return (
    <div className="pn-poster-cell grid gap-2">
      {onClick ? (
        <button
          type="button"
          className="block w-full min-w-0 border-0 bg-transparent p-0 text-left"
          onClick={onClick}
        >
          {art}
        </button>
      ) : (
        art
      )}
      <div className="min-w-0 border-t border-rule pt-2">
        <p className="truncate font-ui text-xs font-bold uppercase tracking-[0.08em] text-paper">
          {name}
        </p>
        {subtitle || vetoBy ? (
          <p
            className={clsx(
              "mt-1 font-data text-[10px] tracking-[0.12em] uppercase",
              vetoBy ? "text-veto" : "text-smoke",
            )}
          >
            {vetoBy ? vetoBy : subtitle}
          </p>
        ) : null}
        {footer}
      </div>
    </div>
  );
}
