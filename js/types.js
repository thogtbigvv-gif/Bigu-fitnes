// types.js — АЖИЛЛАГААНЫ КОД БИШ.
//
// Төсөл нь build алхамгүй, цэвэр ES module дээр явдаг. Гэхдээ "энэ объект
// дотор яг юу байдаг вэ" гэдгийг таамаглах шаардлагагүй байх ёстой.
// Тиймээс бүх нийтлэг бүтцийг ЭНД нэг удаа тодорхойлж, бусад файл
// `@typedef {import('./types.js').Day} Day` гэж татаж хэрэглэнэ.
//
// jsconfig.json дотор `checkJs: true` тавигдсан тул editor / `tsc --noEmit`
// эдгээр төрлийг ашиглан алдааг ГҮЙЛГЭХЭЭС ӨМНӨ барина.

/**
 * Нэг дасгал. program.json-оос уншигдаж, normalizeExercise() дамжина.
 * @typedef {Object} Exercise
 * @property {string} id      Өдөр дотроо давтагдахгүй тодорхойлогч
 * @property {string} name    Дэлгэц дээр гарах нэр
 * @property {number} sets    Сетийн тоо (>= 1)
 * @property {string} reps    Давталт — "8-10", "45 сек" гэх мэт чөлөөт текст
 * @property {number} rest    Сет хоорондын амралт, секундээр (0 = тоолуургүй)
 * @property {string} note    Нэмэлт сануулга ("" бол харагдахгүй)
 */

/**
 * Хөтөлбөрийн нэг өдөр.
 * @typedef {Object} Day
 * @property {string} id
 * @property {string} title
 * @property {Exercise[]} exercises
 * @property {boolean} isRest  Амралтын өдөр эсэх (restDays эсвэл дасгалгүй)
 */

/**
 * Бүтэн хөтөлбөр.
 * @typedef {Object} Program
 * @property {number} version
 * @property {string} name
 * @property {Day[]} days
 * @property {string[]} restDays
 */

/**
 * Сет тэмдэглэгээ: дасгалын id -> сет бүрийн төлөв.
 * @typedef {Record<string, boolean[]>} SetMarks
 */

/**
 * localStorage дотор хадгалагдах нэг өдрийн бичлэг.
 * @typedef {Object} Session
 * @property {string} date        "YYYY-MM-DD"
 * @property {string} dayId       Тэр үед хүчинтэй байсан өдрийн id
 * @property {number} done        Бүрэн дуусгасан ДАСГАЛын тоо
 * @property {number} total       Тухайн өдрийн нийт дасгалын тоо
 * @property {string|null} completedAt  "YYYY-MM-DD HH:MM" эсвэл null
 * @property {SetMarks} sets
 */

/**
 * Гадагш гарах цэвэр үр дүн (sets-гүй). bridge.js яг үүнийг уншина.
 * @typedef {Object} DayResult
 * @property {string} date
 * @property {string} dayId
 * @property {number} done
 * @property {number} total
 * @property {string|null} completedAt
 */

/**
 * localStorage-ийн бүтэн төлөв.
 * @typedef {Object} AppState
 * @property {number} version
 * @property {Record<string, Session>} sessions
 */

/**
 * Өдрийн бодит төлөв (stats.dayStatus).
 * @typedef {'done'|'partial'|'rest'|'none'} StatusKey
 */

/**
 * Дэлгэц дээр харуулах төлөв — ирээдүйн өдөр "upcoming" болно.
 * @typedef {StatusKey|'upcoming'} DisplayKey
 */

/**
 * @typedef {Object} DayStatus
 * @property {StatusKey} key
 * @property {Day|null} day
 * @property {number} done       Дуусгасан дасгал
 * @property {number} total      Нийт дасгал
 * @property {number} setsDone   Дуусгасан сет
 * @property {number} setsTotal  Нийт сет
 */

/**
 * Долоо хоног / түүхийн нэг мөр.
 * @typedef {Object} DayRow
 * @property {string} date
 * @property {DayStatus} status
 * @property {DisplayKey} key
 */

/**
 * Тоолуурын хормын хувилбар (timer.snapshot).
 * @typedef {Object} TimerSnapshot
 * @property {string} exerciseId
 * @property {number} seconds
 * @property {number} remaining
 * @property {boolean} finished
 */

export {};
