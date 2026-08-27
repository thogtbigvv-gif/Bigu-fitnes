// bridge.js — гадагш чиглэсэн "activity feed".
// Ижил GitHub Pages origin дээр байрлах summer-project энэ түлхүүрийг УНШИЖ,
// дасгалын үр дүнг өөрийн дүрмээрээ XP болгоно.
//
// Энэ файл "gym:state_v1"-д ХЭЗЭЭ Ч бичихгүй — зөвхөн уншина.
// "summerProjectWebData_v4"-ийг ч уншихгүй — нөгөө тал руу ханддаггүй.
// Бичдэг цорын ганц түлхүүр нь "gym:bridge".
//
// Нийтлэг гэрээ (аппууд бүгд адилхан бичнэ):
//   { v: 1, app, label, updatedAt: <ms>,
//     status: { ... уншигч тал тайлбарлахгүй, бүтнээр нь хадгална },
//     events: [ { id, at, type, value, detail } ... ] }
//
// XP-ийн тооцоо ЭНД БАЙХГҮЙ. Дасгалын апп зөвхөн "юу болсныг" мэдээлнэ,
// түүнийг хэдэн XP болгохыг summer-project-ийн XP_RULES шийднэ.

import { NAMESPACE, HISTORY_DAYS, isTimestamp, todayString, parseDateString } from './data.js';
import { getDayById, getDayForDate } from './program.js';
import { getDayResult, getRecentDays } from './storage.js';
import { readJson, writeJson } from './safe-storage.js';

/** @typedef {import('./types.js').DayResult} DayResult */
/** @typedef {import('./types.js').Day} Day */

export const BRIDGE_KEY = NAMESPACE + 'bridge';

const BRIDGE_VERSION = 1;

// app нь уншигч талын BRIDGE_SOURCES дахь мөртэй таарна.
const BRIDGE_APP = 'gym';
const BRIDGE_LABEL = 'Gym';

/** Хэдэн хоногийн дасгалыг event болгож гадагш харуулах вэ. */
const BRIDGE_DAYS = 14;

/** Хичнээн ч түүхтэй байлаа гэсэн энэ тооноос хэтрэхгүй. */
const BRIDGE_MAX_EVENTS = 30;

/**
 * Хэдэн миллисекунд хүлээгээд нэгтгэж бичих вэ.
 *
 * Сет тэмдэглэх бүрд feed-ийг бүтнээр нь дахин барих нь (14 хоногийн үр дүн +
 * 30 хоногийн хайлт + хоёр удаагийн JSON.stringify) шаардлагагүй ажил.
 * Хэрэглэгч 7 дасгалын 26 сетийг дараалан дарахад тэр ажил 26 удаа давтагдана.
 * Одоо дарааллын ТӨГСГӨЛД нэг л удаа бичигдэнэ.
 */
const PUBLISH_DEBOUNCE_MS = 300;

// Сүүлд бичсэн агуулга (updatedAt-гүйгээр). Ижил утга дахин бичихээс сэргийлнэ.
/** @type {string|null} */
let lastFingerprint = null;
let seeded = false;

/** @type {ReturnType<typeof setTimeout>|null} */
let pending = null;

/**
 * Хуудас дахин ачаалагдахад ч дэмий бичихгүйн тулд одоо байгаа gym:bridge-ээс
 * хурууны хээг нь нэг удаа сэргээнэ. Эвдэрсэн байвал зүгээр алгасна.
 */
function seedFingerprint() {
  seeded = true;
  const stored = readJson(BRIDGE_KEY);
  if (!stored || !stored.value || typeof stored.value !== 'object') {
    lastFingerprint = null;
    return;
  }
  const previous = /** @type {Record<string, unknown>} */ (stored.value);
  try {
    lastFingerprint = JSON.stringify({
      v: previous.v,
      app: previous.app,
      label: previous.label,
      status: previous.status,
      events: previous.events
    });
  } catch (err) {
    // Хуучин утга эвдэрсэн бол тоохгүй — дараагийн бичилт дээр дарж бичигдэнэ.
    lastFingerprint = null;
  }
}

/**
 * Тухайн өдрийн хөтөлбөрийн тодорхойлолт. Хадгалсан dayId нь эрх мэдэлтэй.
 * @param {string} date
 * @param {string|null|undefined} dayId
 * @returns {Day|null}
 */
function dayOf(date, dayId) {
  return (dayId ? getDayById(dayId) : null) || getDayForDate(date);
}

/**
 * Өдрийн үр дүнг { total, done } болгож цэвэрлэнэ (done нь total-оос хэтрэхгүй).
 * @param {DayResult|null|undefined} result
 * @returns {{total: number, done: number}}
 */
function countsOf(result) {
  const total = Math.max(0, Number(result && result.total) || 0);
  const done = Math.min(Math.max(0, Number(result && result.done) || 0), total);
  return { total, done };
}

/**
 * Event-ийн цаг (ms). Дуусгасан өдөр бол дуусгасан агшин, эс бөгөөс тухайн
 * өдрийн үд дунд — ингэснээр эрэмбэ нь үргэлж огнооны дарааллаар гарна.
 * completedAt нь орон нутгийн "YYYY-MM-DD HH:MM" (data.localTimestamp).
 * @param {string} date
 * @param {string|null} completedAt
 * @returns {number}
 */
function eventTime(date, completedAt) {
  if (isTimestamp(completedAt)) {
    const stamp = parseDateString(/** @type {string} */ (completedAt).slice(0, 10));
    stamp.setHours(
      Number(/** @type {string} */ (completedAt).slice(11, 13)),
      Number(/** @type {string} */ (completedAt).slice(14, 16)),
      0,
      0
    );
    return stamp.getTime();
  }
  return parseDateString(date).getTime();
}

/**
 * Дасгалын өдөр бүрд НЭГ event, хуучнаас шинэ рүү.
 *
 * - id = "gym-<YYYY-MM-DD>" — өдрийг дахин нээхэд давхар тоологдохгүй.
 * - type: бүх дасгал тэмдэглэгдсэн бол "workout.completed", үгүй бол "workout.partial".
 *   Өдрийн явцад "partial" бичигдээд дараа нь "completed" болж сайжирч болно —
 *   уншигч тал id-гаар давхардлыг шүүдэг тул энэ нь аюулгүй.
 * - Нэг ч дасгал дуусгаагүй өдөр (done = 0) болон амралтын өдөр event үүсгэхгүй.
 * @returns {Array<{id: string, at: number, type: string, value: number, detail: string}>}
 */
function buildEvents() {
  const rows = [];

  for (const { date, result } of getRecentDays(todayString(), BRIDGE_DAYS)) {
    if (!result) continue;

    const { total, done } = countsOf(result);
    if (total <= 0 || done <= 0) continue;

    const day = dayOf(date, result.dayId);
    const name = day ? day.title : '';

    rows.push({
      id: `${BRIDGE_APP}-${date}`,
      at: eventTime(date, result.completedAt),
      type: done >= total ? 'workout.completed' : 'workout.partial',
      value: done,
      detail: name ? `${done}/${total} · ${name}` : `${done}/${total}`
    });
  }

  rows.reverse(); // getRecentDays нь шинээс хуучин руу өгдөг
  return rows.slice(-BRIDGE_MAX_EVENTS);
}

/**
 * Хамгийн сүүлд дасгал хийсэн өдөр ("YYYY-MM-DD"), олдохгүй бол null.
 * @returns {string|null}
 */
function findLastWorkout() {
  for (const { date, result } of getRecentDays(todayString(), HISTORY_DAYS)) {
    if (!result) continue;
    const { total, done } = countsOf(result);
    if (total > 0 && done > 0) return date;
  }
  return null;
}

/**
 * Уншигч тал энэ объектыг бүтнээр нь хадгална (тайлбарлахгүй) —
 * тиймээс энд хүн уншихад ойлгомжтой утга л байх ёстой.
 */
function buildStatus() {
  const date = todayString();
  const result = getDayResult(date);
  const day = dayOf(date, result ? result.dayId : null);

  const total = day && !day.isRest ? day.exercises.length : 0;
  const done = Math.min(countsOf(result).done, total);

  return {
    todayPlan: day ? day.title : '',
    todayProgress: `${done}/${total}`,
    lastWorkout: findLastWorkout()
  };
}

/**
 * gym:bridge түлхүүрийг ШУУД шинэчилнэ.
 * Алдаа гарвал safe-storage нь чимээгүй барина — апп унахгүй.
 * @returns {boolean} үнэхээр бичсэн эсэх
 */
export function publishBridge() {
  cancelPending();
  try {
    if (!seeded) seedFingerprint();

    const payload = {
      v: BRIDGE_VERSION,
      app: BRIDGE_APP,
      label: BRIDGE_LABEL,
      status: buildStatus(),
      events: buildEvents()
    };

    const fingerprint = JSON.stringify(payload);
    if (fingerprint === lastFingerprint) return false;

    const ok = writeJson(BRIDGE_KEY, { ...payload, updatedAt: Date.now() });
    // Бичилт бүтээгүй бол хурууны хээг ШИНЭЧЛЭХГҮЙ — эс бөгөөс хадгалалт
    // сэргэсний дараа "аль хэдийн бичсэн" гэж андуурч мөнхөд алгасна.
    if (ok) lastFingerprint = fingerprint;
    return ok;
  } catch (err) {
    console.warn('gym:bridge бичигдсэнгүй:', err);
    return false;
  }
}

function cancelPending() {
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
}

/**
 * Богино хугацааны дараа нэгтгэж бичнэ. Дараалсан тэмдэглэгээ бүрд биш,
 * тэдгээрийн ТӨГСГӨЛД нэг л удаа ажиллана.
 */
export function schedulePublish() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    publishBridge();
  }, PUBLISH_DEBOUNCE_MS);
}

/**
 * Хүлээгдэж байгаа бичилтийг ЯГ ОДОО гүйцээнэ.
 * Апп-ыг хаах / далд болгох агшинд дуудагдана — эс бөгөөс сүүлийн хэдэн сет
 * feed рүү гарч амжихгүй үлдэнэ.
 * @returns {boolean}
 */
export function flushBridge() {
  return publishBridge();
}

/**
 * Тестэд зориулж дотоод төлөвийг тэглэнэ (хуруу хээ, хүлээгдэж буй бичилт).
 * Аппын ажиллагаанд дуудагдахгүй.
 */
export function __resetForTests() {
  cancelPending();
  lastFingerprint = null;
  seeded = false;
}
