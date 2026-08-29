// sw.js — service worker: апп-ыг ОФЛАЙН ажиллуулж, утсанд суулгах боломж өгнө.
//
// Заал дээр интернет байхгүй, лифт дотор, эсвэл дата дууссан үед ч дасгалаа
// тэмдэглэж чадах ёстой. Бүх өгөгдөл аль хэдийн localStorage дээр байдаг тул
// дутуу зүйл нь ердөө файлууд өөрсдөө байв — энэ файл тэднийг кэшлэнэ.
//
// Зарчмаа хэвээр барина: гадаад холбоос алга, build алхам алга. Энэ бол
// хамааралгүй, гараар бичсэн 150 мөр — Workbox гэх мэт юу ч ороогүй.
//
// ХУВИЛБАРЫН ЛОГИК
// ────────────────
// Кэшийн нэр нь BUILD дээр тулгуурлана. GitHub Pages руу deploy хийхэд
// workflow энэ мөрийг commit-ийн SHA-гаар СОЛИНО (.github/workflows/pages.yml).
// Тиймээс:
//   - deploy бүрд шинэ кэш үүснэ — хуучин, шинэ файл ХЭЗЭЭ Ч холилдохгүй,
//   - шинэ хувилбар бүрэн татагдаж дуустал хуучин нь ажилласаар байна,
//   - бэлэн болоход хэрэглэгчээс асууна (js/updates.js дэх зурвас).
//
// Локал хөгжүүлэлтэд SHA тавигдаагүй байна — тэр үед бүх хүсэлт СҮЛЖЭЭ РҮҮ
// эхэлж очно (засвар шууд харагдана), сүлжээгүй бол кэшнээс өгнө.

// Deploy үед энэ мөр бүхэлдээ солигдоно. Гараар засах шаардлагагүй.
const BUILD = '__BUILD__';

// Тэмдэглэгээг ХЭСЭГЛЭЖ бичсэн нь санаатай: deploy дээрх sed зөвхөн дээрх
// мөрийг солино, энэ мөрийг хөндөхгүй. Үгүй бол хоёулаа солигдож,
// DEV нь үргэлж `true` болох байв.
const DEV = BUILD === '__' + 'BUILD' + '__';

const CACHE = `gym-shell-${DEV ? 'dev' : BUILD}`;

/**
 * Офлайн ажиллахад ШААРДЛАГАТАЙ бүх файл.
 *
 * Шинэ модуль нэмэгдвэл ЭНД бас нэмэгдэх ёстой — эс бөгөөс офлайн үед апп
 * хагас ачаалагдана. Мартагдахаас сэргийлж `tests/pwa.test.js` нь index.html
 * болон js/-ийн import-уудыг гүйлгэж шалгана.
 */
const PRECACHE = [
  './index.html',
  './manifest.webmanifest',

  './css/base.css',
  './css/layout.css',
  './css/components.css',

  './js/main.js',
  './js/data.js',
  './js/dom.js',
  './js/safe-storage.js',
  './js/storage.js',
  './js/program.js',
  './js/schedule.js',
  './js/stats.js',
  './js/timer.js',
  './js/bridge.js',
  './js/updates.js',
  './js/ui.js',
  './js/views/day.js',
  './js/views/week.js',
  './js/views/history.js',
  './js/views/dayrow.js',

  './data/program.json',

  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

/** Аппын хүрээ — өөр аппын (жишээ нь summer-project) хүсэлтэд хуруу хүргэхгүй. */
const SCOPE = new URL('./', self.location.href);

/** Навигацийн хариу — бүх зам НЭГ л дэлгэц рүү очно. */
const INDEX = new URL('./index.html', self.location.href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `reload` — install хийж байгаа файлууд хөтчийн HTTP кэшнээс биш,
    // сүлжээнээс шинээр татагдана. Эс бөгөөс шинэ deploy дээр хуучин
    // хувилбар кэш рүү орох эрсдэлтэй.
    await cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Өмнөх хувилбаруудын кэшийг цэвэрлэнэ — утсан дээр хэдэн арван
    // хувилбарын хог үлдээх эрхгүй.
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('gym-shell-') && name !== CACHE)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

// js/updates.js "шинэчлэх" товч дарагдахад л энэ мессежийг илгээнэ.
// Өөрөө дур мэдэн skipWaiting хийхгүй: хэрэглэгч сет тэмдэглэж байх дунд
// хуудас солигдож, дасгалын жагсаалт нүднийх нь өмнө өөрчлөгдөх ёсгүй.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  event.respondWith(DEV ? networkFirst(request) : cacheFirst(request));
});

/**
 * Хуудас нээх хүсэлт. Ямар ч зам (?, #, дэд зам) нэг дэлгэц рүү очно.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleNavigate(request) {
  if (DEV) {
    const fresh = await fromNetwork(request);
    if (fresh) return fresh;
  }
  const cached = await caches.match(INDEX, { cacheName: CACHE });
  if (cached) return cached;

  const fresh = await fromNetwork(request);
  return fresh || offlineResponse();
}

/**
 * Кэш эхэнд. Тухайн хувилбарын кэш нь БҮТЭН, өөр хоорондоо таарсан файлуудыг
 * агуулдаг тул шинэчлэлтийг энд "хагас" татах шаардлагагүй — шинэ хувилбар
 * нь өөрийн кэштэйгээ бүтнээрээ солигдоно.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: CACHE });
  if (cached) return cached;

  const fresh = await fromNetwork(request);
  if (fresh) {
    await put(request, fresh.clone());
    return fresh;
  }
  return offlineResponse();
}

/**
 * Сүлжээ эхэнд, бүтэхгүй бол кэш. Локал хөгжүүлэлтэд ашиглагдана.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  const fresh = await fromNetwork(request);
  if (fresh) {
    await put(request, fresh.clone());
    return fresh;
  }
  const cached = await caches.match(request, { cacheName: CACHE });
  return cached || offlineResponse();
}

/**
 * Сүлжээнээс татна. Алдаа гарвал ШИДЭХГҮЙ, `null` буцаана — дуудагч тал
 * кэш рүү шилжих боломжтой байх ёстой.
 * @param {Request} request
 * @returns {Promise<Response|null>}
 */
async function fromNetwork(request) {
  try {
    return await fetch(request);
  } catch (err) {
    return null;
  }
}

/**
 * Кэшлэхэд тохиромжтой хариуг л хадгална. 404, 500, opaque хариу кэшэнд
 * орвол апп офлайн үед эвдэрсэн хуудас "амжилттай" харуулах болно.
 * @param {Request} request
 * @param {Response} response
 */
async function put(request, response) {
  if (!response.ok || response.type !== 'basic') return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

/**
 * Кэшэнд ч, сүлжээнд ч байхгүй үеийн сүүлчийн хариу.
 * @returns {Response}
 */
function offlineResponse() {
  return new Response('Офлайн байна.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
