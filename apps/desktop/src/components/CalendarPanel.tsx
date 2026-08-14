import { useEffect, useMemo, useState } from "react";
import {
  eveningDisplayTitle,
  isLiveEveningStatus,
  listCalendarEvenings,
  type EveningKind,
  type EveningStatus,
  type EveningSummary,
} from "../lib/evenings";
import { pad2 } from "../lib/format";
import {
  formatParisMonthTitle,
  parisMonthCells,
  parisYmd,
  parisYearMonth,
  shiftYearMonth,
} from "../lib/paris";
import { Button } from "../ui/Button";
import { EmptyHint } from "../ui/EmptyHint";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

type Props = {
  groupId: string;
  groupName: string;
  onBanner: (message: string) => void;
  onOpenEvening?: (eveningId: string) => void;
};

function calendarGame(item: EveningSummary): string {
  return (
    item.winnerName?.trim() ||
    item.gameName?.trim() ||
    eveningDisplayTitle(item.title, item.createdAt, item.scheduledAt)
  );
}

function calendarStatus(kind: EveningKind, status: EveningStatus): string {
  if (status === "voting") return "Vote";
  if (status === "revealed") return "Résultat";
  if (status === "closed") return "Terminée";
  if (kind === "direct") return "Direct";
  return "—";
}

function parisHm(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function CalendarPanel({
  groupId,
  groupName,
  onBanner,
  onOpenEvening,
}: Props) {
  const today = parisYmd();
  const initial = parisYearMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [selectedYmd, setSelectedYmd] = useState(today);
  const [evenings, setEvenings] = useState<EveningSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    function load() {
      void listCalendarEvenings(groupId)
        .then((list) => {
          if (!cancelled) setEvenings(list);
        })
        .catch((error: Error) => {
          if (!cancelled) onBanner(error.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const cells = useMemo(() => parisMonthCells(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, EveningSummary[]>();
    for (const item of evenings) {
      const ymd = parisYmd(new Date(item.scheduledAt ?? item.createdAt));
      const list = map.get(ymd) ?? [];
      list.push(item);
      map.set(ymd, list);
    }
    return map;
  }, [evenings]);

  useEffect(() => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    setSelectedYmd((current) => {
      if (current.startsWith(prefix)) return current;
      const todayYmd = parisYmd();
      if (todayYmd.startsWith(prefix)) return todayYmd;
      const firstEvent = cells.find(
        (cell) => cell.inMonth && (byDay.get(cell.ymd)?.length ?? 0) > 0,
      );
      return (
        firstEvent?.ymd ??
        cells.find((cell) => cell.inMonth)?.ymd ??
        current
      );
    });
  }, [year, month, cells, byDay]);

  const selected = byDay.get(selectedYmd) ?? [];
  const monthTitle = formatParisMonthTitle(year, month);

  function go(delta: number) {
    const next = shiftYearMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule-strong pb-4">
        <div>
          <p className="pn-data mb-2">{groupName}</p>
          <h2 className="pn-display text-[clamp(2rem,4vw,3.5rem)]">
            Calendrier
          </h2>
          <span className="pn-accent mt-3" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => go(-1)}>
            Précédent
          </Button>
          <p className="pn-display text-2xl">{monthTitle}</p>
          <Button variant="ghost" onClick={() => go(1)}>
            Suivant
          </Button>
        </div>
      </header>

      {loading && evenings.length === 0 ? (
        <p className="pn-data">Chargement…</p>
      ) : null}

      <div className="border border-rule-strong">
        <div className="grid grid-cols-7 border-b border-rule-strong">
          {WEEKDAYS.map((label, index) => (
            <p
              key={`${label}-${index}`}
              className="border-r border-rule px-2 py-2 pn-data text-center text-paper last:border-r-0"
            >
              {label}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const items = byDay.get(cell.ymd) ?? [];
            const has = items.length > 0;
            const selectedDay = cell.ymd === selectedYmd;
            const isToday = cell.ymd === today;
            return (
              <button
                key={cell.ymd}
                type="button"
                disabled={!cell.inMonth}
                onClick={() => {
                  if (cell.inMonth) setSelectedYmd(cell.ymd);
                }}
                className={
                  selectedDay
                    ? "min-h-[4.5rem] border-b border-r border-rule bg-paper px-2 py-2 text-left text-ink-deep [&:nth-child(7n)]:border-r-0"
                    : isToday
                      ? "min-h-[4.5rem] border-b border-r border-paper bg-ink-raise px-2 py-2 text-left [&:nth-child(7n)]:border-r-0"
                      : "min-h-[4.5rem] border-b border-r border-rule px-2 py-2 text-left hover:bg-ink-raise disabled:hover:bg-transparent [&:nth-child(7n)]:border-r-0"
                }
              >
                <span
                  className={
                    cell.inMonth
                      ? selectedDay
                        ? "font-data text-[11px] tracking-[0.14em] text-ink-deep"
                        : "pn-data text-paper"
                      : "pn-data text-smoke-dim"
                  }
                >
                  {pad2(cell.day)}
                </span>
                {cell.inMonth && has ? (
                  <span
                    className={
                      selectedDay
                        ? "mt-2 block truncate font-data text-[10px] tracking-[0.12em] uppercase text-ink-deep"
                        : "mt-2 block truncate font-data text-[10px] tracking-[0.12em] uppercase text-paper-2"
                    }
                  >
                    {pad2(items.length)}
                    {" · "}
                    {calendarGame(items[0]!)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selected.length === 0 ? (
        <EmptyHint
          title="Rien ce jour"
          body="Vote en cours, soirée confirmée, ou soirée directe."
        />
      ) : (
        <ul className="m-0 list-none border border-rule-strong p-0">
          {selected.map((item) => {
            const live = isLiveEveningStatus(item.status);
            return (
              <li
                key={item.id}
                className="grid grid-cols-[auto_minmax(0,1.4fr)_auto_auto] items-center gap-4 border-b border-rule px-4 py-3 last:border-b-0"
              >
                <span className="font-data text-[10px] tracking-[0.12em] text-smoke-dim">
                  {parisHm(item.scheduledAt)}
                </span>
                <span className="min-w-0 truncate font-ui text-sm font-bold uppercase tracking-[0.08em] text-paper">
                  {calendarGame(item)}
                </span>
                <span className="pn-data uppercase">
                  {calendarStatus(item.kind, item.status)}
                </span>
                {live && onOpenEvening ? (
                  <button
                    type="button"
                    className="pn-data hover:text-paper"
                    onClick={() => onOpenEvening(item.id)}
                  >
                    Ouvrir
                  </button>
                ) : (
                  <span className="pn-data">—</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
