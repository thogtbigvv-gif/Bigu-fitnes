// timer.js — сет хоорондын амралтын тоолуур.
//
// program.json дотор `rest` секунд бичигдсэн байсан ч удаан хугацаанд зөвхөн
// текстээр харагддаг байв. Одоо сет тэмдэглэх бүрд тэр тоо ажиллаж эхэлнэ.
//
// Зарчим:
// - Нэг л удаад НЭГ тоолуур. Шинийг эхлүүлэхэд хуучин нь дуусна.
// - Үлдсэн хугацааг ҮРГЭЛЖ `endsAt - Date.now()`-оос тооцно. Апп-ыг далд
//   болгоод буцаж ирэхэд ч тоо зөв байна (interval алгасагдсан ч хамаагүй).
// - Тоолуур бүх дэлгэцийг дахин зурахгүй — зөвхөн өөрийн DOM зангилааг
//   шинэчилнэ. Ингэснээр тэмдэглэх хөдөлгөөн секунд тутам тасалдахгүй.
// - Тоолуур sessionStorage дотор амьд үлдэнэ. Заал дээр утас түгжигдээд
//   хуудас дахин ачаалагдвал 2 минутын амралт тэглэгдэхгүй.

import { NAMESPACE, formatClock } from './data.js';
import { readJson, removeRaw, writeJson } from './safe-storage.js';

/** @typedef {import('./types.js').TimerSnapshot} TimerSnapshot */

/** Тоолуурын түр төлөв. sessionStorage — таб хаагдвал үлдэх шаардлагагүй. */
const TIMER_KEY = NAMESPACE + 'timer';

/** Хэт эрт (хуучирсан) төлөвийг сэргээхгүй — 2 цагаас хэтэрсэн бол хаяна. */
const MAX_RESTORE_MS = 2 * 60 * 60 * 1000;

/**
 * Идэвхтэй тоолуур.
 * @type {{exerciseId: string, seconds: number, endsAt: number, finished: boolean}|null}
 */
let active = null;

/** @type {ReturnType<typeof setInterval>|null} */
let handle = null;

/** DOM дээрх зангилаа: <div class="timer" data-timer="<exerciseId>"> */
function node() {
  if (!active || typeof document === 'undefined') return null;
  const found = document.querySelector('[data-timer]');
  return found instanceof HTMLElement && found.dataset.timer === active.exerciseId
    ? found
    : null;
}

function remainingSeconds() {
  if (!active) return 0;
  return Math.max(0, Math.ceil((active.endsAt - Date.now()) / 1000));
}

function clearHandle() {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
}

/** Идэвхтэй төлөвийг sessionStorage-д тусгана (алдаа гарвал чимээгүй өнгөрнө). */
function persist() {
  if (!active || active.finished) {
    removeRaw(TIMER_KEY, 'session');
    return;
  }
  writeJson(
    TIMER_KEY,
    { exerciseId: active.exerciseId, seconds: active.seconds, endsAt: active.endsAt },
    'session'
  );
}

/**
 * Зангилааг одоогийн үлдэгдэлд тааруулна.
 *
 * Урьд нь энд зөвхөн тоо ба өргөн шинэчлэгддэг байсан тул тоолуур 0 хүрэхэд
 * шошго нь "Амралт", товч нь "Болих" гэж үлдэж, дэлгэц дахин зурагдтал
 * хагас төлөвтэй харагддаг байв. Одоо бүх хэсэг зэрэг шилжинэ.
 */
function paint() {
  const remaining = remainingSeconds();
  const target = node();
  const done = remaining === 0;

  if (target && active) {
    const label = target.querySelector('.timer__label');
    const value = target.querySelector('.timer__value');
    const stop = target.querySelector('.timer__stop');
    const fill = /** @type {HTMLElement|null} */ (target.querySelector('.timer__fill'));

    if (label) label.textContent = done ? 'Амралт дууслаа' : 'Амралт';
    if (value) value.textContent = done ? 'Бэлэн' : formatClock(remaining);
    if (stop) stop.textContent = done ? 'Хаах' : 'Болих';
    if (fill) {
      const pct = active.seconds > 0 ? (remaining / active.seconds) * 100 : 0;
      fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }
    target.classList.toggle('is-done', done);
  }

  if (done) settle();
}

/** Хугацаа дуусахад: interval-аа зогсооно, гэхдээ "Бэлэн" төлөв дэлгэц дээр үлдэнэ. */
function settle() {
  clearHandle();
  if (active && !active.finished) {
    active.finished = true;
    removeRaw(TIMER_KEY, 'session');
    // Дуу байхгүй — чимээгүй, богино чичиргээ. Дэмждэггүй бол алгасна.
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(40);
      }
    } catch (err) {
      /* чичиргээ бол нэмэлт тав тух, алдаа нь юуг ч зогсоохгүй */
    }
  }
}

/**
 * Тоолуур эхлүүлнэ. seconds <= 0 бол зүгээр зогсооно.
 * @param {string} exerciseId
 * @param {number} seconds
 */
export function start(exerciseId, seconds) {
  stop();
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!exerciseId || total <= 0) return;

  active = {
    exerciseId,
    seconds: total,
    endsAt: Date.now() + total * 1000,
    finished: false
  };

  persist();
  handle = setInterval(paint, 500);
  paint();
}

/** Тоолуурыг бүрэн болиулна. */
export function stop() {
  clearHandle();
  active = null;
  removeRaw(TIMER_KEY, 'session');
}

/**
 * Тухайн дасгал дээр тоолуур ажиллаж байна уу.
 * @param {string} exerciseId
 * @returns {boolean}
 */
export function isActiveFor(exerciseId) {
  return !!active && active.exerciseId === exerciseId;
}

/**
 * View-д зориулсан хормын хувилбар. Дахин зурагдсаны дараа тоолуурыг
 * зөв төлөвтэйгээр нь сэргээхэд ашиглагдана.
 * @returns {TimerSnapshot|null}
 */
export function snapshot() {
  if (!active) return null;
  const remaining = remainingSeconds();
  return {
    exerciseId: active.exerciseId,
    seconds: active.seconds,
    remaining,
    finished: remaining === 0
  };
}

/**
 * Дэлгэц дахин зурагдсаны дараа дуудна — шинэ зангилааг одоогийн
 * үлдэгдэлтэй нь тааруулна.
 */
export function refresh() {
  if (active) paint();
}

/**
 * Хуудас дахин ачаалагдсаны дараа идэвхтэй амралтыг сэргээнэ.
 *
 * Зөвхөн ӨНӨӨДРИЙН хөтөлбөрт байгаа дасгалын тоолуурыг сэргээнэ — хөтөлбөр
 * солигдсон бол хуучин id-тай тоолуур хаана ч харагдахгүй хий ажиллана.
 * @param {Iterable<string>} validExerciseIds
 * @returns {boolean} сэргээгдсэн эсэх
 */
export function restore(validExerciseIds) {
  const stored = readJson(TIMER_KEY, 'session');
  if (!stored || !stored.value || typeof stored.value !== 'object') return false;

  const saved = /** @type {{exerciseId?: unknown, seconds?: unknown, endsAt?: unknown}} */ (
    stored.value
  );
  const exerciseId = typeof saved.exerciseId === 'string' ? saved.exerciseId : '';
  const seconds = Math.round(Number(saved.seconds) || 0);
  const endsAt = Number(saved.endsAt) || 0;
  const remaining = endsAt - Date.now();

  const allowed = new Set(validExerciseIds || []);
  const usable =
    exerciseId &&
    seconds > 0 &&
    remaining > 0 &&
    remaining <= MAX_RESTORE_MS &&
    allowed.has(exerciseId);

  if (!usable) {
    removeRaw(TIMER_KEY, 'session');
    return false;
  }

  clearHandle();
  active = { exerciseId, seconds, endsAt, finished: false };
  handle = setInterval(paint, 500);
  return true;
}
