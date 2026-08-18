// bridge.js — гадагш чиглэсэн "activity feed".
// Ижил GitHub Pages origin дээр байрлах өөр апп (summer-project) энэ түлхүүрийг
// уншиж миний дасгалын үр дүнг XP болгоно.
//
// Энэ файл "gym:state_v1"-д ХЭЗЭЭ Ч бичихгүй — зөвхөн уншина.
// Бичдэг цорын ганц түлхүүр нь "gym:bridge".

import { NAMESPACE, calcXp, todayString } from './data.js';
import { getDayById, getDayForDate } from './program.js';
import { getDayResult, getRecentDays } from './storage.js';

export const BRIDGE_KEY = NAMESPACE + 'bridge';

const BRIDGE_VERSION = 1;
const BRIDGE_APP = 'Gym';

/** Хэдэн хоногийн түүхийг гадагш харуулах вэ. */
const BRIDGE_DAYS = 14;

/** Хичнээн ч түүхтэй байлаа гэсэн энэ тооноос хэтрэхгүй. */
const BRIDGE_MAX = 30;

// Сүүлд бичсэн агуулга (updatedAt-гүйгээр). Ижил утга дахин бичихээс сэргийлнэ.
let lastFingerprint = null;
let seeded = false;

/**
 * Хуудас дахин ачаалагдахад ч дэмий бичихгүйн тулд одоо байгаа gym:bridge-ээс
 * хурууны хээг нь нэг удаа сэргээнэ. Эвдэрсэн байвал зүгээр алгасна.
 */
function seedFingerprint() {
  seeded = true;
  try {
    const raw = window.localStorage.getItem(BRIDGE_KEY);
    if (!raw) return;
    const previous = JSON.parse(raw);
    lastFingerprint = JSON.stringify({
      v: previous.v,
      app: previous.app,
      today: previous.today,
      sessions: previous.sessions
    });
  } catch (err) {
    // Хуучин утга эвдэрсэн бол тоохгүй — дараагийн бичилт дээр дарж бичигдэнэ.
    lastFingerprint = null;
  }
}

/** Тухайн өдрийн хөтөлбөрийн тодорхойлолт. Хадгалсан dayId нь эрх мэдэлтэй. */
function dayOf(date, dayId) {
  return (dayId ? getDayById(dayId) : null) || getDayForDate(date);
}

/** Өнөөдрийн байдал. Амралтын өдөр бол total/done тэг, XP нь амралтынх. */
function buildToday() {
  const date = todayString();
  const result = getDayResult(date);
  const day = dayOf(date, result ? result.dayId : null);

  if (!day) {
    return { date, dayId: '', title: '', isRest: false, total: 0, done: 0, xp: 0 };
  }

  const isRest = day.isRest;
  const total = isRest ? 0 : day.exercises.length;
  const done = isRest || !result ? 0 : Math.min(result.done, total);

  return {
    date,
    dayId: day.id,
    title: day.title,
    isRest,
    total,
    done,
    xp: calcXp({ done, total, isRest })
  };
}

/**
 * Сүүлийн BRIDGE_DAYS хоногийн тэмдэглэгээтэй өдрүүд, хуучнаас шинэ рүү.
 * Огноо бүр НЭГ бичлэгтэй — өдрийн явцад done/xp өсдөг, уншигч тал зөрүүг тооцно.
 */
function buildSessions() {
  const recent = getRecentDays(todayString(), BRIDGE_DAYS); // шинээс хуучин руу

  const rows = [];
  for (const { date, result } of recent) {
    if (!result) continue;

    const day = dayOf(date, result.dayId);
    const total = Number(result.total) || 0;
    const done = Math.min(Number(result.done) || 0, total);

    rows.push({
      date,
      dayId: result.dayId,
      title: day ? day.title : '',
      done,
      total,
      xp: calcXp({ done, total, isRest: false }),
      complete: total > 0 && done >= total,
      completedAt: result.completedAt || null
    });
  }

  rows.reverse(); // хуучнаас шинэ рүү
  return rows.slice(-BRIDGE_MAX);
}

function buildPayload() {
  return {
    v: BRIDGE_VERSION,
    app: BRIDGE_APP,
    today: buildToday(),
    sessions: buildSessions()
  };
}

/**
 * gym:bridge түлхүүрийг шинэчилнэ.
 * Алдаа гарвал (private mode, quota) console.warn-оор дуусна — апп унахгүй.
 * @returns {boolean} үнэхээр бичсэн эсэх
 */
export function publishBridge() {
  try {
    if (!seeded) seedFingerprint();

    const payload = buildPayload();
    const fingerprint = JSON.stringify(payload);
    if (fingerprint === lastFingerprint) return false;

    window.localStorage.setItem(BRIDGE_KEY, JSON.stringify({
      v: payload.v,
      app: payload.app,
      updatedAt: Date.now(),
      today: payload.today,
      sessions: payload.sessions
    }));

    lastFingerprint = fingerprint;
    return true;
  } catch (err) {
    console.warn('gym:bridge бичигдсэнгүй:', err);
    return false;
  }
}
