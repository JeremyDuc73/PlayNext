import type { EveningKind, EveningStatus } from "./types.js";

/** Soirées visibles au calendrier du groupe. */
export function isOnGroupCalendar(input: {
  kind: EveningKind | string | null | undefined;
  status: EveningStatus | string;
}): boolean {
  if (input.status === "cancelled") return false;
  if (input.kind === "direct") {
    return (
      input.status === "lobby" ||
      input.status === "revealed" ||
      input.status === "closed"
    );
  }
  return (
    input.status === "voting" ||
    input.status === "revealed" ||
    input.status === "closed"
  );
}
