// stats.js — гурван дэлгэцийн ХУВААЛЦДАГ тооцоо.
// "Биелсэн" гэдэг үг хаана ч ижил утгатай байх ёстой.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installStorage, sampleProgramSource } from './helpers.js';

const stores = installStorage();

const { normalizeProgram, setProgram } = await import('../js/program.js');
const storage = await import('../js/storage.js');
const stats = await import('../js/stats.js');

const program = normalizeProgram(sampleProgramSource(2, 3)); // 2 дасгал × 3 сет
setProgram(program);

// 2026-08-24 бол Даваа. d3 (Лхагва) ба d7 (Ням) нь амралт.
const MON = '2026-08-24';
const TUE = '2026-08-25';
const WED = '2026-08-26'; // амралт
const THU = '2026-08-27';
const FRI = '2026-08-28';
const SAT = '2026-08-29';
const SUN = '2026-08-30'; // амралт

function reset() {
  stores.local.clear();
  storage.__resetForTests();
  stats.invalidateStats();
}

/**
 * @param {string} date
 * @param {'full'|'partial'} how
 */
function mark(date, how) {
  const day = stats.dayStatus(date).day;
  const sets = {};
  let done = 0;
  day.exercises.forEach((exercise, index) => {
    const filled = how === 'full' || index === 0;
    sets[exercise.id] = Array.from({ length: exercise.sets }, (_, i) =>
      how === 'partial' && index === 0 ? i === 0 : filled
    );
    if (sets[exercise.id].every(Boolean)) done += 1;
  });
  storage.saveDay({ date, dayId: day.id, sets, done, total: day.exercises.length });
}

test('амралтын өдөр нь "rest", дасгалын хоосон өдөр нь "none"', () => {
  reset();
  assert.equal(stats.dayStatus(WED).key, 'rest');
  assert.equal(stats.dayStatus(SUN).key, 'rest');
  assert.equal(stats.dayStatus(MON).key, 'none');
});

test('бүрэн / дутуу хийсэн өдөр зөв ялгагдана', () => {
  reset();
  mark(MON, 'full');
  mark(TUE, 'partial');

  const full = stats.dayStatus(MON);
  assert.equal(full.key, 'done');
  assert.equal(full.done, 2);
  assert.equal(full.setsDone, 6);
  assert.equal(full.setsTotal, 6);

  const partial = stats.dayStatus(TUE);
  assert.equal(partial.key, 'partial');
  assert.equal(partial.done, 0);
  assert.equal(partial.setsDone, 1);
});

test('тооцооны кэш нь бичилт болмогц хүчингүй болно', () => {
  reset();
  assert.equal(stats.dayStatus(MON).key, 'none');
  mark(MON, 'full');
  assert.equal(stats.dayStatus(MON).key, 'done', 'кэш хуучин утгаа барьж үлдэх ёсгүй');
});

test('ирээдүйн хоосон өдөр "хийгээгүй" биш, "удахгүй"', () => {
  reset();
  const status = stats.dayStatus(SAT);
  assert.equal(stats.displayKey(status, SAT, THU), 'upcoming');
  assert.equal(stats.displayKey(status, SAT, SAT), 'none', 'өнөөдөр бол хийгээгүй');
});

test('describeStatus нь амралтын өдөр давхардсан үг гаргахгүй', () => {
  reset();
  assert.equal(stats.describeStatus(stats.dayStatus(WED)), '');
  mark(TUE, 'partial');
  assert.equal(stats.describeStatus(stats.dayStatus(TUE)), '0/2 дасгал · 1/6 сет');
  mark(MON, 'full');
  assert.equal(stats.describeStatus(stats.dayStatus(MON)), '2/2 дасгал');
});

test('цуваа: амралтын өдөр таслахгүй, тоонд ч орохгүй', () => {
  reset();
  mark(TUE, 'full');
  mark(THU, 'full');
  mark(FRI, 'full');
  // Лхагва (WED) бол амралт — Мягмараас Баасан хүртэлх цувааг таслахгүй.
  assert.equal(stats.currentStreak(FRI), 3);
});

test('цуваа: дуусаагүй ӨНӨӨДӨР цувааг таслахгүй', () => {
  reset();
  mark(THU, 'full');
  mark(FRI, 'full');
  assert.equal(stats.currentStreak(SAT), 2, 'Бямба хараахан эхлээгүй — өдөр дуусаагүй');
});

test('цуваа: дутуу хийсэн ӨНГӨРСӨН өдөр цувааг тасална', () => {
  reset();
  mark(THU, 'partial');
  mark(FRI, 'full');
  mark(SAT, 'full');
  assert.equal(stats.currentStreak(SAT), 2);
});

test('цуваа: тэмдэглэгээ огт байхгүй бол 0', () => {
  reset();
  assert.equal(stats.currentStreak(SAT), 0);
});

test('долоо хоногийн хураангуй: биелсэн, дутуу, сет тусдаа тоологдоно', () => {
  reset();
  mark(MON, 'full');
  mark(TUE, 'partial');

  const week = stats.weekSummary(MON, SAT);
  assert.equal(week.days.length, 7);
  assert.equal(week.planned, 5, '7 хоногийн 2 нь амралт');
  assert.equal(week.trained, 1);
  assert.equal(week.partial, 1);
  assert.equal(week.setsTotal, 30, '5 бэлтгэлийн өдөр × 6 сет');
  assert.equal(week.setsDone, 7);
  assert.equal(week.from, MON);
  assert.equal(week.to, SUN);
});

test('долоо хоногийн мөрүүд Даваагаас Ням хүртэл дарааллаараа', () => {
  reset();
  const week = stats.weekSummary(MON, SAT);
  assert.deepEqual(week.days.map((d) => d.date), [MON, TUE, WED, THU, FRI, SAT, SUN]);
  assert.deepEqual(week.days.map((d) => d.status.key), [
    'none', 'none', 'rest', 'none', 'none', 'none', 'rest'
  ]);
});

test('түүхийн цонх нь анхны тэмдэглэгээнээс өмнөх өдрүүдийг буруутгахгүй', () => {
  reset();
  mark(THU, 'full');
  // Анхны тэмдэглэгээ 2 хоногийн өмнө ч гэсэн доод хэмжээ нь 7 хоног.
  assert.equal(stats.historySpan(SAT, 30), 7);
});

test('түүхийн хураангуй: дутуу нь "хийгээгүй" рүү ордоггүй', () => {
  reset();
  mark(THU, 'full');
  mark(FRI, 'partial');

  const summary = stats.historySummary(SAT, 30);
  assert.equal(summary.done, 1);
  assert.equal(summary.partial, 1);
  // 7 хоногийн цонх (Бямбаас ухраад Ням хүртэл) хоёр амралтын өдөр агуулна.
  assert.equal(summary.span, 7);
  assert.equal(summary.rest, 2, 'Лхагва ба өмнөх Ням');
  assert.equal(summary.missed, 3);
  assert.equal(summary.planned, 5);
  assert.equal(summary.planned, summary.done + summary.partial + summary.missed);
  assert.equal(summary.rate, Math.round((1 / summary.planned) * 100));
  // Бямба хараахан эхлээгүй тул тасалдаггүй, харин ДУТУУ хийсэн Баасан тасална.
  assert.equal(summary.streak, 0);
});

test('түүх нь долоо хоногоор бүлэглэгдэж, шинээс хуучин руу эрэмбэлэгдэнэ', () => {
  reset();
  mark(THU, 'full');
  const summary = stats.historySummary(SAT, 30);

  assert.deepEqual(summary.rows.map((r) => r.date).slice(0, 3), [SAT, FRI, THU]);
  assert.ok(summary.weeks.length >= 1);
  assert.equal(summary.weeks[0].label, 'Энэ долоо хоног');
  assert.equal(summary.weeks[0].note, '1/5');
});

test('nextTrainingDay нь амралтын өдрүүдийг алгасана', () => {
  reset();
  const next = stats.nextTrainingDay(TUE); // Мягмарын дараа Лхагва бол амралт
  assert.equal(next.date, THU);
  assert.equal(next.day.id, 'd4');
});

test('readSets нь хөтөлбөрийн сетийн тоонд яг таарсан массив өгнө', () => {
  reset();
  const day = stats.dayStatus(MON).day;
  const sets = stats.readSets(MON, day);
  for (const exercise of day.exercises) {
    assert.equal(sets[exercise.id].length, exercise.sets);
    assert.deepEqual(sets[exercise.id], [false, false, false]);
  }
});

test('countDone / countSets нь бие биетэйгээ нийцнэ', () => {
  reset();
  const day = stats.dayStatus(MON).day;
  const sets = stats.readSets(MON, day);
  sets[day.exercises[0].id] = [true, true, true];
  sets[day.exercises[1].id] = [true, false, false];

  assert.equal(stats.countDone(day, sets), 1);
  assert.deepEqual(stats.countSets(day, sets), { done: 4, total: 6 });
});
