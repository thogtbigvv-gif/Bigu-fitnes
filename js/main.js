// main.js — эхлүүлэх цэг ба амьдралын мөчлөг.
// Модулиудыг холбож, апп-ыг ажиллуулна. Аппын БҮХ таймер, БҮХ гадаад
// event энд бүртгэгддэг — өмнө нь ui.js, main.js хоёр тус тусдаа
// visibilitychange сонсдог байсныг нэг газар цуглууллаа.

import { STATE_KEY, msUntilMidnight, todayString } from './data.js';
import { flushBridge, publishBridge, schedulePublish } from './bridge.js';
import { loadProgram, getDays } from './program.js';
import { dayForDate } from './schedule.js';
import { loadState, reconcile, reload, subscribe } from './storage.js';
import { checkForUpdate, registerServiceWorker } from './updates.js';
import * as timer from './timer.js';
import {
  mount,
  refreshDate,
  refreshNotice,
  render,
  showError,
  showTab,
  visibleExerciseIds
} from './ui.js';

/** Хамгийн сүүлд ямар өдөр байсан бэ — шөнө дундыг давсныг мэдэхэд. */
let lastDate = todayString();

/** Товлогдсон шөнө дундын сэрүүлэг — давхар товлохоос сэргийлнэ. */
/** @type {ReturnType<typeof setTimeout>|null} */
let midnightHandle = null;

/**
 * Огноо солигдсон эсэхийг шалгана. Апп нээлттэй хэвээр шөнө дундыг давахад
 * "өнөөдөр" хуучин өдөр дээрээ гацаж үлдэхээс сэргийлнэ.
 * @returns {boolean} солигдсон эсэх
 */
function checkDate() {
  const now = todayString();
  if (now === lastDate) return false;
  lastDate = now;
  refreshDate();
  schedulePublish();
  return true;
}

/** Дараагийн шөнө дунд яг тэр агшинд сэрнэ, дараа нь дахин товлоно. */
function scheduleMidnight() {
  if (midnightHandle) clearTimeout(midnightHandle);
  midnightHandle = setTimeout(() => {
    midnightHandle = null;
    checkDate();
    scheduleMidnight();
  }, msUntilMidnight());
}

function bindLifecycle() {
  // Апп-ыг орхиод буцаж ирэх: өдөр солигдсон байж болно, тоолуур урагшилсан
  // байна, өөр табд өгөгдөл өөрчлөгдсөн байж мэднэ.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Далд болох агшинд хүлээгдэж байгаа feed бичилтийг гүйцээнэ — эс бөгөөс
      // сүүлийн хэдэн сет гадагш гарч амжихгүй үлдэнэ.
      flushBridge();
      return;
    }
    reload();
    if (!checkDate()) render();
    // Шөнө дундыг далд байхад давсан бол товлолт хоцорсон байж мэднэ.
    scheduleMidnight();
    schedulePublish();
    // Апп руу буцаж ирэх нь шинэ хувилбар шалгах хамгийн тохиромжтой мөч —
    // хэрэглэгч энэ агшинд юу ч дараагүй байна.
    checkForUpdate();
  });

  // Апп бүрмөсөн хаагдах / арын дэвсгэр рүү орох сүүлчийн боломж.
  window.addEventListener('pagehide', flushBridge);

  // Ижил апп өөр табд нээлттэй бол тэндхийн тэмдэглэгээг тусгана.
  window.addEventListener('storage', (event) => {
    if (event.key !== STATE_KEY) return;
    reload();   // reload() өөрөө сонсогчдод мэдэгдэнэ (тооцооны кэш цэвэрлэгдэнэ)
    render();
  });

  // Баригдаагүй алдаа гарвал чимээгүй хагарсан дэлгэц үлдээхгүй.
  window.addEventListener('error', (event) => {
    console.error('Баригдаагүй алдаа:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Баригдаагүй promise алдаа:', event.reason);
  });

  scheduleMidnight();
}

/**
 * Эхлүүлэлтийн алхмуудыг тус тусад нь барина.
 *
 * Урьд нь бүх алхам НЭГ try/catch дотор байсан тул `mount()` дотор гарсан
 * алдаа ч гэсэн "program.json ачаалагдсангүй" гэж буруу мэдээлэгддэг байв.
 */
async function start() {
  try {
    loadState();               // хуучин өгөгдлийг унших + migration
  } catch (err) {
    console.error(err);
    // Хадгалалт бүрэн боломжгүй ч апп нь ажиллах ёстой — зөвхөн мэдээлнэ.
  }

  try {
    await loadProgram();       // data/program.json
  } catch (err) {
    console.error(err);
    showError(
      'Хөтөлбөрийн файл (data/program.json) ачаалагдсангүй. ' +
      'Апп-ыг файлаар шууд нээсэн бол локал сервер ашиглана уу. ' +
      `Дэлгэрэнгүй: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  try {
    // Хөтөлбөртэй таарахаа больсон хуучин тэмдэглэгээг цэгцлэх. Өдөр
    // солилцоог тооцсон зураглалыг дамжуулна — эс бөгөөс зөөгдсөн өдрийн
    // тэмдэглэгээ хуучин төлөвлөгөөндөө наалдаж үлдэнэ.
    reconcile(getDays(), dayForDate);

    // Гадагш чиглэсэн feed: тэмдэглэгээ бичигдэх бүрд gym:bridge шинэчлэгдэнэ.
    // Дараалсан тэмдэглэгээ бүрд биш, тэдгээрийн төгсгөлд нэг удаа бичигдэнэ.
    subscribe(schedulePublish);
    // Хадгалалт бүтэхгүй бол мэдэгдэл нь тэр дор нь гарч ирнэ.
    subscribe(refreshNotice);

    mount();                   // event binding
    showTab('today');

    // Заал дээр утас түгжигдээд хуудас дахин ачаалагдсан бол амралтын
    // тоолуур үргэлжилсэн хэвээр байх ёстой.
    if (timer.restore(visibleExerciseIds())) render();

    bindLifecycle();
    publishBridge();

    // Офлайн ажиллагаа. Апп бүрэн ажиллаж эхэлсний ДАРАА бүртгэнэ —
    // service worker нь нэмэлт давуу тал, эхлүүлэлтийн нөхцөл биш.
    registerServiceWorker();
  } catch (err) {
    console.error(err);
    showError(
      'Апп эхлэхэд алдаа гарлаа. Хуудсыг дахин ачаална уу. ' +
      `Дэлгэрэнгүй: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

start();
