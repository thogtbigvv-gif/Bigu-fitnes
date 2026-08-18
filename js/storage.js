// storage.js — localStorage-ийн цорын ганц хаалга.
// Бүх өгөгдөл НЭГ түлхүүр дор ("gym:state_v1") JSON хэлбэрээр хадгалагдана.
// Өдрийн үр дүн цэвэр бүтэцтэй: { date, dayId, done, total, completedAt }
// Ингэснээр дараа нь XP гүүр нэмэхэд getDayResult()-ийг л дуудахад хангалттай.

import {
  STATE_KEY,
  BACKUP_PREFIX,
  SCHEMA_VERSION,
  HISTORY_DAYS,
  localTimestamp,
  shiftDate
} from './data.js';

let cache = null;

function emptyState() {
  return { version: SCHEMA_VERSION, sessions: {} };
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** localStorage бүрэн боломжгүй байж мэднэ (private mode гэх мэт). */
function safeRead(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn('localStorage уншиж чадсангүй:', err);
    return null;
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn('localStorage бичиж чадсангүй:', err);
    return false;
  }
}

/**
 * Хуучин өгөгдлийг одоогийн схем рүү шилжүүлнэ.
 * Танихгүй / эвдэрсэн өгөгдлийг УСТГАХГҮЙ, gym:backup_<v> болгож үлдээнэ.
 */
function migrate(raw) {
  if (!isPlainObject(raw)) return emptyState();

  let state = raw;
  let version = Number(state.version) || 0;

  // v0 -> v1: анхны схем. Байхгүй талбарыг нөхнө.
  if (version < 1) {
    state = { version: 1, sessions: isPlainObject(state.sessions) ? state.sessions : {} };
    version = 1;
  }

  // Ирээдүйн схем (шинэ хувилбарын апп ажиллаад буцаж ирсэн) — хөндөхгүй нөөцөлнө.
  if (version > SCHEMA_VERSION) {
    safeWrite(BACKUP_PREFIX + version, JSON.stringify(raw));
    return emptyState();
  }

  // Сессүүдийг цэвэрлэнэ: гэмтсэн бичлэгийг хаяна, дутууг нөхнө.
  const sessions = {};
  for (const [date, session] of Object.entries(state.sessions || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPlainObject(session)) continue;
    sessions[date] = normalizeSession(date, session);
  }

  return { version: SCHEMA_VERSION, sessions };
}

function normalizeSession(date, session) {
  const sets = {};
  if (isPlainObject(session.sets)) {
    for (const [exerciseId, marks] of Object.entries(session.sets)) {
      if (Array.isArray(marks)) sets[exerciseId] = marks.map(Boolean);
    }
  }
  return {
    date,
    dayId: typeof session.dayId === 'string' ? session.dayId : '',
    done: Number(session.done) || 0,
    total: Number(session.total) || 0,
    completedAt: typeof session.completedAt === 'string' ? session.completedAt : null,
    sets
  };
}

/** State-ийг ачаална (санах ойд кэшлэнэ). */
export function loadState() {
  if (cache) return cache;
  const raw = safeRead(STATE_KEY);
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('Хадгалсан өгөгдөл эвдэрсэн байна, нөөцөлж байна:', err);
      safeWrite(BACKUP_PREFIX + 'corrupt', raw);
    }
  }
  cache = migrate(parsed);
  return cache;
}

function persist() {
  safeWrite(STATE_KEY, JSON.stringify(cache));
}

/** Тухайн өдрийн сессийг буцаана (байхгүй бол null). */
export function getSession(date) {
  return loadState().sessions[date] || null;
}

/**
 * Гадагш гарах ЦЭВЭР үр дүн. XP гүүр ирээдүйд яг үүнийг ашиглана.
 * @returns {{date:string, dayId:string, done:number, total:number, completedAt:string|null}|null}
 */
export function getDayResult(date) {
  const session = getSession(date);
  if (!session) return null;
  const { dayId, done, total, completedAt } = session;
  return { date, dayId, done, total, completedAt };
}

/** Тухайн өдрийн сет тэмдэглэгээ: { exerciseId: [true, false, ...] } */
export function getDaySets(date) {
  const session = getSession(date);
  return session ? session.sets : {};
}

/**
 * Өдрийн бүх мэдээллийг бичнэ.
 * completedAt нь өдөр анх бүрэн дуусах агшинд л тавигдана.
 */
export function saveDay({ date, dayId, sets, done, total }) {
  const state = loadState();
  const previous = state.sessions[date] || null;
  const isComplete = total > 0 && done >= total;

  let completedAt = previous ? previous.completedAt : null;
  if (isComplete && !completedAt) completedAt = localTimestamp();
  if (!isComplete) completedAt = null;

  state.sessions[date] = normalizeSession(date, {
    dayId,
    done,
    total,
    completedAt,
    sets
  });

  persist();
  return getDayResult(date);
}

/**
 * Хөтөлбөр солигдоход хуучин тэмдэглэгээг цэгцэлнэ.
 * main.js дотор program.json ачаалагдсаны дараа нэг удаа дуудагдана.
 *
 * - Хөтөлбөрөөс алга болсон өдрийн бичлэгийг устгана.
 * - Одоо амралт болсон өдрийн бичлэгийг устгана.
 * - Байхгүй болсон дасгалын сет тэмдэглэгээг хаяна.
 * - Сетийн тоо өөрчлөгдсөн бол уртыг нь тааруулна.
 * - done / total / completedAt-ыг дахин тооцно.
 * - Ганц ч сет тэмдэглэгдээгүй үлдвэл бичлэгийг бүхэлд нь устгана.
 *
 * @param {Array} days program.js-ийн getDays() буцаадаг өдрүүд
 * @returns {{removed: number, trimmed: number}} юу цэвэрлэснийг мэдээлнэ
 */
export function reconcile(days) {
  const state = loadState();
  const byId = new Map((days || []).map((day) => [day.id, day]));

  let removed = 0;
  let trimmed = 0;

  for (const [date, session] of Object.entries(state.sessions)) {
    const day = byId.get(session.dayId);

    // Өдөр нь алга болсон эсвэл амралт болсон -> хадгалах утгагүй.
    if (!day || day.isRest) {
      delete state.sessions[date];
      removed += 1;
      continue;
    }

    const sets = {};
    let done = 0;
    let anyMark = false;

    for (const exercise of day.exercises) {
      const previous = session.sets[exercise.id];
      const marks = Array.from(
        { length: exercise.sets },
        (_, i) => Boolean(previous && previous[i])
      );
      sets[exercise.id] = marks;
      if (marks.some(Boolean)) anyMark = true;
      if (marks.every(Boolean)) done += 1;
    }

    if (!anyMark) {
      delete state.sessions[date];
      removed += 1;
      continue;
    }

    const total = day.exercises.length;
    const isComplete = total > 0 && done >= total;
    const completedAt = isComplete ? (session.completedAt || localTimestamp()) : null;

    const next = normalizeSession(date, { dayId: day.id, done, total, completedAt, sets });
    if (JSON.stringify(next) !== JSON.stringify(session)) {
      state.sessions[date] = next;
      trimmed += 1;
    }
  }

  if (removed || trimmed) persist();
  return { removed, trimmed };
}

/** Энэ төхөөрөмж дээрх БҮХ тэмдэглэгээг устгана. Буцаах боломжгүй. */
export function clearAll() {
  cache = emptyState();
  persist();
}

/** Тухайн өдрийн тэмдэглэгээг бүрэн арилгана. */
export function clearDay(date) {
  const state = loadState();
  if (state.sessions[date]) {
    delete state.sessions[date];
    persist();
  }
}

/**
 * Сүүлийн N өдрийн үр дүн, шинэээс нь хуучин рүү.
 * Тэмдэглэгээгүй өдөр null-аар биш, { date, result: null } хэлбэрээр ирнэ.
 */
export function getRecentDays(endDate, count = HISTORY_DAYS) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const date = shiftDate(endDate, -i);
    list.push({ date, result: getDayResult(date) });
  }
  return list;
}

/** Долоо хоногийн 7 өдрийн үр дүн (Даваа гаригаас эхэлнэ). */
export function getWeekResults(mondayDate) {
  const list = [];
  for (let i = 0; i < 7; i += 1) {
    const date = shiftDate(mondayDate, i);
    list.push({ date, result: getDayResult(date) });
  }
  return list;
}
