/* ==========================================================================
   Мастерская красоты — интерактив (без зависимостей)
   ========================================================================== */
(() => {
  'use strict';

  const SITE = window.SITE || {};
  const SERVICES = window.SERVICES || [];
  const doc = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const fmtPrice = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const fmtDur = (m) => { const h = Math.floor(m / 60), mm = m % 60; return h && mm ? `${h} ч ${mm} мин` : h ? `${h} ч` : `${mm} мин`; };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* приватный режим */ } },
  };
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const DOW_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const humanDate = (d) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${DOW_FULL[d.getDay()]}`;

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $('[data-toast]');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-shown'), 4500);
  }

  /* ---------------- отправка заявок ---------------- */
  async function send(payload) {
    if (SITE.demo) {
      console.info('[Мастерская красоты] Демо-режим: заявка не отправлена на сервер →', payload);
      await wait(900);
      return { ok: true, demo: true };
    }
    const url = new URL(SITE.booking_endpoint || 'api/send.php', SITE.root || location.href);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /* ---------------- прелоадер и появление заголовка ---------------- */
  function splitTitle() {
    $$('[data-split]').forEach((h) => {
      h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
      $$('.line', h).forEach((line, li) => {
        line.setAttribute('aria-hidden', 'true');
        if (line.querySelector('.word')) return;
        const text = line.textContent.trim();
        line.textContent = '';
        Array.from(text).forEach((ch, ci) => {
          const s = document.createElement('span');
          s.className = 'char';
          s.textContent = ch === ' ' ? ' ' : ch;
          s.style.setProperty('--ci', ci);
          s.style.setProperty('--li', li);
          line.appendChild(s);
        });
      });
      h.classList.add('is-split');
    });
  }

  function intro() {
    const pre = $('.preloader');
    const start = () => requestAnimationFrame(() => doc.classList.add('hero-in'));
    if (!pre) return start();
    if (reduced || session.get('mk-intro')) { pre.classList.add('is-gone'); return start(); }
    let done = false;
    const t0 = performance.now();
    const finish = () => {
      if (done) return;
      done = true;
      session.set('mk-intro', '1');
      pre.classList.add('is-done');
      setTimeout(start, 380);
      setTimeout(() => pre.classList.add('is-gone'), 1700);
    };
    const ready = () => setTimeout(finish, Math.max(0, 1750 - (performance.now() - t0)));
    if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready, { once: true });
    setTimeout(finish, 4000);
  }

  /* ---------------- шапка, меню, подсветка разделов ---------------- */
  function header() {
    const h = $('[data-header]');
    if (!h) return;
    const fab = $('[data-fab]');
    const dock = $('[data-dock]');
    const isHome = document.body.classList.contains('page-home');
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      h.classList.toggle('is-scrolled', y > 30);
      const hide = isHome && y < window.innerHeight * 0.55;
      if (fab) fab.classList.toggle('is-hidden', hide);
      if (dock) dock.classList.toggle('is-hidden', hide);
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  function mobileMenu() {
    const btn = $('[data-burger]');
    const menu = $('[data-mobile-menu]');
    if (!btn || !menu) return;
    const set = (open) => {
      doc.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      document.body.style.overflow = open ? 'hidden' : '';
    };
    btn.addEventListener('click', () => set(!doc.classList.contains('menu-open')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && doc.classList.contains('menu-open')) set(false); });
    window.addEventListener('resize', debounce(() => { if (window.innerWidth > 980) set(false); }, 200));
  }

  function navSpy() {
    if (!document.body.classList.contains('page-home') || !('IntersectionObserver' in window)) return;
    const links = $$('[data-nav]');
    const map = new Map();
    links.forEach((l) => { const sec = document.getElementById(l.dataset.nav); if (sec) map.set(sec, l); });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((l) => l.classList.remove('is-active'));
        const l = map.get(en.target);
        if (l) l.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, sec) => io.observe(sec));
  }

  /* ---------------- появление при прокрутке ---------------- */
  function reveal() {
    const els = $$('[data-reveal]');
    if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* ---------------- золотая пыль в первом экране ---------------- */
  function particles() {
    const canvas = $('[data-particles]');
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hero = canvas.parentElement;
    let w = 0, h = 0, parts = [], raf = 0, inView = true;
    const mouse = { x: -1e4, y: -1e4 };

    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const sc = sprite.getContext('2d');
    const g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,246,220,1)');
    g.addColorStop(0.16, 'rgba(242,214,148,.9)');
    g.addColorStop(0.42, 'rgba(201,164,92,.28)');
    g.addColorStop(1, 'rgba(201,164,92,0)');
    sc.fillStyle = g;
    sc.fillRect(0, 0, 64, 64);

    const spawn = (initial) => {
      const z = Math.random();
      return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 20,
        z,
        size: 3 + z * z * 18,
        vy: -(0.06 + z * 0.42),
        vx: (Math.random() - 0.5) * 0.14,
        ph: Math.random() * Math.PI * 2,
        sp: 0.006 + Math.random() * 0.028,
        sparkle: z > 0.88,
      };
    };
    const resize = () => {
      const r = hero.getBoundingClientRect();
      w = r.width; h = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(150, Math.max(45, (w * h) / 10500)));
      parts = Array.from({ length: count }, () => spawn(true));
    };
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        p.ph += p.sp;
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.ph * 0.5) * 0.18 * p.z;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 18000) {
          const d = Math.sqrt(d2) + 0.01, f = (1 - d2 / 18000) * 1.6 * (0.3 + p.z);
          p.x += (dx / d) * f; p.y += (dy / d) * f;
        }
        if (p.y < -30 || p.x < -40 || p.x > w + 40) Object.assign(p, spawn(false));
        const a = (0.3 + 0.7 * Math.abs(Math.sin(p.ph))) * (0.3 + p.z * 0.7);
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        if (p.sparkle) {
          const l = p.size * (0.7 + Math.sin(p.ph * 2) * 0.45);
          ctx.globalAlpha = a * 0.65;
          ctx.strokeStyle = '#fff1cc';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x - l, p.y); ctx.lineTo(p.x + l, p.y);
          ctx.moveTo(p.x, p.y - l); ctx.lineTo(p.x, p.y + l);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    const run = () => { if (!raf && inView && !document.hidden) raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    resize();
    run();
    new ResizeObserver(debounce(resize, 200)).observe(hero);
    new IntersectionObserver(([en]) => { inView = en.isIntersecting; inView ? run() : stop(); }).observe(hero);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
    if (finePointer) {
      hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
      hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -1e4; });
    }
  }

  function heroParallax() {
    const hero = $('.hero');
    if (!hero || reduced) return;
    const orn = $('[data-parallax]', hero);
    const content = $('[data-hero-content]', hero);
    let mx = 0, my = 0, tx = 0, ty = 0, raf = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    function loop() {
      raf = 0;
      tx += (mx - tx) * 0.07;
      ty += (my - ty) * 0.07;
      const sy = window.scrollY, hh = hero.offsetHeight;
      if (sy < hh * 1.1) {
        if (orn) orn.style.transform = `translate3d(${(tx * -34).toFixed(2)}px, ${(ty * -34 + sy * 0.18).toFixed(2)}px, 0)`;
        if (content) {
          content.style.transform = `translate3d(${(tx * 12).toFixed(2)}px, ${(sy * 0.3).toFixed(2)}px, 0)`;
          content.style.opacity = String(Math.max(0, 1 - sy / (hh * 0.8)));
        }
      }
      if (Math.abs(mx - tx) > 0.001 || Math.abs(my - ty) > 0.001) kick();
    }
    if (finePointer) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        mx = (e.clientX - r.left) / r.width - 0.5;
        my = (e.clientY - r.top) / r.height - 0.5;
        kick();
      });
    }
    window.addEventListener('scroll', kick, { passive: true });
  }

  function spotlight() {
    if (!finePointer) return;
    $$('[data-spotlight]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ==========================================================================
     Перекидной календарь на кольцах
     ========================================================================== */
  // Кольца переплёта. В центре — разрыв под подпись, как у настенного календаря с крючком.
  function ringLayout(width, label) {
    const min = width < 560 ? 90 : 150;
    const gap = Math.round(Math.min(width * 0.62, Math.max(min, (label ? label.offsetWidth : 0) + 28)));
    const step = width < 560 ? 30 : 38;
    let n = Math.round((width - gap - 40) / step);
    n = Math.max(4, Math.min(18, n - (n % 2)));
    return { n, gap, key: `${n}:${gap}` };
  }
  const ringsHTML = (n, cls, gap) => {
    const half = Math.floor(n / 2);
    const one = `<span class="${cls}"></span>`;
    return one.repeat(half) + `<i class="gap" style="width:${gap}px"></i>` + one.repeat(n - half);
  };

  class FlipCal {
    constructor(root) {
      this.root = root;
      this.stack = $('.flipcal__stack', root);
      this.pages = $$('.flipcal__page', this.stack);
      this.rings = $('.flipcal__rings', root);
      this.counter = $('[data-flip-counter]', root);
      this.tabs = root.id ? $$(`[data-flip-tabs="${root.id}"] [data-flip-to]`) : [];
      this.n = this.pages.length;
      this.cur = 0;
      this.busy = false;
      if (!this.n) return;

      this.pages.forEach((p) => {
        const back = document.createElement('div');
        back.className = 'flipcal__back';
        back.setAttribute('aria-hidden', 'true');
        p.appendChild(back);
        const holes = document.createElement('div');
        holes.className = 'flipcal__holes';
        holes.setAttribute('aria-hidden', 'true');
        $('.flipcal__face', p).prepend(holes);
      });
      this.label = $('.flipcal__label', root);
      this.buildRings();
      new ResizeObserver(debounce(() => this.buildRings(), 120)).observe(this.stack);
      if (document.fonts) document.fonts.ready.then(() => this.buildRings());

      const prev = $('[data-flip-prev]', root);
      const next = $('[data-flip-next]', root);
      if (prev) prev.addEventListener('click', () => this.goTo(this.cur - 1));
      if (next) next.addEventListener('click', () => this.goTo(this.cur + 1));
      this.tabs.forEach((t) => t.addEventListener('click', () => this.goTo(Number(t.dataset.flipTo))));

      this.stack.addEventListener('click', (e) => {
        if (this.suppressClick) { this.suppressClick = false; return; }
        if (e.target.closest('a, button')) return;
        this.goTo(this.cur + 1);
      });
      let sx = 0, sy = 0, tracking = false;
      this.stack.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; tracking = true; });
      this.stack.addEventListener('pointerup', (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          this.suppressClick = true;
          setTimeout(() => { this.suppressClick = false; }, 450);
          this.goTo(this.cur + (dx < 0 ? 1 : -1));
        }
      });
      this.stack.addEventListener('pointercancel', () => { tracking = false; });
      root.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); this.goTo(this.cur + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.goTo(this.cur - 1); }
      });

      root.classList.add('is-ready');
      this.update();
    }

    buildRings() {
      const L = ringLayout(this.stack.clientWidth || 500, this.label);
      if (L.key === this.ringKey) return;
      this.ringKey = L.key;
      this.rings.innerHTML = ringsHTML(L.n, 'flipcal__ring', L.gap);
      $$('.flipcal__holes', this.root).forEach((h) => { h.innerHTML = ringsHTML(L.n, '', L.gap); });
    }

    update() {
      this.pages.forEach((p, i) => {
        const d = i - this.cur;
        p.style.setProperty('--depth', Math.max(0, d));
        p.classList.toggle('is-current', d === 0);
        p.classList.toggle('is-gone', d < 0);
        p.classList.toggle('is-under-1', d === 1);
        p.classList.toggle('is-under-2', d === 2);
        p.classList.toggle('is-deep', d > 3);
        p.setAttribute('aria-hidden', String(d !== 0));
        if ('inert' in p) p.inert = d !== 0;
      });
      if (this.counter) this.counter.innerHTML = `<b>${pad(this.cur + 1)}</b> / ${pad(this.n)}`;
      this.tabs.forEach((t, i) => {
        const on = i === this.cur;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', String(on));
      });
      const tab = this.tabs[this.cur];
      const list = tab && tab.parentElement;
      if (list && list.scrollWidth > list.clientWidth + 4) {
        const lr = list.getBoundingClientRect(), tr = tab.getBoundingClientRect();
        list.scrollTo({ left: list.scrollLeft + (tr.left - lr.left) - lr.width / 2 + tr.width / 2, behavior: reduced ? 'auto' : 'smooth' });
      }
    }

    goTo(target, instant = false) {
      const t = ((target % this.n) + this.n) % this.n;
      if (this.busy || t === this.cur) return;
      if (reduced || instant) { this.cur = t; this.update(); return; }
      this.busy = true;
      const forward = t > this.cur;
      const page = forward ? this.pages[this.cur] : this.pages[t];
      const cls = forward ? 'is-flip-up' : 'is-flip-down';
      this.cur = t;
      page.classList.add(cls);
      this.update();
      let timer;
      const done = () => {
        clearTimeout(timer);
        page.removeEventListener('animationend', onEnd);
        page.classList.remove(cls);
        this.busy = false;
      };
      const onEnd = (e) => { if (e.target === page && !e.pseudoElement) done(); };
      page.addEventListener('animationend', onEnd);
      timer = setTimeout(done, 1300);
    }

    indexOf(id) { return this.pages.findIndex((p) => p.dataset.cat === id); }
  }
  const calendars = {};

  function priceHashes() {
    const cal = calendars['price-cal'];
    if (!cal) return;
    const fromHash = (instant) => {
      const m = location.hash.match(/^#price-([\w-]+)/);
      if (!m) return;
      const i = cal.indexOf(m[1]);
      if (i >= 0) cal.goTo(i, instant);
    };
    fromHash(true);
    window.addEventListener('hashchange', () => fromHash(false));
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#price-"]');
      if (!a || a.pathname !== location.pathname) return;
      const i = cal.indexOf(a.hash.replace('#price-', ''));
      if (i >= 0) setTimeout(() => cal.goTo(i), 450);
    });
  }

  function staticSheet() {
    const sheet = $('[data-sheet]');
    if (!sheet) return;
    const rings = $('[data-static-rings]');
    const holes = $('[data-static-holes]');
    const label = $('.sheet-wrap .flipcal__label');
    const build = () => {
      const L = ringLayout(sheet.clientWidth, label);
      if (rings) rings.innerHTML = ringsHTML(L.n, 'flipcal__ring', L.gap);
      if (holes) holes.innerHTML = ringsHTML(L.n, '', L.gap);
    };
    build();
    new ResizeObserver(debounce(build, 150)).observe(sheet);
    if (document.fonts) document.fonts.ready.then(build);
  }

  /* ==========================================================================
     Маска телефона и проверка форм
     ========================================================================== */
  function maskPhone(input) {
    if (input.dataset.masked) return;
    input.dataset.masked = '1';
    const format = (v) => {
      let d = v.replace(/\D/g, '');
      if (!d) return '';
      if (d[0] === '8') d = '7' + d.slice(1);
      else if (d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      let out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 4) out += ')';
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      return out;
    };
    let prevDigits = '';
    input.addEventListener('input', (e) => {
      if (e.inputType && e.inputType.startsWith('delete')) {
        input.value = input.value.replace(/[^\d]+$/, '');
        prevDigits = input.value.replace(/\D/g, '');
        return;
      }
      let d = input.value.replace(/\D/g, '');
      // Привычка набирать «8 903…» после подставленного «+7 (»: восьмёрку считаем кодом страны
      if (d.length > 1 && d[0] === '7' && (d[1] === '8' || d[1] === '7') && (prevDigits.length <= 1 || d.length > 11)) d = '7' + d.slice(2);
      input.value = format(d);
      prevDigits = input.value.replace(/\D/g, '');
    });
    input.addEventListener('focus', () => { if (!input.value) input.value = '+7 ('; });
    input.addEventListener('blur', () => {
      if (input.value.replace(/\D/g, '').length <= 1) input.value = '';
      else input.value = format(input.value);
    });
  }
  const phoneOk = (v) => v.replace(/\D/g, '').length === 11;

  function setError(input, msg) {
    const field = input.closest('.field, .check');
    if (!field) return;
    field.classList.toggle('is-invalid', Boolean(msg));
    const er = field.querySelector('.field__error');
    if (er) er.textContent = msg || '';
    input.setAttribute('aria-invalid', String(Boolean(msg)));
  }

  function validate(form) {
    const errors = [];
    const name = form.querySelector('[name="name"][required]');
    const phone = form.querySelector('[data-phone]');
    const consent = form.querySelector('[name="consent"]');
    if (name) { const bad = name.value.trim().length < 2; setError(name, bad ? 'Укажите имя' : ''); if (bad) errors.push(name); }
    if (phone) { const bad = !phoneOk(phone.value); setError(phone, bad ? 'Введите номер полностью: +7 (XXX) XXX-XX-XX' : ''); if (bad) errors.push(phone); }
    if (consent) { const bad = !consent.checked; setError(consent, bad ? 'Нужно согласие' : ''); if (bad) errors.push(consent); }
    if (errors.length) { errors[0].focus(); return false; }
    return true;
  }

  function liveClear(form) {
    form.addEventListener('input', (e) => { if (e.target.matches('.input, [type="checkbox"]')) setError(e.target, ''); });
    form.addEventListener('change', (e) => { if (e.target.matches('[type="checkbox"]')) setError(e.target, ''); });
  }

  async function withBusy(btn, fn) {
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Отправляем…';
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
  }

  function callbackForms() {
    $$('form[data-callback]').forEach((form) => {
      liveClear(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validate(form)) return;
        if (form.website && form.website.value) return;
        const btn = form.querySelector('[type="submit"]');
        try {
          await withBusy(btn, () => send({
            type: 'callback',
            name: form.name.value.trim(),
            phone: form.querySelector('[data-phone]').value,
            time: form.time ? form.time.value : '',
            page: location.href,
          }));
          const ok = form.nextElementSibling;
          form.hidden = true;
          if (ok && ok.classList.contains('cb-success')) {
            ok.hidden = false;
            requestAnimationFrame(() => ok.classList.add('is-shown'));
          }
        } catch (err) {
          console.error(err);
          toast(`Не получилось отправить заявку. Позвоните нам: ${SITE.phone || ''}`);
        }
      });
    });
  }

  /* ==========================================================================
     Онлайн-запись
     ========================================================================== */
  class Booking {
    constructor(root) {
      this.root = root;
      this.uid = 'bk' + Math.random().toString(36).slice(2, 7);
      this.state = { cat: SERVICES[0] ? SERVICES[0].id : '', service: null, date: null, time: null };
      const today = new Date();
      this.view = new Date(today.getFullYear(), today.getMonth(), 1);
      this.render();
    }

    render() {
      const u = this.uid;
      const privacy = new URL('privacy.html', SITE.root || location.href).href;
      this.root.innerHTML = `
        <div class="bk-steps" aria-hidden="true">
          <div class="bk-step" data-ind="1"><b>I</b>Услуга</div>
          <div class="bk-step" data-ind="2"><b>II</b>Дата и время</div>
          <div class="bk-step" data-ind="3"><b>III</b>Контакты</div>
        </div>
        <div class="bk-panel" data-step="1">
          <h3 class="bk-title">Выберите услугу</h3>
          <div class="chips" role="tablist" aria-label="Направления">
            ${SERVICES.map((c) => `<button type="button" class="chip" role="tab" data-cat="${c.id}">${esc(c.short)}</button>`).join('')}
          </div>
          <div class="bk-services" role="radiogroup" aria-label="Услуги" data-services></div>
          <div class="bk-nav"><span class="muted" style="font-size:13px">Шаг 1 из 3</span><button type="button" class="btn btn--gold" data-next>Дальше${icon('i-arrow', 'icon icon--arrow')}</button></div>
        </div>
        <div class="bk-panel" data-step="2">
          <h3 class="bk-title">Дата и время</h3>
          <div class="dt">
            <div class="mcal">
              <div class="mcal__head"><span class="mcal__month" data-month></span>
                <div class="mcal__nav"><button type="button" data-mprev aria-label="Предыдущий месяц">${icon('i-chev-l')}</button><button type="button" data-mnext aria-label="Следующий месяц">${icon('i-chev-r')}</button></div>
              </div>
              <div class="mcal__grid" data-days></div>
            </div>
            <div><p class="slots__title" data-slots-title></p><div class="slots" data-slots></div></div>
          </div>
          <div class="bk-nav"><button type="button" class="bk-back" data-back>${icon('i-arrow-left')}Назад</button><button type="button" class="btn btn--gold" data-next>Дальше${icon('i-arrow', 'icon icon--arrow')}</button></div>
        </div>
        <div class="bk-panel" data-step="3">
          <h3 class="bk-title">Ваши контакты</h3>
          <form data-bk-form novalidate>
            <div class="form-grid">
              <div class="field"><label for="${u}-name">Имя *</label><input class="input" id="${u}-name" name="name" autocomplete="name" required placeholder="Как к вам обращаться"><span class="field__error" aria-live="polite"></span></div>
              <div class="field"><label for="${u}-phone">Телефон *</label><input class="input" id="${u}-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="+7 (___) ___-__-__" data-phone><span class="field__error" aria-live="polite"></span></div>
              <div class="field full"><label for="${u}-comment">Комментарий</label><textarea class="input" id="${u}-comment" name="comment" rows="3" placeholder="Пожелания к мастеру, дополнительные услуги…"></textarea></div>
              <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
              <label class="check full"><input type="checkbox" name="consent" required><span class="check__box"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span><span>Согласен(на) на <a href="${privacy}" target="_blank">обработку персональных данных</a></span></label>
            </div>
            <div class="bk-summary" data-summary></div>
            <div class="bk-nav"><button type="button" class="bk-back" data-back>${icon('i-arrow-left')}Назад</button><button type="submit" class="btn btn--gold" data-submit>Записаться${icon('i-check')}</button></div>
          </form>
        </div>
        <div class="bk-panel" data-step="4" aria-live="polite">
          <div class="success">
            <svg class="success__mark" viewBox="0 0 104 104" aria-hidden="true"><circle pathLength="1" cx="52" cy="52" r="50"/><path pathLength="1" d="M32 53l14 14 27-29"/></svg>
            <h3>Заявка отправлена!</h3>
            <p data-success-text></p>
            <div class="success__actions"><button type="button" class="btn" data-ics>${icon('i-calendar')}В календарь</button><button type="button" class="btn btn--gold" data-again>Новая запись</button></div>
          </div>
        </div>`;

      const r = this.root;
      $$('.chip', r).forEach((ch) => ch.addEventListener('click', () => {
        this.state.cat = ch.dataset.cat;
        if (this.state.service && this.state.service.cat !== this.state.cat) this.state.service = null;
        this.renderServices();
      }));
      $$('[data-next]', r).forEach((b) => b.addEventListener('click', () => this.next()));
      $$('[data-back]', r).forEach((b) => b.addEventListener('click', () => this.goStep(this.step - 1, true)));
      $('[data-mprev]', r).addEventListener('click', () => { this.view = new Date(this.view.getFullYear(), this.view.getMonth() - 1, 1); this.renderMonth(); });
      $('[data-mnext]', r).addEventListener('click', () => { this.view = new Date(this.view.getFullYear(), this.view.getMonth() + 1, 1); this.renderMonth(); });
      $('[data-days]', r).addEventListener('click', (e) => {
        const b = e.target.closest('[data-day]');
        if (!b || b.disabled) return;
        this.state.date = new Date(this.view.getFullYear(), this.view.getMonth(), Number(b.dataset.day));
        this.state.time = null;
        this.renderMonth();
        this.renderSlots();
      });
      $('[data-slots]', r).addEventListener('click', (e) => {
        const b = e.target.closest('[data-time]');
        if (!b || b.disabled) return;
        this.state.time = b.dataset.time;
        $$('.slot', r).forEach((s) => s.classList.toggle('is-selected', s === b));
        this.updateNext();
      });
      const form = $('[data-bk-form]', r);
      maskPhone($('[data-phone]', form));
      liveClear(form);
      form.addEventListener('submit', (e) => this.submit(e));
      $('[data-ics]', r).addEventListener('click', () => this.ics());
      $('[data-again]', r).addEventListener('click', () => {
        this.state = { cat: this.state.cat, service: null, date: null, time: null };
        form.reset();
        this.renderServices();
        this.goStep(1, true);
      });
      this.renderServices();
      this.goStep(1);
    }

    renderServices() {
      const cat = SERVICES.find((c) => c.id === this.state.cat) || SERVICES[0];
      if (!cat) return;
      this.state.cat = cat.id;
      $$('.chip', this.root).forEach((ch) => {
        const on = ch.dataset.cat === cat.id;
        ch.classList.toggle('is-active', on);
        ch.setAttribute('aria-selected', String(on));
      });
      const wrap = $('[data-services]', this.root);
      const sel = this.state.service;
      wrap.innerHTML = cat.services.map((s, i) => `
        <label class="bk-option">
          <input type="radio" name="${this.uid}-svc" value="${i}" ${sel && sel.cat === cat.id && sel.name === s.name ? 'checked' : ''}>
          <span class="bk-option__radio"></span>
          <span class="bk-option__name">${esc(s.name)}<small>${fmtDur(s.duration)}</small></span>
          <span class="bk-option__price">${s.from ? 'от ' : ''}${fmtPrice(s.price)}&nbsp;₽</span>
        </label>`).join('') +
        (cat.medical ? '<p class="muted" style="font-size:12.5px;margin:6px 0 0">Имеются противопоказания. Необходима консультация специалиста.</p>' : '');
      $$('input', wrap).forEach((inp) => inp.addEventListener('change', () => {
        const s = cat.services[Number(inp.value)];
        this.state.service = { ...s, cat: cat.id, catTitle: cat.title };
        this.state.time = null;
        this.updateNext();
      }));
      this.updateNext();
    }

    preselect(catId, serviceName) {
      if (this.step === 4) this.state = { cat: this.state.cat, service: null, date: null, time: null };
      if (catId && SERVICES.some((c) => c.id === catId)) {
        if (this.state.cat !== catId) this.state.service = null;
        this.state.cat = catId;
      }
      if (serviceName) {
        const cat = SERVICES.find((c) => c.id === this.state.cat);
        const s = cat && cat.services.find((x) => x.name === serviceName);
        if (s) this.state.service = { ...s, cat: cat.id, catTitle: cat.title };
      }
      this.renderServices();
      this.goStep(1);
    }

    slotsFor(date) {
      const [oh, om] = String(SITE.open || '09:00').split(':').map(Number);
      const [ch, cm] = String(SITE.close || '21:00').split(':').map(Number);
      const dur = this.state.service ? this.state.service.duration : 60;
      const from = oh * 60 + om, to = ch * 60 + cm;
      const now = new Date();
      const minToday = now.getHours() * 60 + now.getMinutes() + 60;
      const today = sameDay(date, now);
      const out = [];
      for (let t = from; t + dur <= to; t += 30) out.push({ t, label: `${pad(Math.floor(t / 60))}:${pad(t % 60)}`, disabled: today && t < minToday });
      return out;
    }

    firstAvailable() {
      const today = startOfDay(new Date());
      for (let i = 0; i < 60; i++) {
        const d = addDays(today, i);
        if (this.slotsFor(d).some((s) => !s.disabled)) return d;
      }
      return today;
    }

    renderMonth() {
      const today = startOfDay(new Date());
      const max = addDays(today, 60);
      const y = this.view.getFullYear(), m = this.view.getMonth();
      $('[data-month]', this.root).textContent = `${MONTHS[m]} ${y}`;
      const offset = (new Date(y, m, 1).getDay() + 6) % 7;
      const days = new Date(y, m + 1, 0).getDate();
      let html = DOW.map((d) => `<span class="mcal__dow">${d}</span>`).join('');
      for (let i = 0; i < offset; i++) html += '<span></span>';
      for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d);
        const off = date < today || date > max || !this.slotsFor(date).some((s) => !s.disabled);
        const cls = ['mcal__day', sameDay(date, today) ? 'is-today' : '', sameDay(date, this.state.date) ? 'is-selected' : ''].join(' ').trim();
        html += `<button type="button" class="${cls}" data-day="${d}" ${off ? 'disabled' : ''} aria-label="${d} ${MONTHS_GEN[m]}"${sameDay(date, this.state.date) ? ' aria-pressed="true"' : ''}>${d}</button>`;
      }
      $('[data-days]', this.root).innerHTML = html;
      $('[data-mprev]', this.root).disabled = y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth());
      $('[data-mnext]', this.root).disabled = y > max.getFullYear() || (y === max.getFullYear() && m >= max.getMonth());
    }

    renderSlots() {
      const title = $('[data-slots-title]', this.root);
      const box = $('[data-slots]', this.root);
      if (!this.state.date) { title.textContent = 'Выберите дату'; box.innerHTML = ''; return; }
      title.innerHTML = `Время на <b>${humanDate(this.state.date)}</b>`;
      const slots = this.slotsFor(this.state.date);
      box.innerHTML = slots.length
        ? slots.map((s) => `<button type="button" class="slot${s.label === this.state.time ? ' is-selected' : ''}" data-time="${s.label}" ${s.disabled ? 'disabled' : ''}>${s.label}</button>`).join('')
        : '<p class="slots__empty">На этот день свободного времени нет — выберите другую дату.</p>';
      this.updateNext();
    }

    renderSummary() {
      const s = this.state;
      $('[data-summary]', this.root).innerHTML = `
        <div><span>Услуга</span><b>${esc(s.service.name)}</b></div>
        <div><span>Дата и время</span><b>${humanDate(s.date)}, ${s.time}</b></div>
        <div><span>Стоимость</span><b>${s.service.from ? 'от ' : ''}${fmtPrice(s.service.price)}&nbsp;₽ · ${fmtDur(s.service.duration)}</b></div>`;
    }

    updateNext() {
      const ok = this.step === 1 ? Boolean(this.state.service) : this.step === 2 ? Boolean(this.state.date && this.state.time) : true;
      const btn = $(`.bk-panel[data-step="${this.step}"] [data-next]`, this.root);
      if (btn) btn.disabled = !ok;
    }

    next() {
      if (this.step === 1 && !this.state.service) return;
      if (this.step === 2 && !(this.state.date && this.state.time)) return;
      this.goStep(this.step + 1, true);
    }

    goStep(n, user = false) {
      this.step = Math.max(1, Math.min(4, n));
      $$('.bk-panel', this.root).forEach((p) => p.classList.toggle('is-active', Number(p.dataset.step) === this.step));
      $$('[data-ind]', this.root).forEach((s) => {
        const i = Number(s.dataset.ind);
        s.classList.toggle('is-active', i === this.step);
        s.classList.toggle('is-done', i < this.step || this.step === 4);
      });
      if (this.step === 2) {
        if (!this.state.date) {
          this.state.date = this.firstAvailable();
          this.view = new Date(this.state.date.getFullYear(), this.state.date.getMonth(), 1);
        }
        this.renderMonth();
        this.renderSlots();
      }
      if (this.step === 3) this.renderSummary();
      this.updateNext();
      if (user) {
        const top = this.root.getBoundingClientRect().top;
        if (top < 70 && !this.root.closest('dialog')) window.scrollBy({ top: top - 110, behavior: reduced ? 'auto' : 'smooth' });
        const title = $(`.bk-panel[data-step="${this.step}"] .bk-title, .bk-panel[data-step="${this.step}"] h3`, this.root);
        if (title) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
      }
    }

    async submit(e) {
      e.preventDefault();
      const form = e.target;
      if (!validate(form)) return;
      if (form.website && form.website.value) return;
      const s = this.state;
      const name = form.name.value.trim();
      const phone = form.phone.value;
      try {
        await withBusy($('[data-submit]', form), () => send({
          type: 'booking',
          category: s.service.catTitle,
          service: s.service.name,
          price: (s.service.from ? 'от ' : '') + s.service.price + ' ₽',
          duration: fmtDur(s.service.duration),
          date: `${s.date.getFullYear()}-${pad(s.date.getMonth() + 1)}-${pad(s.date.getDate())}`,
          date_human: humanDate(s.date),
          time: s.time,
          name,
          phone,
          comment: form.comment.value.trim(),
          page: location.href,
        }));
        $('[data-success-text]', this.root).textContent =
          `${name}, мы получили заявку на «${s.service.name}» — ${humanDate(s.date)} в ${s.time}. Администратор перезвонит на ${phone}, чтобы подтвердить визит.`;
        this.goStep(4, true);
      } catch (err) {
        console.error(err);
        toast(`Не получилось отправить заявку. Позвоните нам: ${SITE.phone || ''}`);
      }
    }

    ics() {
      const s = this.state;
      if (!s.date || !s.time || !s.service) return;
      const [h, mi] = s.time.split(':').map(Number);
      const start = new Date(s.date.getFullYear(), s.date.getMonth(), s.date.getDate(), h, mi);
      const end = new Date(start.getTime() + s.service.duration * 60000);
      const f = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Masterskaya krasoty//RU', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
        `UID:${Date.now()}@masterskaya-krasoty`, `DTSTAMP:${stamp}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
        `SUMMARY:${s.service.name} — Мастерская красоты`, `LOCATION:${(SITE.address_short || '').replace(/,/g, '\\,')}`,
        `DESCRIPTION:Запись ожидает подтверждения администратора. Телефон: ${SITE.phone || ''}`,
        'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Визит в «Мастерскую красоты»', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR',
      ];
      const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'masterskaya-krasoty.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
  }

  /* ---------------- модальные окна ---------------- */
  let inlineBooking = null;
  let modalBooking = null;

  function openDialog(id) {
    const d = document.getElementById(id);
    if (!d) return null;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    doc.style.overflow = 'hidden';
    return d;
  }

  function dialogs() {
    $$('dialog.modal').forEach((d) => {
      d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
      d.addEventListener('close', () => {
        doc.style.overflow = '';
        const ok = $('.cb-success', d);
        const form = $('form[data-callback]', d);
        if (ok && form && !ok.hidden) { ok.hidden = true; ok.classList.remove('is-shown'); form.hidden = false; form.reset(); }
      });
    });
  }

  /* ---------------- онлайн-запись через ClickTak ----------------
     Если в content/site.json задан clicktak.url, запись идёт в ClickTak: реальные свободные окна,
     журнал администратора, напоминания клиенту. Иначе работает встроенная форма сайта (ниже). */
  const CT = SITE.clicktak && SITE.clicktak.url && SITE.clicktak.business ? SITE.clicktak : null;
  const ctBookUrl = (service) => CT && `${CT.url}/b/${encodeURIComponent(CT.business)}/book?src=site&embed=1&theme=dark${service ? `&service=${service}` : ''}`;

  function clickTakWidget() {
    if (!CT) return;
    const s = document.createElement('script');
    s.src = `${CT.url}/widget.js`;
    s.async = true;
    s.dataset.business = CT.business;
    s.dataset.theme = 'dark';
    s.dataset.color = CT.color || '#c9a45c';
    s.dataset.button = 'false';
    document.body.appendChild(s);
  }

  function clickTakInline(host) {
    host.classList.add('ct-frame');
    host.innerHTML = `<p class="ct-frame__wait">Загружаем свободное время…</p><noscript><p>Для онлайн-записи включите JavaScript или позвоните нам: <a href="tel:${esc(SITE.phone_href || '')}">${esc(SITE.phone || '')}</a>.</p></noscript>`;
    const load = () => {
      if (host.dataset.loaded) return;
      host.dataset.loaded = '1';
      const f = document.createElement('iframe');
      f.src = ctBookUrl();
      f.title = 'Онлайн-запись';
      f.allow = 'clipboard-write';
      f.addEventListener('load', () => host.classList.add('is-loaded'));
      host.appendChild(f);
    };
    if (!('IntersectionObserver' in window)) return load();
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { load(); io.disconnect(); } }, { rootMargin: '600px 0px' });
    io.observe(host);
  }

  function openBooking(cat, svc) {
    if (CT) {
      const service = (CT.services || {})[cat] || '';
      if (window.ClickTak) window.ClickTak.open({ service });
      else window.open(ctBookUrl(service).replace('&embed=1', ''), '_blank', 'noopener');
      return;
    }
    const section = document.getElementById('booking');
    if (inlineBooking && section) {
      inlineBooking.preselect(cat, svc);
      section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    const host = $('[data-booking-modal]');
    if (!host) return;
    if (!modalBooking) modalBooking = new Booking(host);
    modalBooking.preselect(cat, svc);
    openDialog('booking-modal');
  }

  function delegates() {
    document.addEventListener('click', (e) => {
      const book = e.target.closest('[data-book]');
      if (book) { e.preventDefault(); openBooking(book.dataset.book || '', book.dataset.bookService || ''); return; }
      const cb = e.target.closest('[data-callback-open]');
      if (cb) { e.preventDefault(); openDialog('callback-modal'); }
    });
  }

  /* ---------------- карта: загружаем, когда секция рядом ---------------- */
  function lazyMap() {
    const box = $('[data-map]');
    if (!box || !box.dataset.src) return;
    const load = () => {
      if (box.dataset.loaded) return;
      box.dataset.loaded = '1';
      const f = document.createElement('iframe');
      f.src = box.dataset.src;
      f.title = `Карта: ${SITE.address_short || 'салон на карте'}`;
      f.loading = 'lazy';
      f.allowFullscreen = true;
      box.appendChild(f);
    };
    if (!('IntersectionObserver' in window)) return load();
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { load(); io.disconnect(); } }, { rootMargin: '500px 0px' });
    io.observe(box);
  }

  /* ---------------- мягкие переходы между страницами ---------------- */
  function pageTransitions() {
    if (reduced) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.origin !== location.origin) return;
      if (a.pathname === location.pathname) return;
      if (!/\.html$|\/$/.test(a.pathname)) return;
      e.preventDefault();
      doc.classList.add('page-leave');
      setTimeout(() => { location.href = a.href; }, 260);
    });
    window.addEventListener('pageshow', () => doc.classList.remove('page-leave'));
  }

  /* ---------------- старт ---------------- */
  splitTitle();
  intro();
  header();
  mobileMenu();
  navSpy();
  reveal();
  particles();
  heroParallax();
  spotlight();
  $$('[data-flipcal]').forEach((el) => { calendars[el.id || `cal${Object.keys(calendars).length}`] = new FlipCal(el); });
  priceHashes();
  staticSheet();
  $$('[data-phone]').forEach(maskPhone);
  callbackForms();
  dialogs();
  delegates();
  const bookingHost = $('[data-booking]');
  if (CT) {
    clickTakWidget();
    if (bookingHost) clickTakInline(bookingHost);
  } else if (bookingHost && SERVICES.length) inlineBooking = new Booking(bookingHost);
  lazyMap();
  pageTransitions();
})();
