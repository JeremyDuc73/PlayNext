import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export type Variant = "primary" | "second" | "ghost" | "veto";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANT: Record<Variant, string> = {
  primary: "pn-btn",
  second: "pn-btn-second",
  ghost: "pn-btn-ghost",
  veto: "pn-btn-veto",
};

export function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button type={type} className={clsx(VARIANT[variant], className)} {...rest}>
      {children}
    </button>
  );
}
