// Офлайн ажиллагаа нь ЗӨВХӨН кэшлэгдсэн файлууд бүрэн байхад ажиллана.
// Хамгийн бодитой эвдрэл нь: шинэ модуль нэмээд sw.js доторх PRECACHE-д
// нэмэхээ мартах — тэр үед апп хөтөч дээр хэвийн, харин офлайн үед хагас
// ачаалагдаж, хоосон дэлгэц үлдээнэ. Энэ файл яг түүнийг барина.
//
// Хөтөч шаардахгүй: бүх шалгалт файлуудыг УНШИЖ хийгдэнэ.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} path repo-гийн үндсээс */
function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

const swSource = read('sw.js');
const indexHtml = read('index.html');

/**
 * sw.js доторх PRECACHE жагсаалтыг эхийн кодоос гаргаж авна.
 * (sw.js нь классик script — Node дээр import хийж болохгүй.)
 * @returns {string[]}
 */
function precacheList() {
  const match = swSource.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(match, 'sw.js дотор PRECACHE жагсаалт олдсонгүй');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const PRECACHE = precacheList();

/**
 * "./js/views/day.js" -> "js/views/day.js"
 * @param {string} url
 */
function toRepoPath(url) {
  return url.replace(/^\.\//, '');
}

/**
 * Тухайн модулийн ажиллагааны import-уудыг гүйлгэж, хамаарлын мод бүхэлдээ
 * буцаана. JSDoc доторх `import('./types.js')` нь тайлбар — файл татагддаггүй
 * тул орохгүй (зөвхөн жинхэнэ `import ... from '...'` мөрүүд).
 * @param {string} entry repo-гийн үндсээс, жишээ нь "js/main.js"
 * @returns {Set<string>}
 */
function moduleGraph(entry) {
  const seen = new Set();
  const queue = [entry];

  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.shift());
    if (seen.has(current)) continue;
    seen.add(current);

    const source = read(current);
    const pattern = /^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm;
    for (const match of source.matchAll(pattern)) {
      const target = relative(ROOT, resolve(join(ROOT, dirname(current)), match[1]));
      queue.push(target.split(/[\\/]/).join(posix.sep));
    }
  }

  return seen;
}

test('PRECACHE доторх бүх файл repo дотор үнэхээр байдаг', () => {
  for (const url of PRECACHE) {
    assert.ok(url.startsWith('./'), `${url} — зам харьцангуй байх ёстой`);
    assert.ok(existsSync(join(ROOT, toRepoPath(url))), `${url} файл олдсонгүй`);
  }
});

test('PRECACHE дотор давхардал алга', () => {
  assert.equal(new Set(PRECACHE).size, PRECACHE.length);
});

test('аппын БҮХ модуль кэшлэгдэнэ (офлайн үед хагас ачаалагдахгүй)', () => {
  for (const path of moduleGraph('js/main.js')) {
    assert.ok(
      PRECACHE.includes(`./${path}`),
      `${path} нь sw.js доторх PRECACHE-д алга — офлайн үед апп ажиллахгүй`
    );
  }
});

test('index.html доторх локал файлууд кэшлэгдэнэ', () => {
  const refs = [...indexHtml.matchAll(/(?:href|src)="(\.\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'index.html дотор локал холбоос олдсонгүй');

  for (const ref of refs) {
    assert.ok(existsSync(join(ROOT, toRepoPath(ref))), `${ref} файл олдсонгүй`);
    assert.ok(PRECACHE.includes(ref), `${ref} нь PRECACHE-д алга`);
  }
});

test('index.html нь manifest ба суулгах мэдээллийг агуулна', () => {
  assert.match(indexHtml, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(indexHtml, /rel="apple-touch-icon"/);
  assert.match(indexHtml, /id="update"/, 'шинэчлэлтийн зурвасны зангилаа байх ёстой');
});

test('manifest нь суулгахад шаардлагатай талбаруудтай', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));

  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name);
  // Дэвсгэр нь аппын бодит өнгөтэй таарах ёстой — эс бөгөөс суулгасан апп
  // нээгдэхэд цагаан дэлгэц анивчина.
  assert.equal(manifest.background_color, '#0B0B0C');
  assert.equal(manifest.theme_color, '#0B0B0C');

  const sizes = manifest.icons.map((/** @type {{sizes: string}} */ icon) => icon.sizes);
  assert.ok(sizes.includes('192x192'), '192x192 icon шаардлагатай');
  assert.ok(sizes.includes('512x512'), '512x512 icon шаардлагатай');
  assert.ok(
    manifest.icons.some((/** @type {{purpose: string}} */ i) => i.purpose === 'maskable'),
    'Android дүрсийг тайрдаг тул maskable icon шаардлагатай'
  );

  for (const icon of manifest.icons) {
    const file = join(ROOT, toRepoPath(icon.src));
    assert.ok(existsSync(file), `${icon.src} олдсонгүй`);
    assert.ok(PRECACHE.includes(icon.src), `${icon.src} нь PRECACHE-д алга`);

    // PNG-ийн IHDR: 16-24 байт дотор өргөн, өндөр байна.
    const bytes = readFileSync(file);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(`${width}x${height}`, icon.sizes, `${icon.src} хэмжээ таарахгүй байна`);
  }
});

test('deploy нь sw.js доторх хувилбарын мөрийг олж чадна', () => {
  // pages.yml доторх sed яг ЭНЭ мөрийг хайдаг. Мөрийн хэлбэр өөрчлөгдвөл
  // кэш хэзээ ч шинэчлэгдэхгүй болох тул хоёуланг нь хамт барина.
  assert.ok(
    swSource.includes("\nconst BUILD = '__BUILD__';\n"),
    'sw.js доторх BUILD мөр өөрчлөгдсөн байна — pages.yml-ийг бас засах хэрэгтэй'
  );
  assert.ok(
    read('.github/workflows/pages.yml').includes("^const BUILD = '__BUILD__';$"),
    'pages.yml нь sw.js доторх BUILD мөрийг олохоо больжээ'
  );
  // DEV шалгуур нь хэсэглэж бичигдсэн байх ЁСТОЙ: эс бөгөөс deploy дээрх sed
  // түүнийг ч сольж, амьд сайт дээр үргэлж "хөгжүүлэлтийн горим" болно.
  assert.ok(
    swSource.includes("BUILD === '__' + 'BUILD' + '__'"),
    'DEV шалгуур нь sed-ийн хамрах хүрээнээс гадуур байх ёстой'
  );
});
