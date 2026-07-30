import { initials } from "../lib/format";
import clsx from "clsx";
import { useState } from "react";

type Props = {
  name: string;
  avatarUrl?: string | null;
  tone?: "active" | "idle" | "veto";
  className?: string;
  title?: string;
};

/** Carré DA — avatar Discord si dispo, sinon initiales. */
export function SquareAvatar({
  name,
  avatarUrl,
  tone = "active",
  className,
  title,
}: Props) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(avatarUrl) && !broken;

  return (
    <span
      className={clsx(
        "pn-initials overflow-hidden",
        tone === "idle" && "pn-initials-idle",
        tone === "veto" && "pn-initials-veto",
        className,
      )}
      title={title ?? name}
    >
      {showImg ? (
        <img
          src={avatarUrl!}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
