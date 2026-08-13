export type DiscordNotice =
  | { kind: "lobby"; playerCount: number }
  | { kind: "chosen"; gameName: string };

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export function formatDiscordNotice(
  groupName: string,
  notice: DiscordNotice,
): string {
  if (notice.kind === "lobby") {
    return [
      "LOBBY",
      groupName,
      `Soirée ouverte · ${pad2(notice.playerCount)} joueurs`,
    ].join("\n");
  }
  return ["ON JOUE ÇA", notice.gameName, groupName].join("\n");
}
