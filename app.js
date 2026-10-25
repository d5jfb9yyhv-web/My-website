(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= LIQUID GLASS ENGINE =================
     For every .lg element we build a displacement map from the
     rounded-rect signed distance field. Refraction lives only in a
     band along the rim (like a real lens edge) — the centre stays clear.
     R/G encode the x/y offset along the inward normal. Chromium only
     supports url() filters in backdrop-filter; others keep frosted glass. */
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const chromium = brands.some(b => /Chromium/i.test(b.brand));
  const defs = document.getElementById('lg-defs');
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  function buildMap(w, h, r, band) {
    const s = Math.min(1, 240 / Math.max(w, h)) < .5 ? .5 : Math.min(1, 240 / Math.max(w, h));
    const cw = Math.max(2, Math.round(w * s)), ch = Math.max(2, Math.round(h * s));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(cw, ch); const d = img.data;
    const hw = w / 2, hh = h / 2;
    for (let j = 0; j < ch; j++) {
      const y = (j + .5) / s;
      for (let i = 0; i < cw; i++) {
        const x = (i + .5) / s;
        const px = x - hw, py = y - hh;
        const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        const sd = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
        let nx = 0, ny = 0;
        if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
        else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
        const depth = -sd;
        let m = 0;
        if (depth > 0 && depth < band) { const t = 1 - depth / band; m = t * t * (3 - 2 * t); }
        const k = (j * cw + i) * 4;
        // sample inward → backdrop bends toward the rim, like a convex lens edge
        d[k] = 128 - nx * m * 127;
        d[k + 1] = 128 - ny * m * 127;
        d[k + 2] = 128; d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function applyGlass(el) {
    const rect = el.getBoundingClientRect();
    const w = Math.round(el.offsetWidth || rect.width), h = Math.round(el.offsetHeight || rect.height);
    if (w < 4 || h < 4) return;
    if (el._lgSize === w + 'x' + h) return;
    el._lgSize = w + 'x' + h;
    let r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    r = Math.min(r, w / 2, h / 2);
    const band = Math.min(parseFloat(el.dataset.lg) || 16, Math.min(w, h) / 2);
    const id = el._lgId || (el._lgId = 'lg' + (++uid));
    let f = document.getElementById(id);
    if (!f) {
      f = document.createElementNS(NS, 'filter');
      f.id = id;
      f.setAttribute('filterUnits', 'userSpaceOnUse');
      f.setAttribute('primitiveUnits', 'userSpaceOnUse');
      f.setAttribute('color-interpolation-filters', 'sRGB');
      f.innerHTML = '<feImage result="map" preserveAspectRatio="none" x="0" y="0"/><feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"/>';
      defs.appendChild(f);
    }
    ['x', 'y'].forEach(a => f.setAttribute(a, 0));
    f.setAttribute('width', w); f.setAttribute('height', h);
    const fe = f.firstChild;
    fe.setAttribute('width', w); fe.setAttribute('height', h);
    fe.setAttribute('href', buildMap(w, h, r, band));
    f.lastChild.setAttribute('scale', Math.round(band * 1.5));
    el.style.setProperty('--lg-refract', `url(#${id})`);
  }

  const glass = [...document.querySelectorAll('.lg')];
  if (chromium && defs) {
    const ro = new ResizeObserver(entries => entries.forEach(e => applyGlass(e.target)));
    glass.forEach(el => ro.observe(el));
    document.documentElement.classList.add('lg-refract');
  }

  // specular highlight follows the pointer
  if (!reduce) {
    let raf = 0, last;
    addEventListener('pointermove', e => {
      last = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = last.target.closest && last.target.closest('.lg');
        if (!t) return;
        const b = t.getBoundingClientRect();
        t.style.setProperty('--mx', ((last.clientX - b.left) / b.width * 100).toFixed(1) + '%');
        t.style.setProperty('--my', ((last.clientY - b.top) / b.height * 100).toFixed(1) + '%');
      });
    }, { passive: true });
  }

  /* ================= Adaptive nav tint ================= */
  const nav = document.querySelector('.nav');
  const toned = [...document.querySelectorAll('[data-tone]')].filter(n => n !== nav);
  function tone() {
    const y = 38;
    for (const s of toned) {
      const b = s.getBoundingClientRect();
      if (b.top <= y && b.bottom > y) { if (nav.dataset.tone !== s.dataset.tone) nav.dataset.tone = s.dataset.tone; return; }
    }
  }
  addEventListener('scroll', tone, { passive: true }); tone();

  /* ================= iOS-style scroll behaviours ================= */
  let lastY = scrollY, ticking = false, navHover = false;
  const feature = document.querySelector('.feature');
  function onScroll() {
    ticking = false;
    const y = scrollY, dy = y - lastY;
    if (y < 240 || dy < -6) nav.classList.remove('is-min');
    else if (dy > 6 && y > 480 && !navHover) nav.classList.add('is-min');
    lastY = y;
    if (feature && !reduce) {
      const r = feature.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * .75)));
      feature.style.transform = `scale(${(.9 + .1 * p).toFixed(4)})`;
    }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  nav.addEventListener('pointerenter', () => { navHover = true; nav.classList.remove('is-min'); });
  nav.addEventListener('pointerleave', () => { navHover = false; });
  nav.addEventListener('pointermove', () => nav.classList.remove('is-min'), { passive: true });
  onScroll();

  /* ================= Mobile menu ================= */
  const toggle = document.querySelector('.menu-toggle');
  const sheet = document.querySelector('.sheet');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    sheet.hidden = !open;
  }
  toggle.addEventListener('click', () => setMenu(sheet.hidden));
  sheet.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) setMenu(false); });
  matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

  /* ================= Reveal ================= */
  document.querySelectorAll('.bento .tile').forEach(t => t.classList.add('reveal'));
  const rev = document.querySelectorAll('.reveal');
  rev.forEach(el => {
    const sibs = [...el.parentElement.children].filter(c => c.classList.contains('reveal'));
    const i = sibs.indexOf(el);
    if (i > 0) el.style.setProperty('--d', Math.min(i, 6) * 90 + 'ms');
  });
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    rev.forEach(el => io.observe(el));
  } else rev.forEach(el => el.classList.add('is-in'));

  /* ================= Segmented filter ================= */
  const seg = document.querySelector('.seg');
  const pill = seg.querySelector('.seg__pill');
  const segBtns = [...seg.querySelectorAll('.seg__btn')];
  const bento = document.querySelector('.bento');
  const tiles = [...bento.querySelectorAll('.tile')];
  let pillX = null, pillW = null;
  function movePill(btn, animate) {
    const x = btn.offsetLeft, w = btn.offsetWidth;
    if (animate && pillX !== null && !reduce && pill.animate) {
      const midX = (pillX + x) / 2, midW = Math.max(pillW, w) * 1.18 + Math.abs(x - pillX) * .25;
      pill.animate([
        { transform: `translateX(${pillX}px) scaleY(1)`, width: pillW + 'px' },
        { transform: `translateX(${midX - (midW - w) / 2}px) scaleY(.86)`, width: midW + 'px', offset: .45 },
        { transform: `translateX(${x}px) scaleY(1)`, width: w + 'px' }
      ], { duration: 560, easing: 'cubic-bezier(.3, 1.25, .45, 1)' });
    }
    pill.style.width = w + 'px';
    pill.style.transform = `translateX(${x}px)`;
    pillX = x; pillW = w;
  }
  segBtns.forEach(btn => btn.addEventListener('click', () => {
    segBtns.forEach(b => { const on = b === btn; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
    movePill(btn, true);
    btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const f = btn.dataset.filter;
    bento.className = 'bento' + (f === 'all' ? '' : ' is-filtered f-' + f);
    let k = 0;
    tiles.forEach(t => {
      const hide = f !== 'all' && t.dataset.cat !== f;
      t.classList.toggle('is-hidden', hide);
      t.classList.remove('pop');
      if (!hide && !reduce) { void t.offsetWidth; t.style.setProperty('--d', Math.min(k++, 8) * 55 + 'ms'); t.classList.add('reveal', 'is-in', 'pop'); }
    });
  }));
  tiles.forEach(t => t.addEventListener('animationend', () => t.classList.remove('pop')));
  const placePill = () => movePill(seg.querySelector('.seg__btn.is-active'), false);
  addEventListener('resize', placePill);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(placePill);
  placePill();

  /* ================= Lightbox (image + video) ================= */
  const lb = document.querySelector('.lightbox');
  const lbImg = lb.querySelector('img');
  const lbVid = lb.querySelector('video');
  const lbClose = lb.querySelector('.lightbox__close');
  let lastFocus;
  let srcEl = null;
  const SPRING = 'cubic-bezier(.32, 1.22, .5, 1)';
  function flip(media, from, reverse) {
    const to = media.getBoundingClientRect();
    if (!from || !to.width || reduce || !media.animate) return null;
    const sx = from.width / to.width, sy = from.height / to.height;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const start = { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '28px', opacity: .6 };
    const end = { transform: 'none', borderRadius: '22px', opacity: 1 };
    return media.animate(reverse ? [end, start] : [start, end], { duration: reverse ? 420 : 620, easing: reverse ? 'cubic-bezier(.4,0,.2,1)' : SPRING, fill: 'both' });
  }
  function closeLb() {
    if (lb.hidden || lb.classList.contains('is-closing')) return;
    const media = lbVid.hidden ? lbImg : lbVid;
    lbVid.pause();
    lb.classList.add('is-closing');
    const anim = flip(media, srcEl && srcEl.getBoundingClientRect(), true);
    const done = () => {
      lb.hidden = true; lb.classList.remove('is-closing', 'is-anim'); document.body.style.overflow = '';
      media.getAnimations && media.getAnimations().forEach(a => a.cancel());
      lbVid.removeAttribute('src'); lbVid.load();
      lastFocus && lastFocus.focus();
    };
    anim ? anim.finished.then(done, done) : done();
  }
  document.querySelectorAll('.tile__btn').forEach(b => b.addEventListener('click', () => {
    lastFocus = b; srcEl = b;
    const from = b.getBoundingClientRect();
    let media;
    if (b.dataset.video) {
      lbImg.hidden = true; lbVid.hidden = false; media = lbVid;
      lbVid.src = b.dataset.video; lbVid.muted = false; lbVid.play().catch(() => {});
    } else {
      lbVid.hidden = true; lbImg.hidden = false; media = lbImg;
      const im = b.querySelector('img');
      lbImg.alt = im ? im.alt : '';
      lbImg.src = b.dataset.full;
    }
    lb.classList.add('is-anim');
    lb.hidden = false; document.body.style.overflow = 'hidden';
    lbClose.focus();
    const go = () => flip(media, from, false);
    if (media === lbImg && !lbImg.complete) lbImg.addEventListener('load', go, { once: true });
    else if (media === lbVid && lbVid.readyState < 1) lbVid.addEventListener('loadedmetadata', go, { once: true });
    else go();
  }));
  lbClose.addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'Tab') { e.preventDefault(); lbClose.focus(); }
  });

  /* ================= Videos: play only while visible ================= */
  const bgVid = document.querySelector('.bg-video');
  const vt = document.querySelector('.reel__toggle');
  let userPaused = reduce;
  function syncVt() {
    const paused = bgVid.paused;
    vt.classList.toggle('is-paused', paused);
    vt.setAttribute('aria-label', paused ? 'Play background video' : 'Pause background video');
  }
  bgVid.addEventListener('play', syncVt); bgVid.addEventListener('pause', syncVt);
  vt.addEventListener('click', () => {
    if (bgVid.paused) { userPaused = false; bgVid.play().catch(() => {}); }
    else { userPaused = true; bgVid.pause(); }
  });
  syncVt();
  const tileVid = document.querySelector('.tile--video video');
  if ('IntersectionObserver' in window) {
    const vio = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting && !(v === bgVid && userPaused) && !(v === tileVid && reduce)) { v.preload = 'auto'; v.play().catch(() => {}); }
      else v.pause();
    }), { threshold: .15 });
    vio.observe(bgVid); if (tileVid) vio.observe(tileVid);
  }

  /* ================= Brief form ================= */
  const form = document.getElementById('brief');
  const err = form.querySelector('.form__error');
  const ok = form.querySelector('.form__ok');
  const els = form.elements;
  function brief() {
    const needs = [...form.querySelectorAll('input[name="need"]:checked')].map(i => i.value);
    return {
      name: els.name.value.trim(),
      email: els.email.value.trim(),
      needs, msg: els.msg.value.trim()
    };
  }
  function body(b) {
    return `Hi Abhishek,\n\nName: ${b.name}\nEmail: ${b.email || '-'}\nNeeds: ${b.needs.join(', ') || 'Not sure yet'}\n\n${b.msg || ''}`.trim();
  }
  function fail(text) { err.textContent = text; err.hidden = false; ok.hidden = true; }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const b = brief();
    if (!b.name || !/^\S+@\S+\.\S+$/.test(b.email)) {
      fail('Please add your name and a valid email.');
      (!b.name ? els.name : els.email).focus(); return;
    }
    err.hidden = true; ok.hidden = false;
    ok.textContent = 'Thank you — your email app is opening with your brief.';
    location.href = `mailto:the.abhishek1302@gmail.com?subject=${encodeURIComponent('Project brief — ' + b.name)}&body=${encodeURIComponent(body(b))}`;
  });
  document.getElementById('wa-send').addEventListener('click', () => {
    const b = brief();
    if (!b.name) { fail('Please add your name first.'); els.name.focus(); return; }
    err.hidden = true; ok.hidden = false;
    ok.textContent = 'Thank you — WhatsApp is opening with your brief.';
    window.open(`https://wa.me/918882758921?text=${encodeURIComponent(body(b))}`, '_blank', 'noopener');
  });
})();
