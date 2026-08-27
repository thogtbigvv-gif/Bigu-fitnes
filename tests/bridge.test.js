// bridge.js — ГАДАГШ чиглэсэн гэрээ. Уншигч тал (summer-project) энэ бүтцэд
// найддаг тул хэлбэр нь санамсаргүй өөрчлөгдөх ёсгүй.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installStorage, sampleProgramSource } from './helpers.js';

const stores = installStorage();

const { todayString, shiftDate } = await import('../js/data.js');
const { normalizeProgram, setProgram, getDayForDate } = await import('../js/program.js');
const storage = await import('../js/storage.js');
const stats = await import('../js/stats.js');
const bridge = await import('../js/bridge.js');

setProgram(normalizeProgram(sampleProgramSource(2, 3)));

function reset() {
  stores.local.clear();
  storage.__resetForTests();
  stats.invalidateStats();
  bridge.__resetForTests();
}

/** Тухайн өдрийг бүрэн эсвэл дутуу тэмдэглэнэ. Амралтын өдөр бол алгасана. */
function mark(date, how) {
  const day = getDayForDate(date);
  if (!day || day.isRest) return false;
  const sets = {};
  let done = 0;
  day.exercises.forEach((exercise, index) => {
    const on = how === 'full' || index === 0;
    sets[exercise.id] = Array.from({ length: exercise.sets }, () => on);
    if (on) done += 1;
  });
  storage.saveDay({ date, dayId: day.id, sets, done, total: day.exercises.length });
  return true;
}

function readBridge() {
  const raw = stores.local.getItem(bridge.BRIDGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

/** Өнөөдрөөс ухраан хамгийн ойрын бэлтгэлийн өдрийг олно. */
function nearestTrainingDate() {
  let date = todayString();
  for (let i = 0; i < 7; i += 1) {
    const day = getDayForDate(date);
    if (day && !day.isRest) return date;
    date = shiftDate(date, -1);
  }
  throw new Error('бэлтгэлийн өдөр олдсонгүй');
}

test('gym:bridge нь тохиролцсон талбаруудтай бичигдэнэ', () => {
  reset();
  assert.equal(bridge.publishBridge(), true);

  const payload = readBridge();
  assert.equal(payload.v, 1);
  assert.equal(payload.app, 'gym');
  assert.equal(payload.label, 'Gym');
  assert.equal(typeof payload.updatedAt, 'number');
  assert.ok(payload.status && typeof payload.status === 'object');
  assert.ok(Array.isArray(payload.events));
});

test('status нь өнөөдрийн төлөвлөгөө ба явцыг хэлнэ', () => {
  reset();
  bridge.publishBridge();
  const { status } = readBridge();

  assert.equal(typeof status.todayPlan, 'string');
  assert.match(status.todayProgress, /^\d+\/\d+$/);
  assert.equal(status.lastWorkout, null, 'тэмдэглэгээгүй бол null');
});

test('дасгал хийсэн өдөр event болж гарна', () => {
  reset();
  const date = nearestTrainingDate();
  mark(date, 'full');
  bridge.publishBridge();

  const { events, status } = readBridge();
  const event = events.find((e) => e.id === `gym-${date}`);

  assert.ok(event, 'тухайн өдрийн event байх ёстой');
  assert.equal(event.type, 'workout.completed');
  assert.equal(event.value, 2);
  assert.match(event.detail, /^2\/2 · /);
  assert.equal(typeof event.at, 'number');
  assert.equal(status.lastWorkout, date);
});

test('дутуу хийсэн өдөр "workout.partial" болно', () => {
  reset();
  const date = nearestTrainingDate();
  mark(date, 'partial');
  bridge.publishBridge();

  const event = readBridge().events.find((e) => e.id === `gym-${date}`);
  assert.equal(event.type, 'workout.partial');
  assert.equal(event.value, 1);
});

test('нэг ч дасгал дуусгаагүй өдөр event үүсгэхгүй', () => {
  reset();
  const date = nearestTrainingDate();
  const day = getDayForDate(date);
  const sets = {};
  for (const exercise of day.exercises) {
    sets[exercise.id] = [true, false, false]; // сет эхэлсэн ч дасгал дуусаагүй
  }
  storage.saveDay({ date, dayId: day.id, sets, done: 0, total: day.exercises.length });

  bridge.publishBridge();
  assert.equal(readBridge().events.length, 0);
});

test('event-үүд хуучнаас шинэ рүү эрэмбэлэгдэнэ', () => {
  reset();
  let marked = 0;
  for (let i = 0; i < 10 && marked < 3; i += 1) {
    if (mark(shiftDate(todayString(), -i), 'full')) marked += 1;
  }
  bridge.publishBridge();

  const { events } = readBridge();
  assert.equal(events.length, 3);
  for (let i = 1; i < events.length; i += 1) {
    assert.ok(events[i].at >= events[i - 1].at, 'цаг нь өсөх дарааллаар');
  }
});

test('event id нь өдрөөр давтагдахгүй — уншигч тал давхар тоолохгүй', () => {
  reset();
  const date = nearestTrainingDate();
  mark(date, 'partial');
  bridge.publishBridge();
  const firstId = readBridge().events[0].id;

  mark(date, 'full'); // ижил өдөр сайжирсан
  bridge.publishBridge();
  const events = readBridge().events;

  assert.equal(events.length, 1, 'нэг өдөр — нэг event');
  assert.equal(events[0].id, firstId);
  assert.equal(events[0].type, 'workout.completed');
});

test('агуулга өөрчлөгдөөгүй бол дахин бичихгүй', () => {
  reset();
  mark(nearestTrainingDate(), 'full');

  assert.equal(bridge.publishBridge(), true);
  assert.equal(bridge.publishBridge(), false, 'ижил агуулгыг дахин бичих нь дэмий ажил');
});

test('бичилт бүтэлгүйтвэл "бичсэн" гэж андуурахгүй', () => {
  reset();
  mark(nearestTrainingDate(), 'full');
  stores.local.failWrites = true;

  assert.equal(bridge.publishBridge(), false);

  // Хадгалалт сэргэхэд бичилт ДАХИН оролдогдох ёстой — эс бөгөөс "аль хэдийн
  // бичсэн" гэсэн хуруу хээ мөнхөд бичилтийг алгасна.
  stores.local.failWrites = false;
  assert.equal(bridge.publishBridge(), true);
  assert.ok(readBridge());
});

test('bridge нь аппын өгөгдлийн түлхүүрт ХЭЗЭЭ Ч хүрэхгүй', () => {
  reset();
  mark(nearestTrainingDate(), 'full');
  const before = stores.local.getItem('gym:state_v1');

  bridge.publishBridge();

  assert.equal(stores.local.getItem('gym:state_v1'), before);
  assert.equal(bridge.BRIDGE_KEY, 'gym:bridge');
});

test('schedulePublish нь дараалсан дуудлагыг нэг бичилт болгож нэгтгэнэ', async () => {
  reset();
  mark(nearestTrainingDate(), 'full');

  for (let i = 0; i < 20; i += 1) bridge.schedulePublish();
  assert.equal(readBridge(), null, 'хараахан бичигдээгүй');

  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.ok(readBridge(), 'хүлээлтийн дараа нэг л удаа бичигдэнэ');
});

test('flushBridge нь хүлээгдэж байгаа бичилтийг тэр дор нь гүйцээнэ', () => {
  reset();
  mark(nearestTrainingDate(), 'full');

  bridge.schedulePublish();
  assert.equal(readBridge(), null);

  assert.equal(bridge.flushBridge(), true);
  assert.ok(readBridge(), 'апп хаагдахад сүүлийн сетүүд алдагдахгүй');
});
