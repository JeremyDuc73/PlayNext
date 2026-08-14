import { useEffect, useState } from "react";
import { searchSteamStore, type SteamCatalogHit } from "../lib/steam";
import { GamePoster } from "./GamePoster";

type Props = {
  disabled?: boolean;
  onPick: (hit: SteamCatalogHit) => void;
};

export function SteamSearch({ disabled, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SteamCatalogHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setBusy(true);
      void searchSteamStore(term)
        .then((results) => {
          setHits(results);
          setError(null);
        })
        .catch((err: Error) => {
          setHits([]);
          setError(err.message);
        })
        .finally(() => setBusy(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="grid gap-3">
      <input
        className="w-full border border-rule-strong bg-ink-deep px-3 py-3 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-veto"
        placeholder="Nom du jeu"
        value={query}
        disabled={disabled}
        maxLength={80}
        onChange={(event) => setQuery(event.target.value)}
      />
      {busy ? <p className="pn-data">Recherche…</p> : null}
      {error ? <p className="pn-data text-veto">{error}</p> : null}
      {hits.length > 0 ? (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {hits.map((hit) => (
            <li key={hit.appId}>
              <button
                type="button"
                disabled={disabled}
                className="grid w-full grid-cols-[72px_minmax(0,1fr)] gap-3 border border-rule-strong p-2 text-left hover:bg-ink-raise"
                onClick={() => onPick(hit)}
              >
                <GamePoster
                  name={hit.name}
                  launcher="steam"
                  externalId={hit.appId}
                  coverUrl={hit.coverUrl}
                />
                <span className="min-w-0 self-center">
                  <span className="block truncate font-ui text-xs font-bold uppercase tracking-[0.08em] text-paper">
                    {hit.name}
                  </span>
                  <span className="pn-data mt-1 block">{hit.priceLabel}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
