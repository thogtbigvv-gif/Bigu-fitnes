// Өдөр солилцоо нь хэрэглэгчийн ТӨЛӨВЛӨГӨӨГ өөрчилдөг тул алдаа гарвал
// бэлтгэл бүхэлдээ алга болох, эсвэл нэг өдөр хоёр удаа давхарлах эрсдэлтэй.
//
// Цорын ганц дүрэм: солилцоо ҮРГЭЛЖ ХАРИЛЦАН. Доорх тестүүд яг түүнийг барина.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installStorage, sampleProgramSource } from './helpers.js';

const stores = installStorage();

const { STATE_KEY } = await import('../js/data.js');
const { loadProgram } = await import('../js/program.js');
const storage = await import('../js/storage.js');
const stats = await import('../js/stats.js');
const schedule = await import('../js/schedule.js');

// program.js нь fetch дээр ажилладаг — тестэд хиймэл хариу өгнө.
const source = sampleProgramSource(2, 3);
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => source
});
const program = await loadProgram();

// Тестийн долоо хоног: 2026-08-31 бол Даваа (d1), 2026-09-02 Лхагва (d3, амралт).
const MONDAY = '2026-08-31';
const WEDNESDAY = '2026-09-02';   // амралт
const THURSDAY = '2026-09-03';    // d4 — бэлтгэлийн өдөр
const SUNDAY = '2026-09-06';      // d7 — амралт

function reset() {
  stores.local.clear();
  stores.local.failWrites = false;
  storage.__resetForTests();
  stats.invalidateStats();
}

/** Тухайн өдрийн бүх сетийг тэмдэглэнэ. */
function fillDay(date) {
  const day = schedule.dayForDate(date);
  const sets = {};
  for (const exercise of day.exercises) {
    sets[exercise.id] = Array.from({ length: exercise.sets }, () => true);
  }
  storage.saveDay({
    date,
    dayId: day.id,
    sets,
    done: day.exercises.length,
    total: day.exercises.length
  });
  stats.invalidateStats();
}

test('солилцоогүй үед өдөр нь хөтөлбөрийн гарагаараа тодорхойлогдоно', () => {
  reset();
  assert.equal(schedule.dayForDate(MONDAY).id, 'd1');
  assert.equal(schedule.dayForDate(WEDNESDAY).id, 'd3');
  assert.equal(schedule.dayForDate(WEDNESDAY).isRest, true);
  assert.equal(schedule.isSwapped(WEDNESDAY), false);
});

test('солилцоо ХОЁР ТАЛДАА үйлчилнэ — бэлтгэл алга болохгүй', () => {
  reset();
  assert.equal(schedule.swapDays(WEDNESDAY, THURSDAY), true);

  // Пүрэвийн бэлтгэл Лхагва руу шилжив...
  assert.equal(schedule.dayForDate(WEDNESDAY).id, 'd4');
  // ...Лхагвын амралт Пүрэв рүү очив. Ажил хоёр дахин хийгдэхгүй.
  assert.equal(schedule.dayForDate(THURSDAY).id, 'd3');

  assert.equal(schedule.isSwapped(WEDNESDAY), true);
  assert.equal(schedule.swapPartner(THURSDAY), WEDNESDAY);
});

test('солилцоог буцаахад хоёр өдөр хоёулаа байрандаа очно', () => {
  reset();
  schedule.swapDays(WEDNESDAY, THURSDAY);
  assert.equal(schedule.undoSwap(THURSDAY), true);

  assert.equal(schedule.dayForDate(WEDNESDAY).id, 'd3');
  assert.equal(schedule.dayForDate(THURSDAY).id, 'd4');
  assert.deepEqual(storage.getSwaps(), {}, 'хагас холбоос үлдэх ёсгүй');
});

test('шинэ солилцоо хуучныг нь тайлна — гурав дахь өдөр хосгүй үлдэхгүй', () => {
  reset();
  schedule.swapDays(WEDNESDAY, THURSDAY);
  schedule.swapDays(WEDNESDAY, SUNDAY);

  // Пүрэв өөрийн байрандаа буцсан байх ёстой.
  assert.equal(schedule.dayForDate(THURSDAY).id, 'd4');
  assert.equal(schedule.dayForDate(WEDNESDAY).id, 'd7');
  assert.equal(schedule.dayForDate(SUNDAY).id, 'd3');

  const swaps = storage.getSwaps();
  for (const [date, partner] of Object.entries(swaps)) {
    assert.equal(swaps[partner], date, `${date} нь харилцан биш байна`);
  }
});

test('өөртэй нь болон танихгүй огноотой солихгүй', () => {
  reset();
  assert.equal(schedule.swapDays(WEDNESDAY, WEDNESDAY), false);
  assert.equal(schedule.swapDays(WEDNESDAY, 'маргааш'), false);
  assert.deepEqual(storage.getSwaps(), {});
});

test('хагас холбоос хадгалалтаас уншихад хаягдана', () => {
  reset();
  // Гараар эвдэрсэн (эсвэл хуучин хувилбарын) өгөгдөл: нэг тал нь л заасан.
  stores.local.setItem(STATE_KEY, JSON.stringify({
    version: 2,
    sessions: {},
    swaps: { [WEDNESDAY]: THURSDAY }
  }));
  storage.__resetForTests();

  assert.deepEqual(storage.getSwaps(), {}, 'харилцан бус холбоос үлдэх ёсгүй');
  assert.equal(schedule.dayForDate(WEDNESDAY).id, 'd3');
});

test('v1 өгөгдөл v2 рүү шилжихэд тэмдэглэгээ бүрэн үлдэнэ', () => {
  reset();
  stores.local.setItem(STATE_KEY, JSON.stringify({
    version: 1,
    sessions: {
      [MONDAY]: {
        date: MONDAY,
        dayId: 'd1',
        done: 1,
        total: 2,
        completedAt: null,
        sets: { e101: [true, true, true] }
      }
    }
  }));
  storage.__resetForTests();

  const state = storage.loadState();
  assert.equal(state.version, 2);
  assert.deepEqual(state.swaps, {});
  assert.deepEqual(storage.getDaySets(MONDAY).e101, [true, true, true]);
});

test('зөөгдсөн өдөр амралт болох тул цувааг таслахгүй', () => {
  reset();
  // Даваа биелсэн. Мягмар (d2) хийгдээгүй — ердийн үед цуваа тасарна.
  fillDay(MONDAY);
  assert.equal(stats.currentStreak('2026-09-02'), 0, 'хийгээгүй Мягмар цувааг тасална');

  // Мягмарын бэлтгэлийг Лхагва руу зөөвөл Мягмар нь амралт болно.
  schedule.swapDays('2026-09-01', WEDNESDAY);
  stats.invalidateStats();
  assert.equal(
    stats.currentStreak('2026-09-02'),
    1,
    'зөөгдсөн өдөр "хийгээгүй" биш — цуваа хэвээр'
  );
});

test('солигдсон өдрийн тэмдэглэгээ шинэ төлөвлөгөөндөө бичигдэнэ', () => {
  reset();
  schedule.swapDays(WEDNESDAY, THURSDAY);
  fillDay(WEDNESDAY);

  const result = storage.getDayResult(WEDNESDAY);
  assert.equal(result.dayId, 'd4', 'хийсэн бэлтгэл нь d4 байсан');
  assert.equal(stats.dayStatus(WEDNESDAY).key, 'done');
  // Пүрэв нь одоо амралт — "хийгээгүй" гэж тоологдохгүй.
  assert.equal(stats.dayStatus(THURSDAY).key, 'rest');
});

test('reconcile нь солилцоог тооцож тэмдэглэгээг зөв өдөртэй нь тулгана', () => {
  reset();
  schedule.swapDays(WEDNESDAY, THURSDAY);
  fillDay(WEDNESDAY);

  const report = storage.reconcile(program.days, schedule.dayForDate);
  assert.deepEqual(report, { removed: 0, trimmed: 0 }, 'зөв өгөгдлийг хөндөхгүй');
  assert.equal(stats.dayStatus(WEDNESDAY).key, 'done');
});

test('хэтэрхий хуучин солилцоо reconcile дээр цэвэрлэгдэнэ', () => {
  reset();
  schedule.swapDays('2020-01-01', '2020-01-02');
  assert.equal(Object.keys(storage.getSwaps()).length, 2);

  storage.reconcile(program.days, schedule.dayForDate);
  assert.deepEqual(storage.getSwaps(), {}, 'жилийн өмнөх солилцоо хадгалагдах шаардлагагүй');
});

test('солих сонголтод өөрийнх нь өдөр орохгүй, тэмдэглэгээтэй нь хаалттай', () => {
  reset();
  fillDay(MONDAY);

  const options = schedule.swapOptions(
    WEDNESDAY,
    (date) => stats.dayStatus(date).setsDone > 0,
    WEDNESDAY
  );

  assert.ok(options.length > 0);
  assert.ok(!options.some((option) => option.date === WEDNESDAY), 'өөрийг нь санал болгохгүй');

  const monday = options.find((option) => option.date === MONDAY);
  assert.equal(monday.blocked, true, 'тэмдэглэгээтэй өдрийг солиулахгүй');
  assert.equal(monday.isPast, true);

  const thursday = options.find((option) => option.date === THURSDAY);
  assert.equal(thursday.blocked, false);
  assert.equal(thursday.day.id, 'd4');
});

test('бүх тэмдэглэгээг устгахад солилцоо ч цэвэрлэгдэнэ', () => {
  reset();
  schedule.swapDays(WEDNESDAY, THURSDAY);
  fillDay(WEDNESDAY);

  storage.clearAll();
  assert.deepEqual(storage.getSwaps(), {});
  assert.equal(schedule.dayForDate(WEDNESDAY).id, 'd3');
});
