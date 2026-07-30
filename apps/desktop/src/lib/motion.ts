import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };

const EASE_SLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_STAMP = "cubic-bezier(0.2, 0.9, 0.1, 1)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Entrée liste — clip haut→bas, pas de translate qui casse la grille. */
export function staggerIn(
  targets: gsap.TweenTarget,
  opts?: { stagger?: number; duration?: number },
): gsap.core.Tween | null {
  if (prefersReducedMotion()) {
    gsap.set(targets, { clearProps: "all", opacity: 1, clipPath: "none" });
    return null;
  }
  return gsap.fromTo(
    targets,
    { opacity: 0, clipPath: "inset(0 0 100% 0)" },
    {
      opacity: 1,
      clipPath: "inset(0 0 0% 0)",
      duration: opts?.duration ?? 0.28,
      stagger: opts?.stagger ?? 0.06,
      ease: EASE_SLIDE,
      overwrite: "auto",
      onComplete: () => {
        gsap.set(targets, { clearProps: "clipPath" });
      },
    },
  );
}

/** Coupe de vue (onglets). */
export function viewSwap(el: HTMLElement | null): gsap.core.Tween | null {
  if (!el) return null;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "all", opacity: 1 });
    return null;
  }
  return gsap.fromTo(
    el,
    { opacity: 0, clipPath: "inset(0 0 35% 0)" },
    {
      opacity: 1,
      clipPath: "inset(0 0 0% 0)",
      duration: 0.36,
      ease: EASE_SLIDE,
      onComplete: () => {
        gsap.set(el, { clearProps: "clipPath" });
      },
    },
  );
}

/** Tampon veto / ouverture fiche. */
export function stampIn(el: HTMLElement | null): gsap.core.Tween | null {
  if (!el) return null;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "all", opacity: 1, scale: 1 });
    return null;
  }
  return gsap.fromTo(
    el,
    { opacity: 0, scale: 1.12 },
    {
      opacity: 1,
      scale: 1,
      duration: 0.11,
      ease: EASE_STAMP,
      onComplete: () => {
        gsap.set(el, { clearProps: "transform" });
      },
    },
  );
}
