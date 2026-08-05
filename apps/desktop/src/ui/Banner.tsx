import type { ReactNode } from "react";
import clsx from "clsx";

type Props = {
  children: ReactNode;
  tone?: "info" | "veto";
  stamp?: string;
  onDismiss?: () => void;
};

export function Banner({
  children,
  tone = "info",
  stamp,
  onDismiss,
}: Props) {
  return (
    <div
      className={clsx(
        "flex items-stretch border border-rule-strong",
        tone === "veto" && "border-veto",
      )}
      role="status"
    >
      <span
        className={clsx(
          "pn-stamp flex items-center",
          tone === "veto" && "bg-veto text-ink-deep",
        )}
      >
        {stamp ?? (tone === "veto" ? "VETO" : "INFO")}
      </span>
      <p className="px-3.5 py-2.5 font-data text-[11px] tracking-[0.1em] text-paper uppercase">
        {children}
      </p>
      {onDismiss ? (
        <button
          type="button"
          className="ml-auto border-l border-rule-strong px-3 font-ui text-[10px] font-bold uppercase tracking-[0.14em] text-smoke hover:bg-ink-raise hover:text-paper"
          onClick={onDismiss}
          aria-label="Fermer la notification"
        >
          Fermer
        </button>
      ) : null}
    </div>
  );
}
