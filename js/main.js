// main.js — эхлүүлэх цэг. Модулиудыг холбож, апп-ыг ажиллуулна.

import { loadProgram } from './program.js';
import { loadState } from './storage.js';
import { mount, showTab, showError } from './ui.js';

async function start() {
  try {
    loadState();          // хуучин өгөгдлийг унших + migration
    await loadProgram();  // data/program.json
    mount();              // event binding
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
