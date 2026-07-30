import { SquareAvatar } from "./SquareAvatar";

type Person = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

type Props = {
  people: Person[];
  max?: number;
};

/** Avatars Discord carrés — pas de rond (DA BULLETIN). */
export function AvatarStack({ people, max = 6 }: Props) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <ul
      className="m-0 flex list-none items-center gap-1 p-0"
      aria-label={`${people.length} personnes`}
    >
      {shown.map((person) => (
        <li key={person.id}>
          <SquareAvatar
            name={person.displayName}
            avatarUrl={person.avatarUrl}
          />
        </li>
      ))}
      {extra > 0 ? (
        <li className="pn-initials pn-initials-idle">+{extra}</li>
      ) : null}
    </ul>
  );
}
