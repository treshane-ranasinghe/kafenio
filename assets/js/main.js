/* ==========================================================================
   Kafénio Colombo — interactions
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('is-booted');

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Opening hours in Colombo time, as minutes from midnight (daily 7 AM – 8 PM)
  const OPEN = 7 * 60;
  const CLOSE = 20 * 60;
  const TIMEZONE = 'Asia/Colombo';

  /* ---------- Helpers ---------- */
  function colomboNow() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type)?.value;
    return {
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
      minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
    };
  }

  // YYYY-MM-DD for "today" in Colombo, optionally offset by days
  function colomboDate(offsetDays = 0) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
    if (!offsetDays) return today;
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  /* ---------- Intro / preloader ---------- */
  function initIntro() {
    const loader = $('.loader');
    const heroImg = $('.hero__frame img');
    const started = performance.now();
    root.classList.add('is-locked');

    const imgReady = heroImg && !heroImg.complete
      ? new Promise(res => {
          heroImg.addEventListener('load', res, { once: true });
          heroImg.addEventListener('error', res, { once: true });
        })
      : Promise.resolve();
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    const timeout = new Promise(res => setTimeout(res, 2800));

    Promise.race([Promise.all([imgReady, fontsReady]), timeout]).then(() => {
      const minShow = reduceMotion ? 0 : 1300;
      setTimeout(() => {
        loader?.classList.add('is-done');
        root.classList.add('is-ready');
        root.classList.remove('is-locked');
        setTimeout(() => loader?.remove(), 1300);
      }, Math.max(0, minShow - (performance.now() - started)));
    });
  }

  /* ---------- Navigation ---------- */
  function initNav() {
    const nav = $('[data-nav]');
    const toggle = $('.nav__toggle');
    const menu = $('#mmenu');
    let lastY = scrollY;
    let open = false;

    const onScroll = () => {
      const y = scrollY;
      nav.classList.toggle('is-scrolled', y > 40);
      const dy = y - lastY;
      if (Math.abs(dy) > 8) {
        nav.classList.toggle('is-hidden', !open && dy > 0 && y > 320);
        lastY = y;
      }
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));

    const setOpen = state => {
      open = state;
      toggle.setAttribute('aria-expanded', String(state));
      toggle.setAttribute('aria-label', state ? 'Close menu' : 'Open menu');
      menu.classList.toggle('is-open', state);
      menu.inert = !state;
      root.classList.toggle('is-locked', state);
      nav.classList.remove('is-hidden');
    };
    toggle.addEventListener('click', () => setOpen(!open));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
    addEventListener('keydown', e => {
      if (e.key === 'Escape' && open) { setOpen(false); toggle.focus(); }
    });
    matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches && open) setOpen(false); });

    // Highlight the section currently in view
    const links = new Map($$('.nav__link').map(l => [l.getAttribute('href').slice(1), l]));
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => links.get(entry.target.id)?.classList.toggle('is-active', entry.isIntersecting));
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((_, id) => { const section = document.getElementById(id); if (section) spy.observe(section); });
  }

  /* ---------- Scroll reveals ---------- */
  // Wraps each word in a mask so headings can rise in word by word.
  // Punctuation stays inline so it never wraps onto its own line.
  function splitWords(el) {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            if (/^[.,;:!?…]+$/.test(part)) {
              const p = document.createElement('span');
              p.className = 'wp';
              p.textContent = part;
              frag.append(p);
              return;
            }
            const outer = document.createElement('span');
            const inner = document.createElement('span');
            outer.className = 'w';
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            outer.append(inner);
            frag.append(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
  }

  function initReveal() {
    $$('[data-split]').forEach(splitWords);
    $$('[data-gallery] .shot').forEach((shot, i) => shot.style.setProperty('--d', `${(i % 3) * 0.08}s`));

    const targets = $$('[data-reveal], [data-split]');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(t => t.classList.add('is-in'));
      return;
    }
    // Chrome measures intersection after the target's own clip-path, so a fully
    // clipped element would never "enter". Watch its parent instead.
    const watched = new Map();
    targets.forEach(t => {
      const node = t.dataset.reveal === 'clip' ? t.parentElement : t;
      watched.set(node, [...(watched.get(node) || []), t]);
    });
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        watched.get(entry.target).forEach(t => t.classList.add('is-in'));
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    watched.forEach((_, node) => io.observe(node));
  }

  /* ---------- Hero slideshow ---------- */
  function initHeroSlides() {
    const slides = $$('[data-slides] .hero__slide');
    const dots = $$('.hero__dots button');
    if (slides.length < 2) return;
    let index = 0;
    let timer = 0;

    const go = i => {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle('is-active', n === index));
      dots.forEach((d, n) => {
        d.classList.toggle('is-active', n === index);
        d.setAttribute('aria-pressed', String(n === index));
      });
    };
    const play = () => {
      clearInterval(timer);
      if (!reduceMotion) timer = setInterval(() => go(index + 1), 6500);
    };

    dots.forEach((dot, n) => dot.addEventListener('click', () => { go(n); play(); }));
    document.addEventListener('visibilitychange', () => (document.hidden ? clearInterval(timer) : play()));
    play();
  }

  /* ---------- Parallax & scroll-spun plates ---------- */
  function initParallax() {
    if (reduceMotion) return;
    const items = $$('[data-parallax]').map(el => ({ el, speed: parseFloat(el.dataset.parallax) || 0.1 }));
    const spinners = $$('[data-spin]').map(el => ({ el, deg: parseFloat(el.dataset.spin) || 10 }));
    if (!items.length && !spinners.length) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = innerHeight;
      items.forEach(({ el, speed }) => {
        const host = el.parentElement;
        const r = host.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const slack = (el.offsetHeight - host.offsetHeight) / 2;
        let y = (r.top + r.height / 2 - vh / 2) * speed;
        if (slack > 0) y = Math.max(-slack, Math.min(slack, y));
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      });
      // Rotate round dish photos gently as they travel through the viewport
      spinners.forEach(({ el, deg }) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const progress = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2)));
        el.style.rotate = `${(progress * deg).toFixed(2)}deg`;
      });
    };
    const request = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', request);
    update();
  }

  /* ---------- Live open / closed status ---------- */
  function initStatus() {
    const pills = $$('[data-status]');
    const hours = $$('.hours li');

    const update = () => {
      const { day, minutes } = colomboNow();
      let state = 'open';
      let text = 'Open now · Until 8 PM';
      if (minutes < OPEN) { state = 'closed'; text = 'Closed now · Opens at 7 AM'; }
      else if (minutes >= CLOSE) { state = 'closed'; text = 'Closed now · Opens 7 AM tomorrow'; }
      else if (minutes >= CLOSE - 45) { state = 'soon'; text = 'Closing soon · Open until 8 PM'; }

      pills.forEach(pill => {
        pill.dataset.state = state;
        $('[data-status-text]', pill).textContent = text;
      });
      hours.forEach(li => li.classList.toggle('is-today', Number(li.dataset.day) === day));
    };
    update();
    setInterval(update, 60_000);
  }

  /* ---------- Menu tabs ---------- */
  function initMenuTabs() {
    const tablist = $('[role="tablist"]');
    if (!tablist) return;
    const tabs = $$('[role="tab"]', tablist);
    const ink = $('.tabs__ink', tablist);
    const images = $$('[data-menu-img]');

    $$('.menu__panel').forEach(panel => $$('.dish', panel).forEach((dish, i) => dish.style.setProperty('--i', i)));

    const moveInk = tab => {
      ink.style.width = `${tab.offsetWidth}px`;
      ink.style.transform = `translateX(${tab.offsetLeft}px)`;
    };

    const activate = (tab, focus = false) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      images.forEach(img => img.classList.toggle('is-active', img.dataset.menuImg === tab.dataset.tab));
      moveInk(tab);
      tablist.scrollTo({ left: tab.offsetLeft - 16, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (focus) tab.focus();
    };

    tabs.forEach(tab => tab.addEventListener('click', () => activate(tab)));
    tablist.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = {
        ArrowRight: tabs[(i + 1) % tabs.length],
        ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
        Home: tabs[0],
        End: tabs[tabs.length - 1],
      }[e.key];
      if (next) { e.preventDefault(); activate(next, true); }
    });

    // Ritual cards and kitchen link open a specific tab
    $$('[data-open-tab]').forEach(link => link.addEventListener('click', () => {
      const tab = tabs.find(t => t.dataset.tab === link.dataset.openTab);
      if (tab) activate(tab);
    }));

    const sync = () => moveInk(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);
    sync();
    addEventListener('resize', sync);
    document.fonts?.ready.then(sync);
  }

  /* ---------- Gallery lightbox ---------- */
  function initLightbox() {
    const dialog = $('.lightbox');
    const shots = $$('[data-gallery] .shot');
    if (!dialog || !shots.length || typeof dialog.showModal !== 'function') return;

    const img = $('[data-lb-img]', dialog);
    const cap = $('[data-lb-cap]', dialog);
    const count = $('[data-lb-count]', dialog);
    const pad = n => String(n).padStart(2, '0');
    let index = 0;
    let request = 0;

    const show = i => {
      index = (i + shots.length) % shots.length;
      const shot = shots[index];
      const thumb = $('img', shot);
      const token = ++request;
      img.classList.add('is-swapping');

      const next = new Image();
      next.src = shot.dataset.full;
      const apply = () => {
        if (token !== request) return;
        img.src = next.src;
        img.alt = thumb.alt;
        cap.textContent = shot.dataset.caption;
        count.textContent = `${pad(index + 1)} / ${pad(shots.length)}`;
        requestAnimationFrame(() => img.classList.remove('is-swapping'));
      };
      next.decode ? next.decode().then(apply, apply) : (next.onload = apply);
    };

    shots.forEach((shot, i) => shot.addEventListener('click', () => {
      show(i);
      dialog.showModal();
      root.classList.add('is-locked');
    }));
    dialog.addEventListener('close', () => root.classList.remove('is-locked'));
    $('[data-lb-close]', dialog).addEventListener('click', () => dialog.close());
    $('[data-lb-prev]', dialog).addEventListener('click', () => show(index - 1));
    $('[data-lb-next]', dialog).addEventListener('click', () => show(index + 1));
    dialog.addEventListener('click', e => {
      if (e.target === dialog || e.target.classList.contains('lightbox__stage')) dialog.close();
    });
    dialog.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
    });

    let startX = 0;
    dialog.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    dialog.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------- Reservation form ---------- */
  function initReserve() {
    const form = $('[data-reserve]');
    if (!form) return;
    const success = $('[data-reserve-success]');
    const { date: dateInput, time: timeSelect } = form.elements;
    const toMinutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };

    // Half-hourly slots, last seating an hour before close
    for (let m = OPEN; m <= CLOSE - 60; m += 30) {
      timeSelect.add(new Option(formatTime(m), `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`));
    }

    const refreshTimes = () => {
      const isToday = dateInput.value === colomboDate();
      const { minutes } = colomboNow();
      [...timeSelect.options].forEach(o => {
        if (o.value) o.disabled = isToday && toMinutes(o.value) < minutes + 30;
      });
      if (timeSelect.selectedOptions[0]?.disabled) timeSelect.value = '';
    };

    const setDefaultDate = () => {
      const lastSlot = CLOSE - 60;
      const today = colomboDate();
      dateInput.min = today;
      dateInput.value = colomboNow().minutes + 30 > lastSlot ? colomboDate(1) : today;
      refreshTimes();
    };
    setDefaultDate();

    const rules = {
      name: v => v.trim().length >= 2 || 'Please tell us your name.',
      phone: v => /^\+?[\d\s-]{9,16}$/.test(v.trim()) || 'Please enter a valid phone number.',
      date: v => (v && v >= colomboDate()) || 'Please choose a date from today onwards.',
      time: v => Boolean(v) || 'Please choose a time.',
    };

    const check = name => {
      const input = form.elements[name];
      const result = rules[name](input.value);
      const ok = result === true;
      const field = input.closest('.field');
      field.classList.toggle('is-invalid', !ok);
      input.setAttribute('aria-invalid', String(!ok));
      $('.field__error', field).textContent = ok ? '' : result;
      return ok;
    };

    Object.keys(rules).forEach(name => {
      const input = form.elements[name];
      input.addEventListener('blur', () => { if (input.value) check(name); });
      input.addEventListener('input', () => { if (input.closest('.field').classList.contains('is-invalid')) check(name); });
      input.addEventListener('change', () => { if (input.closest('.field').classList.contains('is-invalid')) check(name); });
    });
    dateInput.addEventListener('change', refreshTimes);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const valid = Object.keys(rules).map(check).every(Boolean);
      if (!valid) { $('[aria-invalid="true"]', form)?.focus(); return; }

      const data = Object.fromEntries(new FormData(form));
      const button = $('[type="submit"]', form);
      button.disabled = true;
      button.classList.add('is-loading');

      // Frontend only — send `data` to your booking endpoint here, e.g.
      // await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      setTimeout(() => {
        button.disabled = false;
        button.classList.remove('is-loading');

        const when = new Date(`${data.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const guests = `${data.guests} ${data.guests === '1' ? 'guest' : 'guests'}`;
        $('[data-success-name]', success).textContent = data.name.trim().split(/\s+/)[0];
        $('[data-success-summary]', success).textContent =
          `We've noted your request for ${guests} on ${when} at ${timeSelect.selectedOptions[0].text}. ` +
          `Our team will call ${data.phone.trim()} shortly to confirm.`;
        form.hidden = true;
        success.hidden = false;
        success.focus();
      }, 900);
    });

    $('[data-reserve-again]', success).addEventListener('click', () => {
      form.reset();
      $$('.field', form).forEach(f => f.classList.remove('is-invalid'));
      $$('.field__error', form).forEach(el => { el.textContent = ''; });
      $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
      setDefaultDate();
      success.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    });
  }

  /* ---------- Boot ---------- */
  initIntro();
  initNav();
  initHeroSlides();
  initReveal();
  initParallax();
  initStatus();
  initMenuTabs();
  initLightbox();
  initReserve();
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();
