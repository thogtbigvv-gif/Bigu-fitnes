// program.js — data/program.json-ыг ачаалж, огноо -> өдөр холбоосыг тодорхойлно.
// Дасгалын нэр, сет, давталт КОД ДОТОР ХЭЗЭЭ Ч бичигдэхгүй — бүгд JSON-оос ирнэ.
//
// JSON нь хүн гараар засдаг файл тул ХЭЗЭЭ Ч итгэж болохгүй. normalizeProgram()
// нь юу ирснээс үл хамааран ҮРГЭЛЖ хүчинтэй Program буцаана: дутууг нөхөж,
// давхардсан id-г ялгаж, гажсаныг console-д мэдээлнэ.

import { PROGRAM_URL, PROGRAM_TIMEOUT_MS, weekdayIndex } from './data.js';

/** @typedef {import('./types.js').Day} Day */
/** @typedef {import('./types.js').Exercise} Exercise */
/** @typedef {import('./types.js').Program} Program */

/** @type {Program|null} */
let program = null;

/**
 * Гараг (0=Даваа .. 6=Ням) -> өдрийн id. Ачаалалт бүрд цэвэрлэгдэнэ.
 *
 * Яагаад хэрэгтэй вэ: dayStatus() нь түүхийн 30 мөр, цуваа тооцох давталт
 * бүрд getDayForDate() дуудна. Тэр бүрд Date задалж, өдрүүдийн массивыг
 * шүүх нь дэмий — гараг -> өдөр холбоос нь ердөө 7 боломжит утгатай.
 * @type {Map<number, string|null>}
 */
const weekdayCache = new Map();

/** @type {Map<string, Day>} */
const dayById = new Map();

function resetCaches() {
  weekdayCache.clear();
  dayById.clear();
  if (!program) return;
  for (const day of program.days) dayById.set(day.id, day);
}

/**
 * Нэг дасгалыг жигдрүүлнэ.
 * @param {any} raw
 * @param {number} index
 * @param {Set<string>} usedIds Тухайн ӨДӨР дотор аль хэдийн эзэмшигдсэн id-ууд
 * @returns {Exercise}
 */
function normalizeExercise(raw, index, usedIds) {
  const source = raw && typeof raw === 'object' ? raw : {};

  // Давхардсан id нь хамгийн аюултай алдаа: хоёр өөр дасгал НЭГ сетийн
  // мөрийг хуваалцаж, нэгийг нь тэмдэглэхэд нөгөө нь дүүрчихдэг.
  let id = String(source.id || '').trim() || `e${index + 1}`;
  if (usedIds.has(id)) {
    let suffix = 2;
    while (usedIds.has(`${id}-${suffix}`)) suffix += 1;
    console.warn(`program.json: "${id}" дасгалын id давхардсан тул "${id}-${suffix}" болголоо.`);
    id = `${id}-${suffix}`;
  }
  usedIds.add(id);

  // Сетийн тоог хязгаарлана: буруу JSON (жишээ нь sets: 99999) дэлгэцийг
  // хэдэн мянган товчоор дүүргэж, хөтчийг зогсоохоос сэргийлнэ.
  const sets = Math.max(1, Math.min(20, Math.round(Number(source.sets) || 1)));

  return {
    id,
    name: String(source.name || 'Нэргүй дасгал'),
    sets,
    reps: source.reps == null ? '' : String(source.reps),
    rest: Math.max(0, Math.min(3600, Math.round(Number(source.rest) || 0))),
    note: source.note == null ? '' : String(source.note)
  };
}

/**
 * Бүтэн хөтөлбөрийг жигдрүүлнэ. ЦЭВЭР функц — тест бичихэд шууд ашиглагдана.
 * @param {any} raw
 * @returns {Program}
 */
export function normalizeProgram(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const restDays = Array.isArray(source.restDays) ? source.restDays.map(String) : [];
  const usedDayIds = new Set();

  const days = (Array.isArray(source.days) ? source.days : []).map((entry, index) => {
    const dayRaw = entry && typeof entry === 'object' ? entry : {};

    let id = String(dayRaw.id || '').trim() || `d${index + 1}`;
    if (usedDayIds.has(id)) {
      let suffix = 2;
      while (usedDayIds.has(`${id}-${suffix}`)) suffix += 1;
      console.warn(`program.json: "${id}" өдрийн id давхардсан тул "${id}-${suffix}" болголоо.`);
      id = `${id}-${suffix}`;
    }
    usedDayIds.add(id);

    const usedExerciseIds = new Set();
    const exercises = (Array.isArray(dayRaw.exercises) ? dayRaw.exercises : [])
      .map((item, i) => normalizeExercise(item, i, usedExerciseIds));

    return {
      id,
      title: String(dayRaw.title || 'Гарчиггүй өдөр'),
      exercises,
      isRest: restDays.includes(id) || exercises.length === 0
    };
  });

  return {
    version: Number(source.version) || 1,
    name: String(source.name || 'Хөтөлбөр'),
    days,
    restDays
  };
}

/**
 * program.json-ыг ачаална. Алдаа гарвал ОЙЛГОМЖТОЙ мессежтэй throw хийнэ —
 * main.js барьж, дэлгэц дээр харуулна.
 *
 * Хүлээх хугацаа хязгаартай: сүлжээ өлгөгдвөл апп мөнхөд хоосон дэлгэцтэй
 * үлдэхийн оронд тодорхой алдаа өгнө.
 * @param {{ url?: string, timeoutMs?: number }} [options]
 * @returns {Promise<Program>}
 */
export async function loadProgram(options = {}) {
  const url = options.url || PROGRAM_URL;
  const timeoutMs = options.timeoutMs || PROGRAM_TIMEOUT_MS;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response;
  try {
    response = await fetch(url, {
      cache: 'no-cache',
      signal: controller ? controller.signal : undefined
    });
  } catch (err) {
    const aborted = err && /** @type {Error} */ (err).name === 'AbortError';
    throw new Error(
      aborted
        ? `Хөтөлбөрийн файл ${timeoutMs / 1000} секундэд ачаалагдсангүй.`
        : `Хөтөлбөрийн файлд холбогдож чадсангүй (${describeError(err)}).`
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`program.json ачаалагдсангүй (HTTP ${response.status}).`);
  }

  let raw;
  try {
    raw = await response.json();
  } catch (err) {
    // Файлын оронд 404 хуудас ирвэл яг энд орно — "Unexpected token <" гэсэн
    // ойлгомжгүй мессежийн оронд юу болсныг хэлнэ.
    throw new Error('program.json дотор хүчинтэй JSON алга байна.');
  }

  const next = normalizeProgram(raw);
  if (next.days.length === 0) {
    throw new Error('program.json дотор нэг ч өдөр алга байна.');
  }
  if (next.days.every((day) => day.isRest)) {
    throw new Error('program.json доторх бүх өдөр амралт байна — нэг ч дасгал алга.');
  }

  program = next;
  resetCaches();
  return program;
}

/**
 * Алдааг хүнд ойлгомжтой богино мөр болгоно.
 * @param {unknown} err
 * @returns {string}
 */
function describeError(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** @returns {Program|null} */
export function getProgram() {
  return program;
}

/** @returns {Day[]} */
export function getDays() {
  return program ? program.days : [];
}

/**
 * @param {string} dayId
 * @returns {Day|null}
 */
export function getDayById(dayId) {
  return dayById.get(dayId) || null;
}

/**
 * Огноо -> өдрийн id. Гарагийн дугаараар шууд холбоно (орон нутгийн цагаар):
 *   Даваа = d1, Мягмар = d2, Лхагва = d3, Пүрэв = d4,
 *   Баасан = d5, Бямба = d6, Ням = d7.
 * Хэрэв тухайн "dN" id хөтөлбөрт байхгүй бол жагсаалтын дараалалд шилжинэ.
 * @param {string} dateStr
 * @returns {string|null}
 */
export function getDayIdForDate(dateStr) {
  const days = getDays();
  if (days.length === 0) return null;

  const index = weekdayIndex(dateStr); // 0 = Даваа ... 6 = Ням
  if (weekdayCache.has(index)) return weekdayCache.get(index) ?? null;

  const byId = getDayById(`d${index + 1}`);
  const id = byId ? byId.id : days[index % days.length].id;
  weekdayCache.set(index, id);
  return id;
}

/**
 * @param {string} dateStr
 * @returns {Day|null}
 */
export function getDayForDate(dateStr) {
  const id = getDayIdForDate(dateStr);
  return id ? getDayById(id) : null;
}

/**
 * @param {string} dayId
 * @returns {boolean}
 */
export function isRestDay(dayId) {
  const day = getDayById(dayId);
  return day ? day.isRest : false;
}

/**
 * Өдөрт хэдэн дасгал байгаа (=нийт тоо).
 * @param {string} dayId
 * @returns {number}
 */
export function exerciseCount(dayId) {
  const day = getDayById(dayId);
  return day ? day.exercises.length : 0;
}

/**
 * Хөтөлбөрийн нэр. Толгой хэсэгт таних тэмдэг болж гарна.
 * @returns {string}
 */
export function getProgramName() {
  return program ? program.name : '';
}

/**
 * Тест / дахин ачаалалтад зориулж дотоод төлөвийг тэглэнэ.
 * @param {Program|null} [next]
 */
export function setProgram(next = null) {
  program = next;
  resetCaches();
}
