/**
 * Генерирует картинку для соцсетей (og-image.jpg, 1200×630) и apple-touch-icon.png.
 * Запуск: node tools/make-images.js  (нужен Playwright: npm i -D playwright && npx playwright install chromium)
 */
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', 'public');
const fs = require('fs');
const fontUrl = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'fonts', f)).toString('base64');

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:C;font-style:normal;src:url('${fontUrl('cormorant-garamond-normal-cyrillic.woff2')}')}
@font-face{font-family:C;font-style:italic;src:url('${fontUrl('cormorant-garamond-italic-cyrillic.woff2')}')}
@font-face{font-family:M;src:url('${fontUrl('manrope-normal-cyrillic.woff2')}')}
html,body{margin:0;width:1200px;height:630px;background:#0a0a0b;overflow:hidden}
body{display:grid;place-items:center;position:relative;font-family:C,serif;color:#ece6d9;
 background:radial-gradient(60% 70% at 50% 45%,rgba(201,164,92,.22),transparent 70%),#0a0a0b}
.ring{position:absolute;border-radius:50%;border:1px solid rgba(201,164,92,.35);left:50%;top:50%;transform:translate(-50%,-50%)}
.c{text-align:center;position:relative}
.e{font:600 18px M,sans-serif;letter-spacing:.42em;color:#c9a45c;text-transform:uppercase}
h1{margin:18px 0 8px;font-weight:300;font-size:132px;line-height:.9}
h1 em{display:block;font-style:italic;background:linear-gradient(115deg,#8a6a2c,#f4e2a6 40%,#c9a45c 60%,#a8823f);-webkit-background-clip:text;color:transparent;padding:0 .1em}
p{font:500 22px M,sans-serif;color:#cfc7b6;margin:26px 0 0;letter-spacing:.04em}
.frame{position:absolute;inset:26px;border:1px solid rgba(201,164,92,.4)}
.frame:after{content:"";position:absolute;inset:8px;border:1px solid rgba(201,164,92,.18)}
</style></head><body>
<div class="ring" style="width:560px;height:560px"></div><div class="ring" style="width:620px;height:620px;border-style:dashed;opacity:.6"></div>
<div class="frame"></div>
<div class="c"><div class="e">Салон красоты · Реутов</div><h1>Мастерская<em>красоты</em></h1>
<p>Стрижки · Маникюр · Педикюр · Массаж · Гирудотерапия · Хиджама · Косметология</p></div></body></html>`;

const icon = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:C;font-style:italic;src:url('${fontUrl('cormorant-garamond-italic-cyrillic.woff2')}')}
html,body{margin:0;width:180px;height:180px;background:#0a0a0b;display:grid;place-items:center}
.m{width:150px;height:150px;border-radius:50%;border:2px solid #c9a45c;display:grid;place-items:center;
 font:italic 400 70px C,serif;background:linear-gradient(115deg,#a8823f,#f4e2a6 45%,#c9a45c);-webkit-background-clip:text;color:transparent}
</style></head><body><div class="m">МК</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(og); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(ROOT, 'assets/img/og-image.jpg'), type: 'jpeg', quality: 88 });
  await p.setViewportSize({ width: 180, height: 180 });
  await p.setContent(icon); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(ROOT, 'assets/img/apple-touch-icon.png') });
  await b.close();
  console.log('og-image.jpg и apple-touch-icon.png готовы');
})();
