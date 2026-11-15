// Number and time formatting for operator displays (operational-ui-standards D-5, TM-2, TM-3).

const MINUS = "−";

/**
 * Fixed decimals, true minus sign, and thousands separators only for five or more integer
 * digits (12,500 but 4500). `sign` adds "+" where the sign matters to the task.
 */
export function formatNumber(value: number, decimals = 0, sign = false) {
  const rounded = Number(value.toFixed(decimals));
  const negative = rounded < 0 || Object.is(rounded, -0);
  const [whole, fraction] = Math.abs(rounded).toFixed(decimals).split(".");
  const grouped = whole.length >= 5 ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  const text = fraction ? `${grouped}.${fraction}` : grouped;
  if (negative && rounded !== 0) return `${MINUS}${text}`;
  return sign && rounded > 0 ? `+${text}` : text;
}

/** hh:mm:ss, 24-hour style, with a day field only when the duration spans days. */
export function formatDuration(seconds: number, sign = false) {
  const negative = seconds < 0;
  let s = Math.floor(Math.abs(seconds));
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((part) =>
    String(part).padStart(2, "0"),
  );
  const body = `${days > 0 ? `${days}/` : ""}${parts.join(":")}`;
  if (negative) return `${MINUS}${body}`;
  return sign ? `+${body}` : body;
}

/** UTC timestamp as YYYY-MM-DD hh:mm:ss. */
export function formatUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export const gramsToKg = (grams: number) => grams / 1000;

/** Human age of a value for stale markers (D-1), e.g. "12 s", "4 m". */
export function formatAge(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} m`;
  return `${Math.floor(seconds / 3600)} h`;
}
