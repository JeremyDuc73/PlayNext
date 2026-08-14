import type { ProposalReplyValue } from "../lib/proposals";
import { proposalReplyLabel } from "../lib/proposals";

const OPTIONS: ProposalReplyValue[] = ["hot", "no"];

type Props = {
  value: ProposalReplyValue | null;
  disabled?: boolean;
  onChange: (value: ProposalReplyValue) => void;
};

export function ProposalBallot({ value, disabled, onChange }: Props) {
  return (
    <div className="pn-ballot" role="group" aria-label="Réponse">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
        >
          {proposalReplyLabel(option)}
        </button>
      ))}
    </div>
  );
}
