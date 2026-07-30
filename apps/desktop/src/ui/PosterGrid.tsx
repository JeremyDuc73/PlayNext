import { useRef, type ReactNode } from "react";
import clsx from "clsx";
import { staggerIn, useGSAP } from "../lib/motion";

type Props = {
  label: string;
  children: ReactNode;
  density?: "comfortable" | "compact";
  /** Relance l'entrée quand la liste change (filtre, sync…). */
  animateKey?: string | number;
};

export function PosterGrid({
  label,
  children,
  density = "comfortable",
  animateKey,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const cells = rootRef.current?.querySelectorAll(".pn-poster-cell");
      if (cells?.length) staggerIn(cells, { stagger: 0.05, duration: 0.26 });
    },
    { scope: rootRef, dependencies: [animateKey] },
  );

  return (
    <div
      ref={rootRef}
      role="list"
      aria-label={label}
      className={clsx(
        "grid gap-x-3 gap-y-5",
        density === "compact"
          ? "grid-cols-[repeat(auto-fill,minmax(104px,1fr))]"
          : "grid-cols-[repeat(auto-fill,minmax(128px,1fr))]",
      )}
    >
      {children}
    </div>
  );
}
