import type { ReactNode } from "react";
import clsx from "clsx";

type Props = {
  children: ReactNode;
  tone?: "info" | "veto";
  stamp?: string;
};

export function Banner({ children, tone = "info", stamp }: Props) {
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
    </div>
  );
}
