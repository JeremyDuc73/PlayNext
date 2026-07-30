import { useEffect, useRef, useState } from "react";
import { COVER_LOAD_TIMEOUT_MS } from "./covers";

/** Parcourt les candidats cover avec timeout. */
export function useCoverSrc(sources: string[]) {
  const [srcIndex, setSrcIndex] = useState(0);
  const [failed, setFailed] = useState(sources.length === 0);
  const [imgReady, setImgReady] = useState(false);
  const loadedRef = useRef(false);
  const sourcesKey = sources.join("\0");

  useEffect(() => {
    setSrcIndex(0);
    setFailed(sources.length === 0);
    setImgReady(false);
    loadedRef.current = false;
  }, [sourcesKey, sources.length]);

  const src = !failed ? sources[srcIndex] : undefined;

  useEffect(() => {
    if (!src) return;
    loadedRef.current = false;
    setImgReady(false);
    const t = window.setTimeout(() => {
      if (loadedRef.current) return;
      if (srcIndex + 1 < sources.length) setSrcIndex((i) => i + 1);
      else setFailed(true);
    }, COVER_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [src, srcIndex, sources.length]);

  return {
    src,
    failed,
    imgReady,
    onLoad: () => {
      loadedRef.current = true;
      setImgReady(true);
    },
    onError: () => {
      loadedRef.current = false;
      setImgReady(false);
      if (srcIndex + 1 < sources.length) setSrcIndex((i) => i + 1);
      else setFailed(true);
    },
  };
}
