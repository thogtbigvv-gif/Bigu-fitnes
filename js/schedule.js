// schedule.js — "энэ өдөр ЯМАР бэлтгэл хийгдэх вэ" гэдгийг эцэслэн шийднэ.
//
// Хөтөлбөр нь гарагт бэхлэгдсэн (d1 = Даваа ... d7 = Ням). Гэхдээ амьдрал
// төлөвлөгөөг дагадаггүй: ажлаас ядраад маргаашийн бэлтгэлээ хойшлуулж,
// амралтын өдрөө нөхөж хийх хэрэг гарна. Тиймээс энэ давхарга нэмэгдэв:
//
//     хөтөлбөрийн гарагийн зураглал  +  хэрэглэгчийн солилцоо  =  бодит өдөр
//
// Солилцоо нь ҮРГЭЛЖ ХОСООРОО явна: "Пүрэвийн бэлтгэлийг Лхагва руу зөөв"
// гэдэг нь "Лхагвын амралт Пүрэв рүү очив" гэсэнтэй яг ижил утгатай.
// Ингэснээр бэлтгэл ХЭЗЭЭ Ч алга болохгүй, давхарлахгүй, өдөр ч хоосрохгүй:
//   - хоёр өдөр нэг л удаа солигдоно (хагас холбоос гарахгүй),
//   - зөөгдсөн өдөр "хийгээгүй" болж цувааг таслахгүй — ажил тэнд байхаа больсон.
//
// Давхаргын байрлал: program.js (цэвэр хөтөлбөр) ба storage.js (цэвэр
// хадгалалт) хоёрын ДЭЭР. stats.js, ui.js, views/* бүгд өдрийг ЭНДЭЭС авна,
// program.js-ээс шууд авахаа больсон.

import { WEEK_DAYS, isDateString, startOfWeek, shiftDate, todayString } from './data.js';
import { getDayForDate as naturalDay } from './program.js';
import { clearSwap, getSwapPartner, setSwapPair } from './storage.js';

/** @typedef {import('./types.js').Day} Day */
/** @typedef {import('./types.js').SwapOption} SwapOption */

/** Солих цонхонд хэдэн өдрийн хүрээ харуулах вэ (энэ долоо хоног + дараагийнх). */
const SWAP_WINDOW_DAYS = WEEK_DAYS * 2;

/**
 * Тухайн өдөр АЛЬ өдрийн төлөвлөгөөг хийх вэ.
 * Солилцоогүй бол өөрийнх нь огноо.
 * @param {string} date
 * @returns {string}
 */
export function planDate(date) {
  return getSwapPartner(date) || date;
}

/**
 * Огнооны бодит өдөр (солилцоог тооцсон).
 * @param {string} date
 * @returns {Day|null}
 */
export function dayForDate(date) {
  return naturalDay(planDate(date));
}

/**
 * Энэ өдөр солигдсон эсэх.
 * @param {string} date
 * @returns {boolean}
 */
export function isSwapped(date) {
  return Boolean(getSwapPartner(date));
}

/**
 * Хосолсон огноо (солигдоогүй бол null).
 * @param {string} date
 * @returns {string|null}
 */
export function swapPartner(date) {
  return getSwapPartner(date);
}

/**
 * Хоёр өдрийн бэлтгэлийг солино.
 * @param {string} date
 * @param {string} other
 * @returns {boolean} өөрчлөгдсөн эсэх
 */
export function swapDays(date, other) {
  if (!isDateString(date) || !isDateString(other) || date === other) return false;
  return setSwapPair(date, other);
}

/**
 * Солилцоог буцаана — хоёр өдөр хоёулаа өөрийн байрандаа очно.
 * @param {string} date
 * @returns {boolean} өөрчлөгдсөн эсэх
 */
export function undoSwap(date) {
  return clearSwap(date);
}

/**
 * Солих боломжтой өдрүүд: энэ долоо хоногийн Даваа гарагаас эхлээд 14 хоног.
 *
 * Яагаад ийм хүрээ вэ: солилцоо нь "энэ долоо хоногийн дотор өдрөө сольж
 * байна" гэсэн үйлдэл. Сарын цаадах өдөртэй солих нь төлөвлөгөөг зөөх биш,
 * харин өөр хөтөлбөр болно.
 *
 * `blocked` нь тэмдэглэгээтэй өдрийг заана: хийчихсэн бэлтгэлийг зөөвөл
 * тэмдэглэгээ нь шинэ төлөвлөгөөнд таарахгүй болж устах эрсдэлтэй.
 *
 * @param {string} date Одоо харж байгаа огноо
 * @param {(candidate: string) => boolean} hasMarks Тэмдэглэгээтэй эсэхийг хэлэх функц
 * @param {string} [today]
 * @returns {SwapOption[]}
 */
export function swapOptions(date, hasMarks, today = todayString()) {
  const start = startOfWeek(date < today ? date : today);
  /** @type {SwapOption[]} */
  const options = [];

  for (let i = 0; i < SWAP_WINDOW_DAYS; i += 1) {
    const candidate = shiftDate(start, i);
    if (candidate === date) continue;

    options.push({
      date: candidate,
      day: dayForDate(candidate),
      isToday: candidate === today,
      isPast: candidate < today,
      blocked: hasMarks(candidate)
    });
  }

  return options;
}
