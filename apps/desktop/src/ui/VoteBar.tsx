import { voteLabel, type VoteValue } from "../lib/evenings";

const OPTIONS: VoteValue[] = ["hot", "maybe", "pass", "veto"];

type Props = {
  value: VoteValue | null | undefined;
  vetoDisabled?: boolean;
  hideVeto?: boolean;
  disabled?: boolean;
  onChange: (value: VoteValue) => void;
};

export function VoteBar({
  value,
  vetoDisabled,
  hideVeto,
  disabled,
  onChange,
}: Props) {
  return (
    <div className="pn-ballot" role="group" aria-label="Bulletin">
      {OPTIONS.filter((option) => !(hideVeto && option === "veto")).map((option) => {
        const isVeto = option === "veto";
        const blocked = isVeto && vetoDisabled && value !== "veto";
        return (
          <button
            key={option}
            type="button"
            data-veto={isVeto ? "" : undefined}
            aria-pressed={value === option}
            disabled={disabled || blocked}
            onClick={() => onChange(option)}
          >
            {voteLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
