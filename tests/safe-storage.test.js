// safe-storage.js — хөтчийн хадгалалттай харьцах цорын ганц доод давхарга.
// Энэ давхарга ХЭЗЭЭ Ч шидэх ёсгүй: нууц горим, зай дүүрэх нь аппыг унагаах
// шалтгаан биш, зөвхөн мэдээлэх шалтгаан.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installStorage, muteWarnings } from './helpers.js';

const stores = installStorage();
const safe = await import('../js/safe-storage.js');

function reset() {
  stores.local.clear();
  stores.session.clear();
  stores.local.failWrites = false;
  stores.local.throwOnRead = false;
  safe.writeRaw('__probe', '1');
  safe.removeRaw('__probe');
}

test('энгийн унших / бичих / устгах', () => {
  reset();
  assert.equal(safe.writeRaw('a', '1'), true);
  assert.equal(safe.readRaw('a'), '1');
  assert.equal(safe.removeRaw('a'), true);
  assert.equal(safe.readRaw('a'), null);
});

test('байхгүй түлхүүр null өгнө', () => {
  reset();
  assert.equal(safe.readRaw('байхгүй'), null);
});

test('JSON унших / бичих', () => {
  reset();
  assert.equal(safe.writeJson('j', { a: 1, b: [true] }), true);
  assert.deepEqual(safe.readJson('j').value, { a: 1, b: [true] });
});

test('эвдэрсэн JSON нь шидэхгүй, түүхий утгыг нь буцаана', () => {
  reset();
  stores.local.setItem('j', 'JSON биш');
  let result;
  muteWarnings(() => { result = safe.readJson('j'); });
  assert.equal(result.value, null);
  assert.equal(result.raw, 'JSON биш', 'нөөцлөх боломжтой байхын тулд түүхий утга үлдэнэ');
});

test('цуваалж болохгүй утга дээр ч унахгүй', () => {
  reset();
  const cyclic = {};
  cyclic.self = cyclic;
  let ok;
  muteWarnings(() => { ok = safe.writeJson('c', cyclic); });
  assert.equal(ok, false);
});

test('зай дүүрэхэд төлөв нь "full" болно', () => {
  reset();
  stores.local.failWrites = true;
  muteWarnings(() => assert.equal(safe.writeRaw('a', '1'), false));
  assert.equal(safe.getStatus(), 'full');

  stores.local.failWrites = false;
  safe.writeRaw('a', '1');
  assert.equal(safe.getStatus(), 'ok', 'сэргэхэд төлөв буцна');
});

test('унших боломжгүй хадгалалт нь "blocked" болно', () => {
  reset();
  stores.local.throwOnRead = true;
  muteWarnings(() => assert.equal(safe.readRaw('a'), null));
  assert.equal(safe.getStatus(), 'blocked');
  stores.local.throwOnRead = false;
});

test('төлөв ӨӨРЧЛӨГДӨХӨД л мэдэгдэнэ (бичилт бүрд биш)', () => {
  reset();
  const seen = [];
  const off = safe.onStatusChange((status) => seen.push(status));

  safe.writeRaw('a', '1');
  safe.writeRaw('b', '2');
  assert.deepEqual(seen, [], 'төлөв өөрчлөгдөөгүй — дэмий мэдэгдэл алга');

  stores.local.failWrites = true;
  muteWarnings(() => safe.writeRaw('c', '3'));
  muteWarnings(() => safe.writeRaw('d', '4'));
  assert.deepEqual(seen, ['full'], 'нэг л удаа');

  stores.local.failWrites = false;
  safe.writeRaw('e', '5');
  assert.deepEqual(seen, ['full', 'ok']);
  off();
});

test('sessionStorage нь тусдаа талбар — localStorage-ийн төлөвт нөлөөлөхгүй', () => {
  reset();
  safe.writeRaw('t', 'x', 'session');
  assert.equal(safe.readRaw('t', 'session'), 'x');
  assert.equal(safe.readRaw('t'), null, 'localStorage-д орсонгүй');
  assert.equal(safe.getStatus(), 'ok');
});

test('хадгалалт огт байхгүй орчинд ч унахгүй', () => {
  const original = globalThis.window;
  globalThis.window = undefined;
  try {
    assert.equal(safe.readRaw('a'), null);
    assert.equal(safe.writeRaw('a', '1'), false);
    assert.equal(safe.removeRaw('a'), false);
    assert.equal(safe.getStatus(), 'blocked');
  } finally {
    globalThis.window = original;
  }
});
