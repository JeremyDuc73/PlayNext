const PARIS = "Europe/Paris";

function tzOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    num("hour"),
    num("minute"),
    num("second"),
  );
  return asUtc - instant.getTime();
}

export function parisYmd(instant = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function parisShiftYmd(days: number, instant = new Date()): string {
  const utc = parisLocalToUtc(parisYmd(instant), "12:00");
  utc.setUTCDate(utc.getUTCDate() + days);
  return parisYmd(utc);
}

export function parisLocalToUtc(ymd: string, hm: string): Date {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const time = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!date || !time) {
    throw new Error("invalid_paris_datetime");
  }
  const year = Number(date[1]);
  const month = Number(date[2]);
  const day = Number(date[3]);
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = tzOffsetMs(PARIS, new Date(utcGuess));
  let instant = new Date(utcGuess - offset);
  const offset2 = tzOffsetMs(PARIS, instant);
  if (offset2 !== offset) {
    instant = new Date(utcGuess - offset2);
  }
  return instant;
}

export function formatParisShort(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} · ${time}`;
}

export function formatParisWhen(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} · ${time}`;
}

export type EveningWhenValue = {
  dayMode: "tonight" | "other";
  date: string;
  time: string;
};

export function defaultEveningWhen(): EveningWhenValue {
  return {
    dayMode: "tonight",
    date: parisShiftYmd(1),
    time: "21:00",
  };
}

export function eveningWhenToIso(value: EveningWhenValue): string {
  const ymd = value.dayMode === "tonight" ? parisYmd() : value.date;
  return parisLocalToUtc(ymd, value.time).toISOString();
}
