// stats.js — өдрийн төлөв ба хураангуй тооцоо. ЦЭВЭР УНШИХ давхарга:
// program.js + storage.js-ээс уншина, DOM-д хүрэхгүй, юу ч бичихгүй.
//
// Гурван дэлгэц (өнөөдөр / долоо хоног / түүх) бүгд ЭНД байгаа нэг үгсийн сан,
// нэг тооцоог хэрэглэнэ. Ингэснээр "биелсэн" гэдэг үг хаана ч ижил утгатай.

import {
  HISTORY_DAYS,
  MIN_HISTORY_DAYS,
  STREAK_LOOKBACK_DAYS,
  WEEK_DAYS,
  daysBetween,
  formatRange,
  percent,
  shiftDate,
  startOfWeek,
  todayString
} from './data.js';

import { getDayForDate } from './program.js';
import { firstSessionDate, getDaySets, subscribe } from './storage.js';

/** @typedef {import('./types.js').Day} Day */
/** @typedef {import('./types.js').DayStatus} DayStatus */
/** @typedef {import('./types.js').DayRow} DayRow */
/** @typedef {import('./types.js').DisplayKey} DisplayKey */
/** @typedef {import('./types.js').SetMarks} SetMarks */

/* ---------------- Нэг үгсийн сан ---------------- */

/** Төлөвийн нэрс. Гурван дэлгэц дээр ижил үг гарна. */
export const STATUS_LABEL = {
  done: 'Биелсэн',
  partial: 'Дутуу',
  rest: 'Амралт',
  none: 'Хийгээгүй',
  upcoming: 'Удахгүй'
};

/** Төлөвийн тэмдэг (жижиг дөрвөлжин) ямар класстай байх вэ. */
export const STATUS_DOT = {
  done: 'is-full',
  partial: 'is-half',
  rest: 'is-rest',
  none: '',
  upcoming: ''
};

/* ---------------- Тооцооны кэш ---------------- */

/**
 * dayStatus() нь түүхийн дэлгэц дээр 30 удаа, цуваа тооцоход дахин олон удаа
 * дуудагдана — ихэнх нь ЯГ ижил огноо. Тооцоо нь бүхэлдээ хадгалалтаас
 * хамаардаг тул бичилт болтол үр дүн өөрчлөгдөхгүй.
 * @type {Map<string, DayStatus>}
 */
const statusCache = new Map();

// Аливаа бичилт / дахин ачаалалтад кэш хүчингүй болно.
subscribe(() => statusCache.clear());

/** Хөтөлбөр солигдох, тест ажиллуулах үед гараар цэвэрлэнэ. */
export function invalidateStats() {
  statusCache.clear();
}

/* ---------------- Сет ба дасгалын тоо ---------------- */

/**
 * Тухайн өдрийн сет тэмдэглэгээг хөтөлбөртэй тааруулж жигдрүүлнэ.
 * @param {string} date
 * @param {Day} day
 * @returns {SetMarks}
 */
export function readSets(date, day) {
  const stored = getDaySets(date);
  /** @type {SetMarks} */
  const sets = {};
  for (const exercise of day.exercises) {
    const marks = Array.isArray(stored[exercise.id]) ? stored[exercise.id] : [];
    sets[exercise.id] = Array.from({ length: exercise.sets }, (_, i) => Boolean(marks[i]));
  }
  return sets;
}

/**
 * @param {boolean[]|undefined} marks
 * @returns {boolean}
 */
export function isExerciseDone(marks) {
  return Array.isArray(marks) && marks.length > 0 && marks.every(Boolean);
}

/**
 * Бүрэн дуусгасан дасгалын тоо.
 * @param {Day} day
 * @param {SetMarks} sets
 * @returns {number}
 */
export function countDone(day, sets) {
  return day.exercises.reduce(
    (sum, exercise) => sum + (isExerciseDone(sets[exercise.id]) ? 1 : 0),
    0
  );
}

/**
 * Сетийн нарийвчилсан тоо: { done, total }. Дутуу явцыг харуулахад хэрэгтэй.
 * @param {Day} day
 * @param {SetMarks} sets
 * @returns {{done: number, total: number}}
 */
export function countSets(day, sets) {
  let done = 0;
  let total = 0;
  for (const exercise of day.exercises) {
    const marks = sets[exercise.id] || [];
    total += exercise.sets;
    done += marks.filter(Boolean).length;
  }
  return { done, total };
}

/* ---------------- Өдрийн төлөв ---------------- */

/**
 * Тухайн өдрийн бүрэн дүр зураг.
 * @param {string} date
 * @returns {DayStatus} key: 'rest' | 'done' | 'partial' | 'none'
 */
export function dayStatus(date) {
  const cached = statusCache.get(date);
  if (cached) return cached;

  const status = computeDayStatus(date);
  statusCache.set(date, status);
  return status;
}

/**
 * @param {string} date
 * @returns {DayStatus}
 */
function computeDayStatus(date) {
  const day = getDayForDate(date);
  if (!day) return { key: 'none', day: null, done: 0, total: 0, setsDone: 0, setsTotal: 0 };
  if (day.isRest) return { key: 'rest', day, done: 0, total: 0, setsDone: 0, setsTotal: 0 };

  const sets = readSets(date, day);
  const done = countDone(day, sets);
  const total = day.exercises.length;
  const { done: setsDone, total: setsTotal } = countSets(day, sets);

  /** @type {import('./types.js').StatusKey} */
  let key = 'none';
  if (total > 0 && done >= total) key = 'done';
  else if (setsDone > 0) key = 'partial';

  return { key, day, done, total, setsDone, setsTotal };
}

/**
 * Дэлгэц дээр харуулах төлөв. Ирээдүйн хоосон өдрийг "хийгээгүй" гэж
 * буруутгахгүй — "удахгүй" гэж заана.
 * @param {DayStatus} status
 * @param {string} date
 * @param {string} [today]
 * @returns {DisplayKey}
 */
export function displayKey(status, date, today = todayString()) {
  if (date > today && status.key === 'none') return 'upcoming';
  return status.key;
}

/**
 * Өдрийн товч тайлбар: "3/7 дасгал · 11/26 сет".
 * Амралтын өдөр хоосон буцаана — баруун талын төлөвийн багана "Амралт" гэж
 * хэлчихсэн байхад мөрөнд дахин бичих нь давхардал.
 * @param {DayStatus} status
 * @returns {string}
 */
export function describeStatus(status) {
  if (status.key === 'rest' || status.total === 0) return '';
  const base = `${status.done}/${status.total} дасгал`;
  if (status.key === 'partial') return `${base} · ${status.setsDone}/${status.setsTotal} сет`;
  return base;
}

/**
 * Өнөөдрөөс хойших хамгийн ойрын бэлтгэлийн өдөр.
 * @param {string} fromDate
 * @returns {{date: string, day: Day}|null}
 */
export function nextTrainingDay(fromDate) {
  for (let i = 1; i <= WEEK_DAYS; i += 1) {
    const date = shiftDate(fromDate, i);
    const day = getDayForDate(date);
    if (day && !day.isRest) return { date, day };
  }
  return null;
}

/* ---------------- Цуваа ---------------- */

/**
 * Одоогийн цуваа: өнөөдрөөс ухраан тоолоход хэдэн бэлтгэлийн өдөр
 * дараалан биелсэн бэ.
 *
 * - Амралтын өдөр цувааг ТАСЛАХГҮЙ, гэхдээ тоонд ч орохгүй.
 * - Өнөөдөр хараахан дуусаагүй байвал цувааг таслахгүй (өдөр дуусаагүй).
 * - Дутуу хийсэн өдөр цувааг тасална.
 * @param {string} [today]
 * @returns {number}
 */
export function currentStreak(today = todayString()) {
  // Хамгийн эртний тэмдэглэгээнээс цааш ухрах нь утгагүй — тэндээс өмнө
  // апп хэрэглэгдээгүй байсан тул "биелээгүй" өдөр гэж тоолох ёсгүй.
  const earliest = firstSessionDate();
  let streak = 0;
  let date = today;

  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i += 1) {
    if (earliest && date < earliest) break;

    const status = dayStatus(date);
    if (!status.day) break;

    if (status.key === 'rest') {
      date = shiftDate(date, -1);
      continue;
    }
    if (status.key === 'done') {
      streak += 1;
      date = shiftDate(date, -1);
      continue;
    }
    // Өнөөдөр дуусаагүй байх нь хэвийн — цуваа тасрахгүй.
    if (date === today) {
      date = shiftDate(date, -1);
      continue;
    }
    break;
  }

  return streak;
}

/* ---------------- Долоо хоногийн хураангуй ---------------- */

/**
 * Даваа гарагаас эхэлсэн 7 хоногийн хураангуй.
 * @param {string} monday
 * @param {string} [today]
 * @returns {{days: DayRow[], trained: number, partial: number, planned: number,
 *            setsDone: number, setsTotal: number, from: string, to: string}}
 */
export function weekSummary(monday, today = todayString()) {
  /** @type {DayRow[]} */
  const days = [];
  let trained = 0;
  let partial = 0;
  let planned = 0;
  let setsDone = 0;
  let setsTotal = 0;

  for (let i = 0; i < WEEK_DAYS; i += 1) {
    const date = shiftDate(monday, i);
    const status = dayStatus(date);
    days.push({ date, status, key: displayKey(status, date, today) });

    if (status.key === 'rest' || !status.day) continue;
    planned += 1;
    setsDone += status.setsDone;
    setsTotal += status.setsTotal;
    if (status.key === 'done') trained += 1;
    else if (status.key === 'partial') partial += 1;
  }

  return {
    days,
    trained,
    partial,
    planned,
    setsDone,
    setsTotal,
    from: monday,
    to: shiftDate(monday, WEEK_DAYS - 1)
  };
}

/* ---------------- Түүхийн хураангуй ---------------- */

/**
 * Түүхийн цонх хэдэн өдөр байх вэ.
 * Хамгийн ихдээ `count` өдөр, гэхдээ анхны тэмдэглэгээнээс өмнөх өдрүүдийг
 * "хийгээгүй" гэж тоолохгүй — апп суулгахаас өмнөх өдөр бол хийгээгүй өдөр биш.
 * @param {string} [today]
 * @param {number} [count]
 * @returns {number}
 */
export function historySpan(today = todayString(), count = HISTORY_DAYS) {
  const span = Math.max(1, Math.round(Number(count) || HISTORY_DAYS));
  const oldest = shiftDate(today, -(span - 1));
  const floor = shiftDate(today, -(MIN_HISTORY_DAYS - 1));
  const first = firstSessionDate();

  let start = oldest;
  if (first && first > start) start = first;
  if (start > floor) start = floor;

  return Math.max(1, Math.min(span, daysBetween(today, start) + 1));
}

/**
 * Түүхийн хураангуй + долоо хоногоор бүлэглэсэн жагсаалт.
 * Жагсаалт нь шинээс хуучин руу.
 * @param {string} [today]
 * @param {number} [count]
 */
export function historySummary(today = todayString(), count = HISTORY_DAYS) {
  /** @type {DayRow[]} */
  const rows = [];
  const totals = { done: 0, partial: 0, missed: 0, rest: 0 };
  const span = historySpan(today, count);

  for (let i = 0; i < span; i += 1) {
    const date = shiftDate(today, -i);
    const status = dayStatus(date);
    rows.push({ date, status, key: displayKey(status, date, today) });

    if (status.key === 'rest') totals.rest += 1;
    else if (status.key === 'done') totals.done += 1;
    else if (status.key === 'partial') totals.partial += 1;
    else totals.missed += 1;
  }

  const planned = totals.done + totals.partial + totals.missed;

  return {
    rows,
    weeks: groupByWeek(rows, today),
    ...totals,
    span,
    planned,
    rate: percent(totals.done, planned),
    streak: currentStreak(today)
  };
}

/**
 * Мөрүүдийг долоо хоногоор бүлэглэнэ (шинээс хуучин руу).
 * 30 ширхэг жигд мөр байснаас "энэ долоо хоног / өмнөх долоо хоног" болж
 * хуваагдсан нь нүдэнд хамаагүй амар.
 * @param {DayRow[]} rows
 * @param {string} [today]
 */
export function groupByWeek(rows, today = todayString()) {
  const thisWeek = startOfWeek(today);
  const lastWeek = shiftDate(thisWeek, -WEEK_DAYS);

  /** @type {Map<string, DayRow[]>} */
  const buckets = new Map();

  for (const row of rows) {
    const start = startOfWeek(row.date);
    const bucket = buckets.get(start);
    if (bucket) bucket.push(row);
    else buckets.set(start, [row]);
  }

  return [...buckets.entries()].map(([start, weekRows]) => {
    const trained = weekRows.filter((row) => row.status.key === 'done').length;
    const planned = weekRows.filter(
      (row) => row.status.day && !row.status.day.isRest
    ).length;

    let label;
    if (start === thisWeek) label = 'Энэ долоо хоног';
    else if (start === lastWeek) label = 'Өмнөх долоо хоног';
    else label = formatRange(weekRows[weekRows.length - 1].date, weekRows[0].date);

    return {
      start,
      label,
      rows: weekRows,
      trained,
      planned,
      note: planned > 0 ? `${trained}/${planned}` : '—'
    };
  });
}
