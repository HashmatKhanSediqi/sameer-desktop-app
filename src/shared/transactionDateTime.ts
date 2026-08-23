const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_CLOCK =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar date/time as a sortable SQLite TEXT value. */
export function toSqliteDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function nowSqliteDateTime(now = new Date()): string {
  return toSqliteDateTime(now);
}

/**
 * Convert a stored SQLite datetime (or ISO string) into a `datetime-local` value.
 * Keeps the wall-clock time so the edit field matches what the user originally saved.
 */
export function toDateTimeLocalValue(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  const withTime = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (withTime?.[1] && withTime[2] && withTime[3]) {
    return `${withTime[1]}T${withTime[2]}:${withTime[3]}`;
  }

  const dateOnly = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly?.[1]) {
    return `${dateOnly[1]}T00:00`;
  }

  const parsed = new Date(trimmed.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}T${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
}

export function wallClockToSqlite(year: number, month: number, day: number, hour: number, minute: number, second: number): string | null {
  const probe = new Date(year, month - 1, day, hour, minute, second);
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

export function sqliteFromDateOnly(value: string): string | null {
  const match = DATE_ONLY.exec(value);
  if (!match) {
    return null;
  }
  return wallClockToSqlite(Number(match[1]), Number(match[2]), Number(match[3]), 0, 0, 0);
}

export function sqliteFromWallClockString(value: string): string | null {
  const match = WALL_CLOCK.exec(value);
  if (!match) {
    return null;
  }
  return wallClockToSqlite(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? '0'),
  );
}
