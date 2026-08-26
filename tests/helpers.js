// tests/helpers.js — хөтөчгүй орчинд аппын модулиудыг ажиллуулах тулгуур.
//
// Апп нь build алхамгүй, jsdom-гүй. Тиймээс тестэд хэрэгтэй цорын ганц зүйл
// бол `window.localStorage` / `window.sessionStorage` — safe-storage.js
// зөвхөн эдгээрт ханддаг бөгөөд ханддаг нь ДУУДАГДАХ үедээ тул модулиудыг
// import хийхээс өмнө энд суулгасан хиймэл хадгалалт хангалттай.

/**
 * Санах ойд ажиллах localStorage. Хүсвэл бичилтийг "зай дүүрсэн" болгож
 * бүтэлгүйтүүлж болно — аппын алдаа боловсруулалтыг шалгахад хэрэгтэй.
 */
export class MemoryStorage {
  constructor() {
    /** @type {Map<string, string>} */
    this.map = new Map();
    this.failWrites = false;
    this.throwOnRead = false;
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key) {
    if (this.throwOnRead) throw new Error('read blocked');
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrites) {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

/** Хиймэл хадгалалтыг global дээр суулгана. Модуль import хийхээс ӨМНӨ дуудна. */
export function installStorage() {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  globalThis.window = { localStorage: local, sessionStorage: session };
  return { local, session };
}

/**
 * Тестийн хөтөлбөр: d1..d7, d3/d7 нь амралт — бодит program.json-той ижил бүтэц.
 * @param {number} [exercisesPerDay]
 * @param {number} [setsPerExercise]
 */
export function sampleProgramSource(exercisesPerDay = 2, setsPerExercise = 3) {
  const days = [];
  for (let i = 1; i <= 7; i += 1) {
    const rest = i === 3 || i === 7;
    days.push({
      id: `d${i}`,
      title: rest ? 'Амралт' : `Өдөр ${i}`,
      exercises: rest
        ? []
        : Array.from({ length: exercisesPerDay }, (_, j) => ({
          id: `e${i}0${j + 1}`,
          name: `Дасгал ${i}.${j + 1}`,
          sets: setsPerExercise,
          reps: '10',
          rest: 60
        }))
    });
  }
  return { version: 1, name: 'Тестийн хөтөлбөр', restDays: ['d3', 'd7'], days };
}

/** console.warn-ыг түр залгиж, дуудалтуудыг буцаана. */
export function muteWarnings(fn) {
  const original = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return calls;
}
