export type LobbyParticipant = {
  userId: string;
  present: boolean;
  readyAt: Date | string | null;
};

export function isReady(readyAt: Date | string | null | undefined): boolean {
  return readyAt != null;
}

/** Tous les présents ont tamponné prêt — le Lobby peut passer en sélection. */
export function lobbyCanAdvance(participants: LobbyParticipant[]): boolean {
  const present = participants.filter((participant) => participant.present);
  return (
    present.length > 0 && present.every((participant) => isReady(participant.readyAt))
  );
}

/** Présents sans tampon, hors organisateur (qui sera marqué prêt au lancement). */
export function lobbyDropUserIds(
  participants: LobbyParticipant[],
  organizerId: string,
): string[] {
  return participants
    .filter(
      (participant) =>
        participant.present &&
        !isReady(participant.readyAt) &&
        participant.userId !== organizerId,
    )
    .map((participant) => participant.userId);
}
