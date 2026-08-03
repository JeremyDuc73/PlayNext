type Props = {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
};

export function Checkbox({ checked, label, disabled, onChange }: Props) {
  return (
    <label className="pn-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="pn-check-box" aria-hidden="true">
        {checked ? "×" : ""}
      </span>
      <span>{label}</span>
    </label>
  );
}
