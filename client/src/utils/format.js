/**
 * Date, number and text formatting helpers.
 *
 * Recall scheduling makes relative time the primary way the UI talks about
 * dates ("due in 3h", "recalled 2 days ago"), so these are used almost
 * everywhere. `Intl` does the locale-sensitive work; the wrappers exist to give
 * the app one consistent voice.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Compact relative time: "just now", "5m ago", "in 3h", "2d ago".
 *
 * Both directions matter here — the same helper renders "recalled 2h ago" and
 * "due in 2h", and reading the sign off the tense is clearer than two functions.
 */
export function relativeTime(value, now = Date.now()) {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  const delta = date.getTime() - now;
  const magnitude = Math.abs(delta);
  const future = delta > 0;

  if (magnitude < 45 * 1000) {
    return future ? 'in a moment' : 'just now';
  }

  const render = (amount, unit) =>
    future ? `in ${amount}${unit}` : `${amount}${unit} ago`;

  if (magnitude < HOUR) {
    return render(Math.round(magnitude / MINUTE), 'm');
  }
  if (magnitude < DAY) {
    return render(Math.round(magnitude / HOUR), 'h');
  }
  if (magnitude < WEEK) {
    return render(Math.round(magnitude / DAY), 'd');
  }
  if (magnitude < 4 * WEEK) {
    return render(Math.round(magnitude / WEEK), 'w');
  }

  // Beyond a month, an absolute date is more informative than "7w ago".
  return shortDate(date);
}

/** "21 Jul 2026" — unambiguous across locales, unlike a numeric date. */
export function shortDate(value) {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

/** "21 Jul 2026, 14:30" */
export function dateTime(value) {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/**
 * How a drop's schedule reads on a card.
 * Overdue is called out explicitly — it is the state that needs action.
 */
export function recallStatus(nextRecallDate, now = Date.now()) {
  const date = toDate(nextRecallDate);

  if (!date) {
    return { label: 'Not scheduled', due: false, tone: 'muted' };
  }

  const delta = date.getTime() - now;

  if (delta <= 0) {
    const overdueBy = relativeTime(date, now);
    return {
      label: Math.abs(delta) < HOUR ? 'Due now' : `Overdue ${overdueBy}`,
      due: true,
      tone: 'due'
    };
  }

  return {
    label: `Due ${relativeTime(date, now)}`,
    due: false,
    tone: delta < 6 * HOUR ? 'soon' : 'scheduled'
  };
}

/** Thousands separators: 1234 -> "1,234". */
export function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('en-GB').format(parsed) : '0';
}

/** Correct singular/plural without a template at every call site. */
export function pluralize(count, singular, plural) {
  const word = count === 1 ? singular : plural || `${singular}s`;
  return `${number(count)} ${word}`;
}

/** Truncates on a word boundary so a preview never cuts mid-word. */
export function truncate(text, length = 80) {
  const value = String(text || '');

  if (value.length <= length) {
    return value;
  }

  const clipped = value.slice(0, length);
  const lastSpace = clipped.lastIndexOf(' ');

  return `${(lastSpace > length * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

/** Deterministic hue from a string — stable colours for tag chips. */
export function hashHue(value) {
  const text = String(value || '');
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    // Classic djb2-style mix; `| 0` keeps it in 32-bit integer range.
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }

  return Math.abs(hash) % 360;
}

/** Inline style for a tag chip, derived from the tag text itself. */
export function tagChipStyle(tag) {
  const hue = hashHue(tag);

  return {
    // Low-alpha fills work over both themes without two palettes.
    backgroundColor: `hsl(${hue} 70% 55% / 0.14)`,
    color: `hsl(${hue} 70% 42%)`,
    borderColor: `hsl(${hue} 70% 55% / 0.28)`
  };
}

/** Same hue, tuned for legibility on the dark surface. */
export function tagChipStyleDark(tag) {
  const hue = hashHue(tag);

  return {
    backgroundColor: `hsl(${hue} 70% 60% / 0.16)`,
    color: `hsl(${hue} 80% 76%)`,
    borderColor: `hsl(${hue} 70% 60% / 0.3)`
  };
}

/** Initials for the avatar bubble. */
export function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (!parts.length) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
