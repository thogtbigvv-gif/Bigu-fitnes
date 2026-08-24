// timer.js — сет хоорондын амралтын тоолуур.
//
// program.json дотор `rest` секунд бичигдсэн байсан ч өнөөг хүртэл зөвхөн
// текстээр харагддаг байв. Одоо сет тэмдэглэх бүрд тэр тоо ажиллаж эхэлнэ.
//
// Зарчим:
// - Нэг л удаад НЭГ тоолуур. Шинийг эхлүүлэхэд хуучин нь дуусна.
// - Үлдсэн хугацааг ҮРГЭЛЖ `endsAt - Date.now()`-оос тооцно. Апп-ыг далд
//   болгоод буцаж ирэхэд ч тоо зөв байна (interval алгасагдсан ч хамаагүй).
// - Тоолуур бүх дэлгэцийг дахин зурахгүй — зөвхөн өөрийн DOM зангилааг
//   шинэчилнэ. Ингэснээр тэмдэглэх хөдөлгөөн секунд тутам тасалдахгүй.

import { formatClock } from './data.js';

/** Идэвхтэй тоолуур: { exerciseId, seconds, endsAt } эсвэл null. */
let active = null;
let handle = null;

/** DOM дээрх зангилаа: <div class="timer" data-timer="<exerciseId>"> */
function node() {
  if (!active) return null;
  const found = document.querySelector('[data-timer]');
  return found && found.dataset.timer === active.exerciseId ? found : null;
}

function remainingSeconds() {
  if (!active) return 0;
  return Math.max(0, Math.ceil((active.endsAt - Date.now()) / 1000));
}

function paint() {
  const remaining = remainingSeconds();
  const target = node();

  if (target) {
    const value = target.querySelector('.timer__value');
    const fill = target.querySelector('.timer__fill');
    if (value) value.textContent = remaining > 0 ? formatClock(remaining) : 'Бэлэн';
    if (fill) fill.style.width = `${(remaining / active.seconds) * 100}%`;
    target.classList.toggle('is-done', remaining === 0);
  }

  if (remaining === 0) settle();
}

/** Хугацаа дуусахад: interval-аа зогсооно, гэхдээ "Бэлэн" төлөв дэлгэц дээр үлдэнэ. */
function settle() {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
  if (active && !active.finished) {
    active = { ...active, finished: true };
    // Дуу байхгүй — чимээгүй, богино чичиргээ. Дэмждэггүй бол алгасна.
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);
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
  const total = Number(seconds) || 0;
  if (!exerciseId || total <= 0) return;

  active = {
    exerciseId,
    seconds: total,
    endsAt: Date.now() + total * 1000,
    finished: false
  };

  handle = setInterval(paint, 500);
  paint();
}

/** Тоолуурыг бүрэн болиулна. */
export function stop() {
  if (handle) {
    clearInterval(handle);
    handle = null;
  }
  active = null;
}

/** Тухайн дасгал дээр тоолуур ажиллаж байна уу. */
export function isActiveFor(exerciseId) {
  return !!active && active.exerciseId === exerciseId;
}

/**
 * View-д зориулсан хормын хувилбар. Дахин зурагдсаны дараа тоолуурыг
 * зөв төлөвтэйгээр нь сэргээхэд ашиглагдана.
 * @returns {{exerciseId:string, seconds:number, remaining:number, finished:boolean}|null}
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
