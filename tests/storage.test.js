// storage.js бол хэрэглэгчийн ЦОРЫН ГАНЦ өгөгдлийн эх сурвалж.
// Энд гарсан алдаа хэдэн сарын түүхийг чимээгүйгээр устгаж чадна.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installStorage, muteWarnings, sampleProgramSource } from './helpers.js';

const stores = installStorage();

const { STATE_KEY, BACKUP_PREFIX } = await import('../js/data.js');
const { normalizeProgram } = await import('../js/program.js');
const storage = await import('../js/storage.js');

const program = normalizeProgram(sampleProgramSource(2, 3));
const day1 = program.days[0]; // d1: 2 дасгал × 3 сет

function reset() {
  stores.local.clear();
  stores.local.failWrites = false;
  storage.__resetForTests();
}

/** d1-ийн бүтэн сетийн зураглал. */
function marks(filled) {
  const sets = {};
  for (const exercise of day1.exercises) {
    sets[exercise.id] = Array.from({ length: exercise.sets }, () => filled);
  }
  return sets;
}

test('хоосон хадгалалт нь хоосон төлөв өгнө', () => {
  reset();
  const state = storage.loadState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.sessions, {});
  assert.equal(storage.firstSessionDate(), null);
  assert.equal(storage.getDayResult('2026-08-26'), null);
});

test('saveDay бичээд эргэж уншина', () => {
  reset();
  const sets = marks(false);
  sets[day1.exercises[0].id] = [true, true, true];

  const result = storage.saveDay({
    date: '2026-08-26',
    dayId: day1.id,
    sets,
    done: 1,
    total: 2
  });

  assert.equal(result.done, 1);
  assert.equal(result.total, 2);
  assert.equal(result.completedAt, null, 'дутуу өдөрт дуусгасан цаг байхгүй');

  storage.__resetForTests(); // санах ойн кэшийг хаяж, дискнээс уншина
  assert.deepEqual(storage.getDaySets('2026-08-26')[day1.exercises[0].id], [true, true, true]);
});

test('completedAt зөвхөн бүрэн дуусахад нэг л удаа тавигдана', () => {
  reset();
  const full = marks(true);

  const first = storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: full, done: 2, total: 2 });
  assert.ok(first.completedAt, 'бүрэн дуусахад цаг тавигдана');

  // Дахин хадгалахад анхны цаг ХЭВЭЭР үлдэнэ (сүүлийн бичилтээр дарагдахгүй).
  const again = storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: full, done: 2, total: 2 });
  assert.equal(again.completedAt, first.completedAt);

  // Сет тайлахад цаг арилна — өдөр дуусаагүй болсон.
  const partial = marks(true);
  partial[day1.exercises[0].id] = [true, false, true];
  const undone = storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: partial, done: 1, total: 2 });
  assert.equal(undone.completedAt, null);
});

test('done нь total-оос хэтрэхгүй', () => {
  reset();
  const result = storage.saveDay({
    date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 99, total: 2
  });
  assert.equal(result.done, 2, '"99/2 дасгал" гэсэн утгагүй хураангуй гарах ёсгүй');
});

test('гажсан огноо руу бичихээс татгалзана', () => {
  reset();
  let result;
  muteWarnings(() => {
    result = storage.saveDay({ date: 'маргааш', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  });
  assert.equal(result, null);
  assert.deepEqual(storage.loadState().sessions, {}, 'гэмтсэн түлхүүр орж ирээгүй');
});

test('getDaySets нь ХУУЛБАР буцаана — гаднаас кэшийг өөрчлөх боломжгүй', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });

  const sets = storage.getDaySets('2026-08-26');
  sets[day1.exercises[0].id][0] = false;
  sets.newKey = [true];

  const fresh = storage.getDaySets('2026-08-26');
  assert.equal(fresh[day1.exercises[0].id][0], true, 'дотоод төлөв хөндөгдөөгүй');
  assert.equal(fresh.newKey, undefined);
});

test('эвдэрсэн JSON-ыг УСТГАХГҮЙ, нөөцөлж аваад цэвэр төлөвөөс эхэлнэ', () => {
  reset();
  stores.local.setItem(STATE_KEY, '{ энэ бол JSON биш ');

  muteWarnings(() => storage.loadState());

  assert.equal(stores.local.getItem(BACKUP_PREFIX + 'corrupt'), '{ энэ бол JSON биш ');
  assert.deepEqual(storage.loadState().sessions, {});
});

test('танихгүй бичлэгүүд шүүгдэж, хүчинтэй нь үлдэнэ', () => {
  reset();
  stores.local.setItem(STATE_KEY, JSON.stringify({
    version: 1,
    sessions: {
      '2026-08-26': { dayId: 'd1', done: 1, total: 2, sets: { e101: [true, false, true] } },
      'гэмтсэн-түлхүүр': { dayId: 'd1', done: 1, total: 2 },
      '2026-08-25': 'объект биш'
    }
  }));

  const state = storage.loadState();
  assert.deepEqual(Object.keys(state.sessions), ['2026-08-26']);
  assert.deepEqual(state.sessions['2026-08-26'].sets.e101, [true, false, true]);
});

test('ирээдүйн схемийн өгөгдөл нөөцлөгдөнө, дарж бичигдэхгүй', () => {
  reset();
  const future = { version: 99, sessions: { '2026-08-26': { dayId: 'd1' } } };
  stores.local.setItem(STATE_KEY, JSON.stringify(future));

  storage.loadState();

  assert.deepEqual(JSON.parse(stores.local.getItem(BACKUP_PREFIX + '99')), future);
});

test('reconcile нь хөтөлбөрөөс алга болсон өдрийг устгана', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: 'алга-болсон', sets: { z: [true] }, done: 1, total: 1 });

  const report = storage.reconcile(program.days);
  assert.equal(report.removed, 1);
  assert.equal(storage.getDayResult('2026-08-26'), null);
});

test('reconcile нь амралт болсон өдрийн тэмдэглэгээг устгана', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: 'd3', sets: { q: [true] }, done: 1, total: 1 });
  const report = storage.reconcile(program.days);
  assert.equal(report.removed, 1);
});

test('reconcile нь сетийн тоо өөрчлөгдөхөд уртыг тааруулна', () => {
  reset();
  // 3-ын оронд 5 сет тэмдэглэгдсэн хуучин өгөгдөл.
  const sets = {};
  sets[day1.exercises[0].id] = [true, true, true, true, true];
  sets[day1.exercises[1].id] = [true, false, false];
  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets, done: 1, total: 2 });

  const report = storage.reconcile(program.days);
  assert.equal(report.trimmed, 1);

  const trimmed = storage.getDaySets('2026-08-26');
  assert.equal(trimmed[day1.exercises[0].id].length, 3, 'хөтөлбөрийн сетийн тоонд орсон');
  assert.deepEqual(trimmed[day1.exercises[1].id], [true, false, false]);
});

test('reconcile нь ганц ч тэмдэглэгээгүй үлдсэн өдрийг устгана', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(false), done: 0, total: 2 });
  const report = storage.reconcile(program.days);
  assert.equal(report.removed, 1);
  assert.equal(storage.getDayResult('2026-08-26'), null);
});

test('reconcile нь өөрчлөх зүйлгүй бол юу ч хөндөхгүй', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  const report = storage.reconcile(program.days);
  assert.deepEqual(report, { removed: 0, trimmed: 0 });

  // Хоёр дахь удаа ажиллуулахад ч тогтвортой (idempotent).
  assert.deepEqual(storage.reconcile(program.days), { removed: 0, trimmed: 0 });
});

test('firstSessionDate хамгийн эртний огноог өгч, бичилт бүрд шинэчлэгдэнэ', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  assert.equal(storage.firstSessionDate(), '2026-08-26');

  storage.saveDay({ date: '2026-08-19', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  assert.equal(storage.firstSessionDate(), '2026-08-19', 'кэш хуучирсан утга барьж үлдэхгүй');

  storage.clearAll();
  assert.equal(storage.firstSessionDate(), null);
});

test('subscribe нь бичилт бүрд дуудагдаж, буцаах функцээр тайлагдана', () => {
  reset();
  let count = 0;
  const off = storage.subscribe(() => { count += 1; });

  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  assert.equal(count, 1);

  off();
  storage.saveDay({ date: '2026-08-25', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  assert.equal(count, 1, 'тайлагдсаны дараа дуудагдахгүй');
});

test('нэг сонсогчийн алдаа хадгалалтыг зогсоохгүй', () => {
  reset();
  let reached = false;
  const offBad = storage.subscribe(() => { throw new Error('сонсогч унасан'); });
  const offGood = storage.subscribe(() => { reached = true; });

  muteWarnings(() => {
    storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  });

  assert.equal(reached, true);
  assert.equal(storage.getDayResult('2026-08-26').done, 2, 'өгөгдөл хэвээр бичигдсэн');
  offBad();
  offGood();
});

test('зай дүүрсэн үед апп унахгүй, харин алдааг ил хэлнэ', () => {
  reset();
  storage.loadState();
  stores.local.failWrites = true;

  muteWarnings(() => {
    storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  });

  const message = storage.getStorageError();
  assert.ok(message && message.includes('зай'), `мэдэгдэл гарах ёстой, гарсан нь: ${message}`);

  // Хадгалалт сэргэхэд мэдэгдэл арилна.
  stores.local.failWrites = false;
  storage.saveDay({ date: '2026-08-25', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  assert.equal(storage.getStorageError(), null);
});

test('getRecentDays нь шинээс хуучин руу, тэмдэглэгээгүй өдрийг ч оруулна', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });

  const rows = storage.getRecentDays('2026-08-26', 3);
  assert.deepEqual(rows.map((r) => r.date), ['2026-08-26', '2026-08-25', '2026-08-24']);
  assert.equal(rows[0].result.done, 2);
  assert.equal(rows[1].result, null);
});

test('clearDay нь зөвхөн тэр өдрийг арилгана', () => {
  reset();
  storage.saveDay({ date: '2026-08-26', dayId: day1.id, sets: marks(true), done: 2, total: 2 });
  storage.saveDay({ date: '2026-08-25', dayId: day1.id, sets: marks(true), done: 2, total: 2 });

  storage.clearDay('2026-08-26');
  assert.equal(storage.getDayResult('2026-08-26'), null);
  assert.ok(storage.getDayResult('2026-08-25'));
});
