// timer.js — амралтын тоолуур. DOM-гүй ажиллах ёстой (зангилаа олдоогүй ч
// логик нь зөв явна), мөн хуудас дахин ачаалагдахад амьд үлдэх ёстой.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installStorage } from './helpers.js';

const stores = installStorage();
const timer = await import('../js/timer.js');

const TIMER_KEY = 'gym:timer';

function reset() {
  timer.stop();
  stores.session.clear();
}

test('эхлээгүй байхад хормын хувилбар байхгүй', () => {
  reset();
  assert.equal(timer.snapshot(), null);
  assert.equal(timer.isActiveFor('e1'), false);
});

test('start нь идэвхтэй тоолуур үүсгэнэ', () => {
  reset();
  timer.start('e1', 90);

  const shot = timer.snapshot();
  assert.equal(shot.exerciseId, 'e1');
  assert.equal(shot.seconds, 90);
  assert.ok(shot.remaining > 88 && shot.remaining <= 90);
  assert.equal(shot.finished, false);
  assert.equal(timer.isActiveFor('e1'), true);
  assert.equal(timer.isActiveFor('e2'), false);
  timer.stop();
});

test('амралт 0 эсвэл сөрөг бол тоолуур эхлэхгүй', () => {
  reset();
  timer.start('e1', 0);
  assert.equal(timer.snapshot(), null);
  timer.start('e1', -30);
  assert.equal(timer.snapshot(), null);
  timer.start('', 60);
  assert.equal(timer.snapshot(), null);
});

test('шинэ тоолуур эхлэхэд хуучин нь дуусна — нэг л удаад нэг', () => {
  reset();
  timer.start('e1', 60);
  timer.start('e2', 30);
  assert.equal(timer.isActiveFor('e1'), false);
  assert.equal(timer.isActiveFor('e2'), true);
  assert.equal(timer.snapshot().seconds, 30);
  timer.stop();
});

test('stop нь бүх ул мөрийг арилгана', () => {
  reset();
  timer.start('e1', 60);
  assert.ok(stores.session.getItem(TIMER_KEY));

  timer.stop();
  assert.equal(timer.snapshot(), null);
  assert.equal(stores.session.getItem(TIMER_KEY), null);
});

test('идэвхтэй тоолуур sessionStorage-д тусгагдана', () => {
  reset();
  timer.start('e1', 120);

  const saved = JSON.parse(stores.session.getItem(TIMER_KEY));
  assert.equal(saved.exerciseId, 'e1');
  assert.equal(saved.seconds, 120);
  assert.ok(saved.endsAt > Date.now());
  timer.stop();
});

test('хуудас дахин ачаалагдахад амралт үргэлжилнэ', () => {
  reset();
  // Хуудас хаагдахаас өмнөх төлөв.
  stores.session.setItem(TIMER_KEY, JSON.stringify({
    exerciseId: 'e1', seconds: 120, endsAt: Date.now() + 45000
  }));

  assert.equal(timer.restore(['e1', 'e2']), true);
  const shot = timer.snapshot();
  assert.equal(shot.exerciseId, 'e1');
  assert.ok(shot.remaining > 43 && shot.remaining <= 45);
  timer.stop();
});

test('дууссан тоолуурыг сэргээхгүй', () => {
  reset();
  stores.session.setItem(TIMER_KEY, JSON.stringify({
    exerciseId: 'e1', seconds: 120, endsAt: Date.now() - 1000
  }));

  assert.equal(timer.restore(['e1']), false);
  assert.equal(timer.snapshot(), null);
  assert.equal(stores.session.getItem(TIMER_KEY), null, 'хуучирсан төлөв цэвэрлэгдэнэ');
});

test('хөтөлбөрт байхгүй дасгалын тоолуурыг сэргээхгүй', () => {
  reset();
  // Хөтөлбөр солигдоод "e-хуучин" гэсэн дасгал алга болсон тохиолдол.
  stores.session.setItem(TIMER_KEY, JSON.stringify({
    exerciseId: 'e-хуучин', seconds: 120, endsAt: Date.now() + 45000
  }));

  assert.equal(timer.restore(['e1', 'e2']), false);
  assert.equal(timer.snapshot(), null);
});

test('хэт эрт (2 цагаас хэтэрсэн) төлөвийг сэргээхгүй', () => {
  reset();
  stores.session.setItem(TIMER_KEY, JSON.stringify({
    exerciseId: 'e1', seconds: 120, endsAt: Date.now() + 3 * 60 * 60 * 1000
  }));
  assert.equal(timer.restore(['e1']), false);
});

test('гажсан хадгалсан төлөв дээр унахгүй', () => {
  for (const value of ['JSON биш', 'null', '42', '{}', '{"exerciseId":"e1"}']) {
    reset();
    stores.session.setItem(TIMER_KEY, value);
    assert.equal(timer.restore(['e1']), false);
    assert.equal(timer.snapshot(), null);
  }
});

test('refresh нь DOM байхгүй үед ч унахгүй', () => {
  reset();
  timer.start('e1', 60);
  assert.doesNotThrow(() => timer.refresh());
  timer.stop();
  assert.doesNotThrow(() => timer.refresh());
});
