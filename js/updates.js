// updates.js — service worker-ийг бүртгэж, шинэ хувилбарыг хэрэглэгчид мэдэгдэнэ.
//
// Офлайн ажиллагааны нөгөө тал нь: файлууд кэшлэгдсэн болохоор шинэ deploy
// хийхэд ХУУЧИН хувилбар гарт үлдэх эрсдэлтэй. Тиймээс:
//
//   1. Шинэ sw.js илэрвэл ард нь чимээгүй татагдана (хуучин апп ажилласаар).
//   2. Бүрэн бэлэн болоход дэлгэцийн дээд талд ганц зурвас гарч ирнэ.
//   3. Хэрэглэгч дарвал л шинэчилнэ — сет тэмдэглэж байх дунд хуудас
//      өөрөө дахин ачаалагдаж, дасгалын жагсаалт нүдний өмнө солигдохгүй.
//
// Энэ файл ЗӨВХӨН өөрийн зурваснаас өөр DOM-д хүрэхгүй, аппын өгөгдөл мэдэхгүй.

import { h } from './dom.js';

/** sw.js-ийн зам. index.html-тэй ижил хавтсанд байх ёстой (scope = бүх апп). */
const SW_URL = './sw.js';

/** Шинэчлэлтийг хэдэн миллисекундэд нэг удаагаас илүү шалгахгүй. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** @type {ServiceWorkerRegistration|null} */
let registration = null;

/** Хэрэглэгч "шинэчлэх" дарсны дараа л хуудсыг дахин ачаална. */
let reloading = false;

let lastCheck = 0;

/**
 * Service worker дэмжигдэх орчин мөн үү.
 * `file://` дээр нээвэл дэмжигдэхгүй — тэр үед апп хэвийн, зүгээр офлайнгүй
 * ажиллана (алдаа биш).
 * @returns {boolean}
 */
function supported() {
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && window.location.protocol !== 'file:';
}

/** @returns {HTMLElement|null} */
function bannerNode() {
  return document.getElementById('update');
}

/**
 * "Шинэ хувилбар бэлэн" зурвасыг гаргана.
 * @param {ServiceWorker} worker хүлээж байгаа шинэ хувилбар
 */
function showBanner(worker) {
  const node = bannerNode();
  if (!node) return;

  node.replaceChildren(h('button', {
    type: 'button',
    class: 'update__button',
    text: 'Шинэ хувилбар бэлэн — дарж шинэчил'
  }));

  node.hidden = false;
  node.addEventListener('click', () => {
    node.hidden = true;
    reloading = true;
    // sw.js энэ мессежийг хүлээж байгаа: skipWaiting() хийж, идэвхжинэ.
    // Дараа нь controllerchange асаж, доорх сонсогч хуудсыг сэргээнэ.
    worker.postMessage({ type: 'skip-waiting' });
  }, { once: true });
}

/**
 * Бүртгэлийн төлөвийг харж, хүлээж байгаа хувилбар байвал зурвас гаргана.
 * @param {ServiceWorkerRegistration} reg
 */
function watch(reg) {
  // Аль хэдийн бэлэн болчихсон байж мэднэ (өмнөх нээлтэд татагдсан).
  if (reg.waiting && navigator.serviceWorker.controller) showBanner(reg.waiting);

  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;

    worker.addEventListener('statechange', () => {
      // controller байхгүй = АНХНЫ суулгалт. Тэр үед зурвас гаргах нь утгагүй,
      // харуулах "шинэ хувилбар" гэж байхгүй — энэ бол л тэр хувилбар.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showBanner(worker);
      }
    });
  });
}

/**
 * Service worker-ийг бүртгэнэ. Алдаа гарвал апп хэвийн ажиллана —
 * офлайн ажиллагаа бол нэмэлт давуу тал, шаардлага биш.
 */
export function registerServiceWorker() {
  if (!supported()) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Зөвхөн хэрэглэгч өөрөө шинэчлэхийг зөвшөөрсөн бол сэргээнэ.
    if (!reloading) return;
    reloading = false;
    window.location.reload();
  });

  navigator.serviceWorker.register(SW_URL, { scope: './' })
    .then((reg) => {
      registration = reg;
      lastCheck = Date.now();
      watch(reg);
    })
    .catch((err) => {
      console.warn('service worker бүртгэгдсэнгүй:', err);
    });
}

/**
 * Шинэ хувилбар гарсан эсэхийг шалгана. Апп руу буцаж ирэх бүрд дуудагдана,
 * гэхдээ цагт нэгээс олон удаа сүлжээ зовоохгүй.
 */
export function checkForUpdate() {
  if (!registration) return;
  const now = Date.now();
  if (now - lastCheck < CHECK_INTERVAL_MS) return;
  lastCheck = now;
  registration.update().catch(() => {
    // Сүлжээгүй байж болно — дараагийн удаа дахин оролдоно.
  });
}
