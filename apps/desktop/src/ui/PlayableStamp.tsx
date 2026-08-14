type Props = {
  disabled?: boolean;
  onPick: (playable: boolean) => void;
};

export function PlayableStamp({ disabled, onPick }: Props) {
  return (
    <div className="pn-stamp-pair" role="group" aria-label="Classement">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(true)}
      >
        Multi
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onPick(false)}
      >
        Solo
      </button>
    </div>
  );
}
