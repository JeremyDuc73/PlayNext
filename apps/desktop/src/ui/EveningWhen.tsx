import { pad2 } from "../lib/format";
import { parisShiftYmd, type EveningWhenValue } from "../lib/paris";

const HOURS = Array.from({ length: 24 }, (_, index) => pad2(index));
const MINUTES = Array.from({ length: 12 }, (_, index) => pad2(index * 5));

type Props = {
  value: EveningWhenValue;
  onChange: (value: EveningWhenValue) => void;
};

export function EveningWhenField({ value, onChange }: Props) {
  const [hour, minute] = value.time.split(":");

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap border border-rule-strong">
        {(
          [
            ["tonight", "Ce soir"],
            ["other", "Autre jour"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={
              value.dayMode === mode
                ? "bg-paper px-3 py-2.5 font-ui text-xs font-bold uppercase tracking-[0.12em] text-ink-deep"
                : "border-r border-rule-strong px-3 py-2.5 font-ui text-xs font-bold uppercase tracking-[0.12em] text-smoke last:border-r-0"
            }
            onClick={() => onChange({ ...value, dayMode: mode })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {value.dayMode === "other" ? (
          <input
            type="date"
            className="border border-rule-strong bg-ink-deep px-3 py-2.5 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-veto"
            value={value.date}
            min={parisShiftYmd(1)}
            onChange={(event) =>
              onChange({ ...value, date: event.target.value })
            }
          />
        ) : null}
        <select
          className="border border-rule-strong bg-ink-deep px-3 py-2.5 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-veto"
          aria-label="Heure"
          value={hour ?? "21"}
          onChange={(event) =>
            onChange({
              ...value,
              time: `${event.target.value}:${minute ?? "00"}`,
            })
          }
        >
          {HOURS.map((item) => (
            <option key={item} value={item}>
              {item} h
            </option>
          ))}
        </select>
        <select
          className="border border-rule-strong bg-ink-deep px-3 py-2.5 font-data text-xs tracking-[0.1em] uppercase outline-none focus:border-veto"
          aria-label="Minutes"
          value={minute ?? "00"}
          onChange={(event) =>
            onChange({
              ...value,
              time: `${hour ?? "21"}:${event.target.value}`,
            })
          }
        >
          {MINUTES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
