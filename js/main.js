// main.js — эхлүүлэх цэг. Модулиудыг холбож, апп-ыг ажиллуулна.

import { loadProgram, getDays } from './program.js';
import { loadState, reconcile } from './storage.js';
import { mount, showTab, showError } from './ui.js';

async function start() {
  try {
    loadState();               // хуучин өгөгдлийг унших + migration
    await loadProgram();       // data/program.json
    reconcile(getDays());      // хөтөлбөртэй таарахаа больсон хуучин тэмдэглэгээг цэгцлэх
    mount();                   // event binding
    showTab('today');
  } catch (err) {
    console.error(err);
    showError(
      'Хөтөлбөрийн файл (data/program.json) ачаалагдсангүй. ' +
      'Апп-ыг файлаар шууд нээсэн бол локал сервер ашиглана уу. ' +
      `Дэлгэрэнгүй: ${err.message}`
    );
  }
}

start();
