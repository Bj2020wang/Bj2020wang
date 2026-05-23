import { formatDateKey } from './calendar-utils';

export interface ParsedResult {
  title: string;
  dateKey?: string;
  time?: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7,
};

type TimeContext = {
  hour: number;
  adjust: boolean;
};

const TIME_CONTEXT_MAP: Record<string, TimeContext> = {
  '凌晨': { hour: 5, adjust: false },
  '清晨': { hour: 5, adjust: false },
  '早上': { hour: 8, adjust: false },
  '早晨': { hour: 8, adjust: false },
  '上午': { hour: 9, adjust: false },
  '中午': { hour: 12, adjust: false },
  '午间': { hour: 12, adjust: false },
  '下午': { hour: 15, adjust: true },
  '午后': { hour: 15, adjust: true },
  '晚上': { hour: 20, adjust: true },
  '晚间': { hour: 20, adjust: true },
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateFromToday(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return formatDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function thisWeekday(targetDay: number): string {
  const today = new Date();
  const isoDow = today.getDay() || 7;
  const target = new Date(today);
  target.setDate(today.getDate() - (isoDow - 1) + (targetDay - 1));
  return formatDateKey(target.getFullYear(), target.getMonth() + 1, target.getDate());
}

function nextWeekday(targetDay: number): string {
  const today = new Date();
  const isoDow = today.getDay() || 7;
  const target = new Date(today);
  target.setDate(today.getDate() - (isoDow - 1) + 7 + (targetDay - 1));
  return formatDateKey(target.getFullYear(), target.getMonth() + 1, target.getDate());
}

function monthDay(month: number, day: number): string | null {
  const today = new Date();
  const date = new Date(today.getFullYear(), month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  if (date.getTime() < today.getTime()) {
    date.setFullYear(date.getFullYear() + 1);
  }
  return formatDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * 从中文自然语言输入中解析日期和时间。
 * 支持的模式：今天/明天/后天/大后天、周X/下周一X、X月X日、
 * 凌晨/早上/上午/中午/下午/晚上、X点/X点半/X点X分、HH:MM。
 *
 * 仅当解析出日期或时间时才返回结果，否则返回 null（纯文本标题）。
 */
export function parseNaturalDate(input: string): ParsedResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let remaining = trimmed;
  let dateKey: string | undefined;
  let timeStr: string | undefined;
  let timeContext: TimeContext | undefined;

  // ── Phase 1: Combined date+time keywords ──
  const combinedMatch = remaining.match(/^(今早|明早|今晚|明晚)/);
  if (combinedMatch) {
    const kw = combinedMatch[1];
    remaining = remaining.slice(kw.length).trim();
    switch (kw) {
      case '今早':
        dateKey = dateFromToday(0);
        timeContext = TIME_CONTEXT_MAP['早上'];
        break;
      case '明早':
        dateKey = dateFromToday(1);
        timeContext = TIME_CONTEXT_MAP['早上'];
        break;
      case '今晚':
        dateKey = dateFromToday(0);
        timeContext = TIME_CONTEXT_MAP['晚上'];
        break;
      case '明晚':
        dateKey = dateFromToday(1);
        timeContext = TIME_CONTEXT_MAP['晚上'];
        break;
    }
  }

  // ── Phase 2: Date patterns (ordered by specificity) ──
  if (!dateKey) {
    const dateRules: { pattern: RegExp; compute: (m: RegExpMatchArray) => string | null }[] = [
      { pattern: /大后天/, compute: () => dateFromToday(3) },
      { pattern: /后天/,   compute: () => dateFromToday(2) },
      { pattern: /明天|明日/, compute: () => dateFromToday(1) },
      { pattern: /今天|今日/, compute: () => dateFromToday(0) },
      {
        pattern: /下(?:周|星期|礼拜)([一二三四五六日天])/,
        compute: (m) => {
          const d = WEEKDAY_MAP[m[1]];
          return d ? nextWeekday(d) : null;
        },
      },
      {
        pattern: /(?:周|星期|礼拜)([一二三四五六日天])/,
        compute: (m) => {
          const d = WEEKDAY_MAP[m[1]];
          return d ? thisWeekday(d) : null;
        },
      },
      {
        pattern: /(\d{1,2})月(\d{1,2})[日号]/,
        compute: (m) => monthDay(Number(m[1]), Number(m[2])),
      },
    ];

    for (const rule of dateRules) {
      const match = remaining.match(rule.pattern);
      if (match) {
        const dk = rule.compute(match);
        if (dk) {
          dateKey = dk;
          remaining = (remaining.slice(0, match.index!) + remaining.slice(match.index! + match[0].length)).trim();
          break;
        }
      }
    }
  }

  // ── Phase 3: Time patterns ──
  // 3a: Time-of-day context words
  const ctxMatch = remaining.match(/(凌晨|清晨|早上|早晨|上午|中午|午间|下午|午后|晚上|晚间)/);
  if (ctxMatch) {
    timeContext = TIME_CONTEXT_MAP[ctxMatch[1]];
    remaining = (remaining.slice(0, ctxMatch.index!) + remaining.slice(ctxMatch.index! + ctxMatch[0].length)).trim();
  }

  // 3b: Specific time expressions
  const specificPatterns: { pattern: RegExp; parse: (m: RegExpMatchArray) => { h: number; m: number } | null }[] = [
    {
      pattern: /(\d{1,2}):(\d{2})/,
      parse: (m) => {
        const h = Number(m[1]), min = Number(m[2]);
        return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? { h, m: min } : null;
      },
    },
    {
      pattern: /(\d{1,2})点(\d{1,2})分/,
      parse: (m) => {
        const h = Number(m[1]), min = Number(m[2]);
        return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? { h, m: min } : null;
      },
    },
    {
      pattern: /(\d{1,2})点半/,
      parse: (m) => {
        const h = Number(m[1]);
        return h >= 0 && h <= 23 ? { h, m: 30 } : null;
      },
    },
    {
      pattern: /(\d{1,2})点(?!半|分)/,
      parse: (m) => {
        const h = Number(m[1]);
        return h >= 0 && h <= 23 ? { h, m: 0 } : null;
      },
    },
  ];

  for (const spec of specificPatterns) {
    const match = remaining.match(spec.pattern);
    if (match) {
      const parsed = spec.parse(match);
      if (parsed) {
        let h = parsed.h;
        if (timeContext?.adjust && h < 12) h += 12;
        timeStr = `${pad2(h)}:${pad2(parsed.m)}`;
        remaining = (remaining.slice(0, match.index!) + remaining.slice(match.index! + match[0].length)).trim();
        break;
      }
    }
  }

  // 3c: Only time-of-day context (no specific hour) — use default
  if (!timeStr && timeContext) {
    timeStr = `${pad2(timeContext.hour)}:00`;
  }

  // ── Phase 4: Title ──
  const title = remaining.trim() || trimmed;

  return dateKey || timeStr ? { title, dateKey, time: timeStr } : null;
}
