import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../lib/motion";

type Props = {
  onComplete: () => void;
};

export function AppBootSplash({ onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const accentRef = useRef<HTMLSpanElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const syncRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const completedRef = useRef(false);

  function finish() {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }

  useEffect(() => {
    if (prefersReducedMotion()) {
      finish();
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: finish,
      });

      // 1. Positionnement initial
      gsap.set(containerRef.current, { opacity: 1 });
      gsap.set(markRef.current, { scale: 1.28, opacity: 0 });
      gsap.set(titleRef.current, { clipPath: "inset(0 100% 0 0)", opacity: 1 });
      gsap.set(accentRef.current, { scaleX: 0, transformOrigin: "left" });
      gsap.set(subtitleRef.current, { opacity: 0, y: 4 });
      gsap.set(syncRef.current, { opacity: 0 });
      gsap.set(statusRef.current, { opacity: 0 });

      // 2. Tamponnage sec du BrandMark (120ms)
      tl.to(markRef.current, {
        scale: 1,
        opacity: 1,
        duration: 0.18,
        ease: "cubic-bezier(0.2, 0.9, 0.1, 1)",
      })
      // 3. Dévoilement architectural de PLAYNEXT au clip-path
      .to(
        titleRef.current,
        {
          clipPath: "inset(0 0% 0 0)",
          duration: 0.3,
          ease: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
        "-=0.06",
      )
      // 4. Trait vermillon signature
      .to(
        accentRef.current,
        {
          scaleX: 1,
          duration: 0.16,
          ease: "power2.out",
        },
        "-=0.12",
      )
      // 5. Signature « Ce soir, on décide. »
      .to(
        subtitleRef.current,
        {
          opacity: 1,
          y: 0,
          duration: 0.18,
          ease: "power2.out",
        },
        "-=0.08",
      )
      // 6. Jauge de sync et statut technique
      .to([syncRef.current, statusRef.current], {
        opacity: 1,
        duration: 0.14,
      })
      // 7. Pause brève (~380ms)
      .to({}, { duration: 0.38 })
      // 8. Coupe de sortie nette découvrant l'application
      .to(containerRef.current, {
        clipPath: "inset(0 0 100% 0)",
        duration: 0.28,
        ease: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    }, containerRef);

    function onKey() {
      finish();
    }
    window.addEventListener("keydown", onKey, { once: true });

    return () => {
      window.removeEventListener("keydown", onKey);
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      role="presentation"
      onClick={finish}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-deep p-6 select-none cursor-pointer"
      style={{
        clipPath: "inset(0 0 0% 0)",
      }}
    >
      <div className="w-full max-w-md border-2 border-paper bg-ink p-8 shadow-press">
        {/* En-tête officiel */}
        <div className="mb-6 flex items-center justify-between border-b border-rule-strong pb-3">
          <div className="flex items-center gap-2">
            <span className="pn-stamp">PROTOCOLE</span>
            <span className="pn-data text-smoke">SYSTÈME PRÊT</span>
          </div>
          <span className="pn-data text-smoke-dim hover:text-paper">Cliquer pour passer ✕</span>
        </div>

        {/* BrandMark & Logotype */}
        <div className="flex items-center gap-5">
          <div ref={markRef} className="shrink-0 border border-paper p-1 bg-ink-deep shadow-press">
            <img src="/playnext.svg" alt="PlayNext" className="h-12 w-12 block" />
          </div>

          <div className="min-w-0">
            <h1
              ref={titleRef}
              className="font-display text-4xl uppercase tracking-[-0.035em] text-paper leading-none"
            >
              PLAYNEXT
            </h1>
            <span
              ref={accentRef}
              className="mt-2 block h-[3px] w-12 bg-veto"
            />
          </div>
        </div>

        {/* Signature */}
        <p
          ref={subtitleRef}
          className="mt-6 font-data text-xs tracking-[0.16em] uppercase text-paper font-bold"
        >
          « Ce soir, on décide. »
        </p>

        {/* Barre de synchro */}
        <div className="mt-7 border-t border-rule pt-4">
          <div className="flex items-center justify-between mb-2">
            <p ref={statusRef} className="pn-data text-[10px]">
              Initialisation du protocole de vote…
            </p>
            <span className="pn-data text-[10px]">100%</span>
          </div>
          <div ref={syncRef} className="pn-sync w-full" aria-hidden>
            <i />
          </div>
        </div>
      </div>
    </div>
  );
}
