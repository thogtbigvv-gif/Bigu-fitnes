// storage.js — аппын өгөгдлийн ЦОРЫН ГАНЦ эзэн.
//
// Бүх өгөгдөл НЭГ түлхүүр дор ("gym:state_v1") JSON хэлбэрээр хадгалагдана.
// Өдрийн үр дүн цэвэр бүтэцтэй: { date, dayId, done, total, completedAt }
// Ингэснээр XP гүүр нэмэхэд getDayResult()-ийг л дуудахад хангалттай.
//
// Хөтчийн хадгалалттай ШУУД харьцахгүй — бүх унших/бичих safe-storage.js
// дундуур явна. Энэ файл зөвхөн БҮТЭЦ, ШИЛЖИЛТ, ТООЦООГ хариуцна.

import {
  STATE_KEY,
  BACKUP_PREFIX,
  SCHEMA_VERSION,
  HISTORY_DAYS,
  STREAK_LOOKBACK_DAYS,
  isDateString,
  isTimestamp,
  localTimestamp,
  shiftDate,
  todayString
} from './data.js';

import {
  getStatus,
  onStatusChange,
  readJson,
  writeJson,
  writeRaw
} from './safe-storage.js';

/** @typedef {import('./types.js').AppState} AppState */
/** @typedef {import('./types.js').DayResult} DayResult */
/** @typedef {import('./types.js').Day} Day */
/** @typedef {import('./types.js').Session} Session */
/** @typedef {import('./types.js').SetMarks} SetMarks */
/** @typedef {import('./types.js').Swaps} Swaps */

/** Хадгалалтын төлөв -> хүнд хэлэх мессеж. */
const STATUS_MESSAGE = {
  ok: null,
  blocked:
    'Тэмдэглэгээ энэ хөтөч дээр хадгалагдахгүй байна. ' +
    'Нууц горим (private) эсвэл сайтын өгөгдөл хаалттай байж магадгүй.',
  full: 'Хөтчийн хадгалах зай дүүрсэн байна. Тэмдэглэгээ хадгалагдахгүй.'
};

/** @type {AppState|null} */
let cache = null;

/**
 * Хамгийн эртний тэмдэглэгээтэй огноо. `undefined` = хараахан тооцоогүй.
 * Түүхийн дэлгэц бүр дээр бүх түлхүүрийг эрэмбэлэхийн оронд нэг л тооцно.
 * @type {string|null|undefined}
 */
let firstDateCache;

// Бичилт болох бүрд мэдэгдэх сонсогчид. storage.js өөрөө UI-г import хийхгүй —
// холбоос нь main.js дээр хийгддэг тул мөчлөг үүсэхгүй.
/** @type {Set<() => void>} */
const listeners = new Set();

// Хадгалалт гэнэт хаагдвал (зай дүүрэх гэх мэт) UI тэр дор нь мэдэх ёстой.
onStatusChange(() => notify());

/**
 * Бичилт бүрд дуудагдах сонсогч бүртгэнэ.
 * @param {() => void} listener
 * @returns {() => void} бүртгэлээс хасах функц
 */
export function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      // Нэг сонсогчийн алдаа хадгалалтыг зогсоохгүй.
      console.warn('storage сонсогч алдаа өглөө:', err);
    }
  }
}

/** @returns {AppState} */
function emptyState() {
  return { version: SCHEMA_VERSION, sessions: {}, swaps: {} };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Хадгалалт эвдэрсэн эсэх. Эвдэрсэн бол хүнд ойлгомжтой мессеж, эс бөгөөс null.
 * UI үүнийг мэдэгдэл болгон харуулна.
 * @returns {string|null}
 */
export function getStorageError() {
  return STATUS_MESSAGE[getStatus()] ?? null;
}

/**
 * Хуучин өгөгдлийг одоогийн схем рүү шилжүүлнэ.
 * Танихгүй / эвдэрсэн өгөгдлийг УСТГАХГҮЙ, gym:backup_<v> болгож үлдээнэ.
 * @param {unknown} raw
 * @returns {AppState}
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

  // v1 -> v2: өдөр солилцоо нэмэгдэв. Хуучин өгөгдөлд солилцоо байгаагүй тул
  // хоосон зураглалаар эхэлнэ — тэмдэглэгээнд нь хуруу хүрэхгүй.
  if (version < 2) {
    state = { ...state, version: 2, swaps: {} };
    version = 2;
  }

  // Ирээдүйн схем (шинэ хувилбарын апп ажиллаад буцаж ирсэн) — хөндөхгүй нөөцөлнө.
  if (version > SCHEMA_VERSION) {
    writeJson(BACKUP_PREFIX + version, raw);
    return emptyState();
  }

  // Сессүүдийг цэвэрлэнэ: гэмтсэн бичлэгийг хаяна, дутууг нөхнө.
  /** @type {Record<string, Session>} */
  const sessions = {};
  for (const [date, session] of Object.entries(state.sessions || {})) {
    if (!isDateString(date) || !isPlainObject(session)) continue;
    sessions[date] = normalizeSession(date, session);
  }

  return { version: SCHEMA_VERSION, sessions, swaps: normalizeSwaps(state.swaps) };
}

/**
 * Солилцоог найдвартай бүтэц рүү оруулна.
 *
 * Цорын ганц дүрэм: солилцоо ҮРГЭЛЖ ХАРИЛЦАН. `swaps[a] === b` бол
 * `swaps[b] === a` байх ёстой. Хагас холбоос (нэг тал нь өөр өдөр рүү
 * заасан) үлдвэл хоёр огноо ижил төлөвлөгөө харуулах эсвэл нэг өдөр
 * бүрмөсөн алга болох эрсдэлтэй — тиймээс эргэлзээтэй бүхнийг хаяна.
 * @param {unknown} raw
 * @returns {Swaps}
 */
function normalizeSwaps(raw) {
  /** @type {Swaps} */
  const swaps = {};
  if (!isPlainObject(raw)) return swaps;

  for (const [date, partner] of Object.entries(raw)) {
    if (!isDateString(date) || !isDateString(partner) || date === partner) continue;
    // Хос нь харилцан байж, аль нэг нь өөр гуравдагч өдөр рүү заагаагүй
    // байх ёстой.
    if (raw[partner] !== date) continue;
    swaps[date] = partner;
  }
  return swaps;
}

/**
 * Нэг сессийг найдвартай бүтэц рүү оруулна.
 * @param {string} date
 * @param {any} session
 * @returns {Session}
 */
function normalizeSession(date, session) {
  /** @type {SetMarks} */
  const sets = {};
  if (isPlainObject(session.sets)) {
    for (const [exerciseId, marks] of Object.entries(session.sets)) {
      if (Array.isArray(marks)) sets[exerciseId] = marks.map(Boolean);
    }
  }

  const total = Math.max(0, Math.round(Number(session.total) || 0));
  // done нь total-оос ХЭЗЭЭ Ч хэтрэхгүй — эвдэрсэн өгөгдөл "8/7 дасгал"
  // гэсэн утгагүй хураангуй үүсгэхээс сэргийлнэ.
  const done = Math.min(Math.max(0, Math.round(Number(session.done) || 0)), total);

  return {
    date,
    dayId: typeof session.dayId === 'string' ? session.dayId : '',
    done,
    total,
    completedAt: isTimestamp(session.completedAt) ? session.completedAt : null,
    sets
  };
}

/**
 * Хоёр сесс агуулгаараа ижил үү.
 * Урьд нь энд JSON.stringify-ийн харьцуулалт хийгддэг байсан бол тэр нь
 * ТҮЛХҮҮРИЙН ДАРААЛЛААС хамаардаг — агуулга нь огт өөрчлөгдөөгүй байхад
 * "өөрчлөгдсөн" гэж үзээд дэмий бичилт хийдэг байв.
 * @param {Session} a
 * @param {Session} b
 * @returns {boolean}
 */
function sessionsEqual(a, b) {
  if (a.dayId !== b.dayId) return false;
  if (a.done !== b.done || a.total !== b.total) return false;
  if (a.completedAt !== b.completedAt) return false;

  const keysA = Object.keys(a.sets);
  const keysB = Object.keys(b.sets);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const left = a.sets[key];
    const right = b.sets[key];
    if (!right || left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
}

/**
 * State-ийг ачаална (санах ойд кэшлэнэ).
 * @returns {AppState}
 */
export function loadState() {
  if (cache) return cache;

  const stored = readJson(STATE_KEY);
  if (stored && stored.value === null) {
    // JSON нь эвдэрсэн байна. Дарж бичихээс өмнө хуулбарыг нь үлдээнэ —
    // хэрэглэгчийн хэдэн сарын түүхийг чимээгүй хаях эрх бидэнд байхгүй.
    console.warn('Хадгалсан өгөгдөл эвдэрсэн байна, нөөцөлж байна.');
    writeRaw(BACKUP_PREFIX + 'corrupt', stored.raw);
  }

  cache = migrate(stored ? stored.value : null);
  firstDateCache = undefined;
  return cache;
}

/**
 * saveDay / clearDay / clearAll / reconcile-ийн БИЧИХ цорын ганц цэг.
 * @returns {boolean}
 */
function persist() {
  firstDateCache = undefined;
  const ok = writeJson(STATE_KEY, cache);
  notify();
  return ok;
}

/**
 * Кэшийг хаяж, localStorage-оос дахин уншина.
 * Ижил апп өөр табд нээлттэй байхад ("storage" event) хэрэгтэй —
 * үгүй бол нэг таб дээр тэмдэглэсэн зүйл нөгөө дээр нь харагдахгүй, улмаар
 * тэр таб хуучин төлөвөө дарж бичих эрсдэлтэй.
 * @returns {AppState}
 */
export function reload() {
  cache = null;
  firstDateCache = undefined;
  const state = loadState();
  // Дахин уншсан нь БИЧИЛТТЭЙ адил үр дагавартай: өөр таб дээр тэмдэглэсэн
  // өгөгдөл орж ирсэн байна. Сонсогчид (тооцооны кэш, feed, мэдэгдэл) энэ
  // тухай мэдэхгүй бол хуучин утгаа хадгалсаар үлдэнэ.
  notify();
  return state;
}

/**
 * Тухайн өдрийн сессийг буцаана (байхгүй бол null).
 * @param {string} date
 * @returns {Session|null}
 */
export function getSession(date) {
  return loadState().sessions[date] || null;
}

/**
 * Гадагш гарах ЦЭВЭР үр дүн. XP гүүр яг үүнийг ашиглана.
 * @param {string} date
 * @returns {DayResult|null}
 */
export function getDayResult(date) {
  const session = getSession(date);
  if (!session) return null;
  const { dayId, done, total, completedAt } = session;
  return { date, dayId, done, total, completedAt };
}

/**
 * Хамгийн эртний тэмдэглэгээтэй огноо ("YYYY-MM-DD"), огт байхгүй бол null.
 * Түүхийн дэлгэц үүнээс өмнөх хоосон өдрүүдийг "хийгээгүй" гэж тоолохгүй.
 * @returns {string|null}
 */
export function firstSessionDate() {
  if (firstDateCache !== undefined) return firstDateCache;

  // Эрэмбэлэхийн оронд нэг удаагийн шүүлт — O(n log n) биш O(n).
  let earliest = null;
  for (const date of Object.keys(loadState().sessions)) {
    if (earliest === null || date < earliest) earliest = date;
  }
  firstDateCache = earliest;
  return earliest;
}

/**
 * Тухайн өдрийн сет тэмдэглэгээ: { exerciseId: [true, false, ...] }
 *
 * ХУУЛБАР буцаана. Дотоод кэш рүү шууд лавлагаа өгвөл дуудагч тал санамсаргүй
 * өөрчлөөд, persist() дуудагдалгүй өнгөрч, дэлгэц ба хадгалалт зөрөх эрсдэлтэй.
 * @param {string} date
 * @returns {SetMarks}
 */
export function getDaySets(date) {
  const session = getSession(date);
  if (!session) return {};
  /** @type {SetMarks} */
  const copy = {};
  for (const [exerciseId, marks] of Object.entries(session.sets)) {
    copy[exerciseId] = marks.slice();
  }
  return copy;
}

/**
 * Өдрийн бүх мэдээллийг бичнэ.
 * completedAt нь өдөр анх бүрэн дуусах агшинд л тавигдана.
 * @param {{date: string, dayId: string, sets: SetMarks, done: number, total: number}} input
 * @returns {DayResult|null}
 */
export function saveDay({ date, dayId, sets, done, total }) {
  if (!isDateString(date)) {
    console.warn(`saveDay: огноо танигдсангүй (${String(date)}) — бичихээс татгалзлаа.`);
    return null;
  }

  const state = loadState();
  const previous = state.sessions[date] || null;
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  const safeDone = Math.min(Math.max(0, Math.round(Number(done) || 0)), safeTotal);
  const isComplete = safeTotal > 0 && safeDone >= safeTotal;

  let completedAt = previous ? previous.completedAt : null;
  if (isComplete && !completedAt) completedAt = localTimestamp();
  if (!isComplete) completedAt = null;

  const next = normalizeSession(date, {
    dayId,
    done: safeDone,
    total: safeTotal,
    completedAt,
    sets
  });

  // Агуулга нь өөрчлөгдөөгүй бол бичихгүй — тэмдэглээд буцаагаад тайлах гэх
  // мэт үйлдэл дээр localStorage-д дэмий ачаалал өгөхгүй.
  if (previous && sessionsEqual(previous, next)) return getDayResult(date);

  state.sessions[date] = next;
  persist();
  return getDayResult(date);
}

/* ---------------- Өдөр солилцоо ---------------- */

/**
 * Тухайн өдөр аль өдрийн төлөвлөгөөг хийх вэ. Солилцоогүй бол null.
 * @param {string} date
 * @returns {string|null}
 */
export function getSwapPartner(date) {
  return loadState().swaps[date] || null;
}

/**
 * Бүх солилцоо (хуулбар).
 * @returns {Swaps}
 */
export function getSwaps() {
  return { ...loadState().swaps };
}

/**
 * Хоёр өдрийн төлөвлөгөөг харилцан солино.
 *
 * Аль нэг өдөр нь өмнө нь өөр өдөртэй солигдсон байвал тэр хуучин холбоо
 * ЭХЛЭЭД тайлагдана — эс бөгөөс хагас холбоос үлдэж, гуравдагч өдөр
 * "хосгүй" болно.
 * @param {string} a
 * @param {string} b
 * @returns {boolean} бичигдсэн эсэх
 */
export function setSwapPair(a, b) {
  if (!isDateString(a) || !isDateString(b) || a === b) {
    console.warn(`setSwapPair: огноо танигдсангүй (${String(a)}, ${String(b)}).`);
    return false;
  }

  const state = loadState();
  if (state.swaps[a] === b) return false; // аль хэдийн ийм байна

  unlink(state.swaps, a);
  unlink(state.swaps, b);
  state.swaps[a] = b;
  state.swaps[b] = a;
  persist();
  return true;
}

/**
 * Тухайн өдрийн солилцоог тайлна (хосыг нь мөн).
 * @param {string} date
 * @returns {boolean} өөрчлөгдсөн эсэх
 */
export function clearSwap(date) {
  const state = loadState();
  if (!state.swaps[date]) return false;
  unlink(state.swaps, date);
  persist();
  return true;
}

/**
 * Нэг өдрийг хосоос нь салгана (хоёр талын бичлэгийг зэрэг устгана).
 * @param {Swaps} swaps
 * @param {string} date
 */
function unlink(swaps, date) {
  const partner = swaps[date];
  if (!partner) return;
  delete swaps[partner];
  delete swaps[date];
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
 * - Хугацаа нь өнгөрсөн, хэнд ч хэрэггүй болсон солилцоог хаяна.
 *
 * @param {Day[]} days program.js-ийн getDays() буцаадаг өдрүүд
 * @param {((date: string) => Day|null)} [resolveDay]
 *   Огноо -> тэр өдөр ХИЙГДЭХ өдөр. Солилцоог тооцсон хувилбарыг
 *   (schedule.dayForDate) main.js дамжуулна. Өгөгдөөгүй бол сесс дотор
 *   хадгалагдсан dayId-гаар шийднэ — тест ба хуучин зан төлөв.
 * @returns {{removed: number, trimmed: number}} юу цэвэрлэснийг мэдээлнэ
 */
export function reconcile(days, resolveDay) {
  const state = loadState();
  const byId = new Map((days || []).map((day) => [day.id, day]));

  let removed = pruneSwaps(state.swaps);
  let trimmed = 0;

  // Object.entries нь хормын хуулбар үүсгэдэг тул давталтын дотор delete
  // хийх нь аюулгүй.
  for (const [date, session] of Object.entries(state.sessions)) {
    // Өдөр солигдсон бол тэмдэглэгээг ШИНЭ төлөвлөгөөтэй нь тулгана —
    // эс бөгөөс дэлгэц нэг өдрийг, түүх өөр өдрийг харуулна.
    const day = resolveDay ? resolveDay(date) : byId.get(session.dayId);

    // Өдөр нь алга болсон эсвэл амралт болсон -> хадгалах утгагүй.
    if (!day || day.isRest) {
      delete state.sessions[date];
      removed += 1;
      continue;
    }

    /** @type {SetMarks} */
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
    if (!sessionsEqual(next, session)) {
      state.sessions[date] = next;
      trimmed += 1;
    }
  }

  if (removed || trimmed) persist();
  return { removed, trimmed };
}

/**
 * Хэтэрхий хуучирсан солилцоог хаяна.
 *
 * Солилцоо нь ердөө "энэ долоо хоногт өдрөө сольсон" гэсэн бичлэг. Жилийн
 * өмнөх солилцоог хадгалж байх нь ямар ч дэлгэцэд харагдахгүй, зөвхөн
 * хадгалалт дүүргэнэ. Хос нь ХОЁУЛАА хуучирсан үед л устгана — эс бөгөөс
 * хагас холбоос үлдэнэ.
 * @param {Swaps} swaps
 * @returns {number} устгасан хосын тоо
 */
function pruneSwaps(swaps) {
  const cutoff = shiftDate(todayString(), -STREAK_LOOKBACK_DAYS);
  let removed = 0;

  for (const [date, partner] of Object.entries(swaps)) {
    if (!swaps[date]) continue; // хосоороо аль хэдийн устсан
    if (date >= cutoff || partner >= cutoff) continue;
    unlink(swaps, date);
    removed += 1;
  }
  return removed;
}

/** Энэ төхөөрөмж дээрх БҮХ тэмдэглэгээг устгана. Буцаах боломжгүй. */
export function clearAll() {
  cache = emptyState();
  persist();
}

/**
 * Тухайн өдрийн тэмдэглэгээг бүрэн арилгана.
 * @param {string} date
 */
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
 * @param {string} endDate
 * @param {number} [count]
 * @returns {Array<{date: string, result: DayResult|null}>}
 */
export function getRecentDays(endDate, count = HISTORY_DAYS) {
  const list = [];
  const span = Math.max(0, Math.round(Number(count) || 0));
  for (let i = 0; i < span; i += 1) {
    const date = shiftDate(endDate, -i);
    list.push({ date, result: getDayResult(date) });
  }
  return list;
}

/**
 * Тестэд зориулж дотоод кэшийг тэглэнэ.
 * Аппын ажиллагаанд дуудагдахгүй.
 */
export function __resetForTests() {
  cache = null;
  firstDateCache = undefined;
}
