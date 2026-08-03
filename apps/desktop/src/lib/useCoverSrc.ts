import { useEffect, useRef, useState } from "react";
import { COVER_LOAD_TIMEOUT_MS } from "./covers";

/** Parcourt les candidats cover avec timeout. */
export function useCoverSrc(
  sources: string[],
  timeoutMs: number | null = COVER_LOAD_TIMEOUT_MS,
) {
  const [srcIndex, setSrcIndex] = useState(0);
  const [failed, setFailed] = useState(sources.length === 0);
  const [imgReady, setImgReady] = useState(false);
  const loadedRef = useRef(false);
  const loadedSrcRef = useRef<string | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const sourcesKey = sources.join("\0");

  useEffect(() => {
    const currentSources = sourcesRef.current;
    const loadedSrc = loadedSrcRef.current;
    const loadedIndex = loadedSrc ? currentSources.indexOf(loadedSrc) : -1;
    if (loadedIndex >= 0) {
      // Une nouvelle meta peut ajouter une URL en tête : on garde l’image
      // déjà affichée au lieu de provoquer un swap visuel.
      setSrcIndex(loadedIndex);
      setFailed(false);
      setImgReady(true);
      loadedRef.current = true;
      return;
    }

    setSrcIndex(0);
    setFailed(currentSources.length === 0);
    setImgReady(false);
    loadedRef.current = false;
    loadedSrcRef.current = null;
  }, [sourcesKey, sources.length]);

  const src = !failed ? sources[srcIndex] : undefined;

  useEffect(() => {
    if (!src) return;
    if (loadedSrcRef.current === src) {
      loadedRef.current = true;
      setImgReady(true);
      return;
    }
    if (timeoutMs == null) return;
    loadedRef.current = false;
    setImgReady(false);
    const t = window.setTimeout(() => {
      if (loadedRef.current) return;
      if (srcIndex + 1 < sources.length) setSrcIndex((i) => i + 1);
      else setFailed(true);
    }, timeoutMs);
    return () => window.clearTimeout(t);
  }, [src, srcIndex, sources.length, timeoutMs]);

  return {
    src,
    failed,
    imgReady,
    onLoad: () => {
      loadedRef.current = true;
      loadedSrcRef.current = src ?? null;
      setImgReady(true);
    },
    onError: () => {
      loadedRef.current = false;
      loadedSrcRef.current = null;
      setImgReady(false);
      if (srcIndex + 1 < sources.length) setSrcIndex((i) => i + 1);
      else setFailed(true);
    },
  };
}
