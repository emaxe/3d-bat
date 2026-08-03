// Точка входа: создаём игру.
import { Game } from './game.js';

// Копирование в буфер с фолбэком (сайт на HTTP — navigator.clipboard недоступен).
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return Promise.resolve(ok);
  } catch {
    return Promise.resolve(false);
  }
}

// Любая ошибка — сразу на экран, чтобы было видно причину + кнопка копирования.
function showFatal(title, message) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:10px;left:10px;right:10px;z-index:9999;' +
    'background:#7a1020;color:#fff;font:13px/1.5 monospace;' +
    'padding:12px 16px;border-radius:10px;border:2px solid #ff5566;' +
    'box-shadow:0 6px 24px rgba(0,0,0,0.5);';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px;';
  const titleEl = document.createElement('b');
  titleEl.textContent = title;
  titleEl.style.flex = '1';
  const btn = document.createElement('button');
  btn.textContent = '📋 Копировать';
  btn.style.cssText =
    'background:rgba(255,255,255,0.14);color:#fff;border:1px solid rgba(255,255,255,0.35);' +
    'border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer;flex:0 0 auto;';
  btn.addEventListener('click', () => {
    copyText(title + '\n' + message).then(ok => {
      btn.textContent = ok ? '✓ Скопировано' : '✗ Ошибка копирования';
      btn.style.borderColor = ok ? '#7ee0a0' : '#ff5566';
      setTimeout(() => { btn.textContent = '📋 Копировать'; btn.style.borderColor = 'rgba(255,255,255,0.35)'; }, 1800);
    });
  });
  head.append(titleEl, btn);

  const msg = document.createElement('pre');
  msg.textContent = message;
  msg.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;font:inherit;';

  el.append(head, msg);
  document.body.appendChild(el);
}

window.addEventListener('error', e => showFatal('Ошибка JS:', e.message + '\n' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => showFatal('Ошибка Promise:', String(e.reason)));

// Проверка WebGL до создания игры (встроенный браузер Telegram часто его не даёт).
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

try {
  if (!webglAvailable()) {
    showFatal(
      'WebGL недоступен',
      'Браузер не поддерживает WebGL — 3D не запустится.\n' +
      'Откройте ссылку в обычном браузере (Chrome / Safari / Firefox),\n' +
      'а не во встроенном браузере Telegram.'
    );
  } else {
    const game = new Game(document.getElementById('app'));
    game.start();
    window.__game = game;
  }
} catch (err) {
  showFatal('Не удалось запустить игру:', String((err && err.stack) || err));
}
