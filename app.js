/* RoundNotes v0.3 — note taking, archiving and search for clinical rounds. */
'use strict';
(function () {

  // ===================== Utilities =====================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad2 = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const today = () => isoDate(new Date());
  const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtD = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
  const fmtDM = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const digits = s => String(s == null ? '' : s)
    .replace(/[٠-٩]/g, c => AR_DIGITS.indexOf(c)).replace(/[۰-۹]/g, c => FA_DIGITS.indexOf(c)).replace(/[٫,]/g, '.');
  const num = s => { const t = digits(s).trim(); if (t === '' || t === '-' || t === '.') return null; const v = Number(t); return isFinite(v) ? v : null; };
  const round = (v, dp) => { const f = Math.pow(10, dp); return Math.round(v * f) / f; };
  const natCmp = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
  // Dose clean-up: no trailing zeros (5.0 → 5), always a leading zero (.5 → 0.5).
  const cleanDose = s => {
    let t = digits(s).trim();
    if (!t) return '';
    t = t.replace(/(^|[^\d])\.(\d)/g, '$10.$2');
    t = t.replace(/(\d+)\.(\d*?)0+(?!\d)/g, (m, a, b) => b ? `${a}.${b}` : a);
    return t;
  };
  // Lower-case and drop accents so "behcet" finds "Behçet" and "sjogren" finds "Sjögren".
  const fold = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const fmtNum = v => (typeof v === 'number') ? String(round(v, 3)) : String(v);

  const I = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
    scan: '<svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>',
    finger: '<svg viewBox="0 0 24 24"><path d="M12 11v3a8 8 0 0 1-1.5 4.7M8.5 7.5A5 5 0 0 1 17 11v1.5M7 11a5 5 0 0 1 .3-1.7M16.8 15.5c-.2 1.3-.6 2.6-1.3 3.7M12 7a4 4 0 0 0-4 4v2c0 1.5-.4 3-1.2 4.2M4.5 13.5V11a7.5 7.5 0 0 1 14.6-2.4"/></svg>',
    bksp: '<svg viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M12 9l6 6M18 9l-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    logo: '<svg viewBox="0 0 108 108" width="56" height="56"><path fill="#fff" d="M38,30 h32 a4,4 0 0 1 4,4 v42 a4,4 0 0 1 -4,4 h-32 a4,4 0 0 1 -4,-4 v-42 a4,4 0 0 1 4,-4 z"/><path fill="#CDEFEA" d="M46,26 h16 a3,3 0 0 1 3,3 v5 h-22 v-5 a3,3 0 0 1 3,-3 z"/><path fill="none" stroke="#0F6B63" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M40,56 h8 l4,-9 l6,18 l4,-9 h8"/><path stroke="#9FB8B4" stroke-width="2.6" stroke-linecap="round" d="M42,70 h24"/></svg>'
  };

  // ===================== Native bridge =====================
  const B = (() => {
    const A = window.Android;
    if (A) {
      return {
        native: true,
        load: () => A.loadData(),
        save: s => A.saveData(s),
        wipe: () => A.wipeData(),
        hasPin: () => A.hasPin(),
        setPin: p => A.setPin(p),
        checkPin: p => A.checkPin(p),
        bioAvail: () => { try { return A.biometricAvailable(); } catch (e) { return false; } },
        bioAuth: () => A.biometricAuth(),
        exportBackup: (json, pw, name) => A.exportBackup(json, pw, name),
        importBackup: pw => A.importBackup(pw),
        copy: t => A.copyText(t),
        print: title => { try { A.printPage(title); return true; } catch (e) { return false; } },
        savePdf: (lines, name) => { try { A.savePdf(JSON.stringify(lines), name); return true; } catch (e) { return false; } },
        version: () => A.appVersion(),
        syncReminders: j => { try { A.syncReminders(j); } catch (e) { } },
        notifyState: () => { try { return A.notifyState(); } catch (e) { return 'granted'; } },
        askNotify: () => { try { A.askNotify(); } catch (e) { setTimeout(() => window.onNotifyResult && window.onNotifyResult('denied'), 10); } },
        openAppSettings: () => { try { A.openAppSettings(); } catch (e) { } },
        launchRem: () => { try { return A.takeLaunchReminder() || ''; } catch (e) { return ''; } },
        insets: () => A.getInsets(),
        bars: d => A.setDarkBars(d)
      };
    }
    // Web edition (iPhone, iPad): web-bridge.js provides encrypted storage, backups and PDFs.
    if (window.RNWeb) return window.RNWeb;
    // Browser fallback, used only when testing the screens outside the Android app.
    const LS = window.localStorage;
    return {
      native: false,
      load: () => LS.getItem('rn_dev_data') || '',
      save: s => { LS.setItem('rn_dev_data', s); return true; },
      wipe: () => { LS.removeItem('rn_dev_data'); LS.removeItem('rn_dev_pin'); return true; },
      hasPin: () => !!LS.getItem('rn_dev_pin'),
      setPin: p => { LS.setItem('rn_dev_pin', p); return true; },
      checkPin: p => LS.getItem('rn_dev_pin') === p,
      bioAvail: () => false,
      bioAuth: () => { },
      exportBackup: (json, pw, name) => { window.__lastBackup = { json, pw, name }; setTimeout(() => window.onExportDone('ok', ''), 10); },
      importBackup: pw => {
        const b = window.__lastBackup;
        setTimeout(() => {
          if (!b) window.onImportDone('cancel', '');
          else if (b.pw !== pw) window.onImportDone('badpassword', '');
          else window.onImportDone('ok', b.json);
        }, 10);
      },
      copy: t => { window.__copied = t; },
      print: () => { window.__printed = (window.__printed || 0) + 1; try { window.print(); } catch (e) { } setTimeout(() => window.onPrintDone && window.onPrintDone('ok', ''), 50); return true; },
      savePdf: (lines, name) => { window.__pdf = { lines, name }; setTimeout(() => window.onPdfDone && window.onPdfDone('ok', ''), 50); return true; },
      version: () => 'dev',
      syncReminders: j => { window.__rem = JSON.parse(j); window.__remSyncs = (window.__remSyncs || 0) + 1; },
      notifyState: () => window.__notify || 'granted',
      askNotify: () => { window.__asked = (window.__asked || 0) + 1; setTimeout(() => { window.__notify = window.__notifyAnswer || 'granted'; window.onNotifyResult && window.onNotifyResult(window.__notify); }, 20); },
      openAppSettings: () => { window.__openedSettings = (window.__openedSettings || 0) + 1; },
      launchRem: () => { const v = window.__launchRem || ''; window.__launchRem = ''; return v; },
      insets: () => '0,0',
      bars: () => { }
    };
  })();

  // ===================== Glossary =====================
  const GL = new Map();
  const addGl = (a, f) => { if (!a || !f || a === f) return; if (!GL.has(a)) GL.set(a, new Set()); GL.get(a).add(f); };
  // Diagnoses by specialty, built from the master list (one ICD-10 code per name).
  const DX = {};
  SPECIALTIES.forEach(sp => { DX[sp.key] = DX_MASTER.filter(d => d[3].includes(sp.tag)).map(d => [d[0], d[1], d[2]]); });
  const DXMAP = Object.fromEntries(DX_MASTER.map(d => [d[0], { f: d[1], icd: d[2] }]));
  const icdOf = name => (DXMAP[name] || {}).icd || '';
  const dxMeaning = name => DXMAP[name] ? DXMAP[name].f : glText(name);
  DX_MASTER.forEach(([a, f]) => addGl(a, f));
  Object.values(INV).forEach(l => l.forEach(([a, f]) => addGl(a, f)));
  [COMORB, ROUTES, FREQS, O2, GLOSSARY_EXTRA].forEach(l => l.forEach(([a, f]) => addGl(a, f)));
  LABS.forEach(l => addGl(l.k, l.n));
  const glText = a => { const s = GL.get(a); return s ? [...s].join(' / ') : ''; };
  function explain(text) {
    if (!text) return '';
    const direct = glText(text);
    if (direct) return `<b>${esc(text)}</b> = ${esc(direct)}`;
    const parts = [], seen = new Set();
    const tryTok = t => {
      if (!t || seen.has(t)) return false;
      const m = glText(t);
      if (m) { seen.add(t); parts.push(`<b>${esc(t)}</b> = ${esc(m)}`); return true; }
      return false;
    };
    String(text).split(/\s+/).forEach(tok => {
      const t = tok.replace(/^[(]+|[),.;:?]+$/g, '');
      if (tryTok(t)) return;
      t.split(/[/&+,]/).forEach(x => tryTok(x.replace(/[?:.]$/, '')));
    });
    return parts.join('<br>');
  }

  // ===================== State =====================
  let S = null;            // all data (kept in memory only while unlocked)
  let unlocked = false;
  let lastPause = Date.now();
  const ui = { homeTab: 'round', spec: 'All', ward: 'All', att: 'All', ptab: {}, noLockUntil: 0, showStopped: {}, showDone: {}, allComorb: {} };
  const CUSTOM_KEYS = ['dx', 'comorb', 'inv', 'meds', 'plan', 'allergy', 'consult', 'proc', 'org'];
  const freshSettings = () => ({ retention: 30, defSpec: 'Nephrology', custom: { dx: [], comorb: [], inv: [], meds: [], plan: [], allergy: [], consult: [], proc: [], org: [] }, lastBackup: null, autoLog: false, testRem: null, lastAtt: '' });
  const newState = () => ({ v: 2, settings: freshSettings(), patients: [], logbook: [] });
  const renameDx = t => DX_RENAME[t] || t;
  const renameComorb = t => COMORB_RENAME[t] || t;

  function normalize(st) {
    st.settings = Object.assign(freshSettings(), st.settings || {});
    st.settings.custom = Object.assign(freshSettings().custom, st.settings.custom || {});
    st.patients = Array.isArray(st.patients) ? st.patients : [];
    st.logbook = Array.isArray(st.logbook) ? st.logbook : [];
    st.patients.forEach(p => {
      ['problems', 'comorb', 'labs', 'imaging', 'meds', 'plan', 'notes', 'allergies', 'calcs', 'advice', 'consults'].forEach(k => { if (!Array.isArray(p[k])) p[k] = []; });
      if (!p.status) p.status = 'active';
      if (typeof p.memo !== 'string') p.memo = '';
      if (typeof p.attending !== 'string') p.attending = '';
      migrateCultures(p);
      if (!p.allergyStatus) p.allergyStatus = p.allergies.length ? 'yes' : 'unknown';
      p.labs.forEach(e => { e.values = e.values || {}; e.orig = e.orig || {}; e.units = e.units || {}; });
      // v0.1 → v0.2 names (main term first, fewer uncommon abbreviations)
      if (p.mainDx) p.mainDx = renameDx(p.mainDx);
      p.problems.forEach(x => { x.text = renameDx(x.text); });
      p.comorb = [...new Set(p.comorb.map(renameComorb))];
      p.notes.forEach(n => { if (n.vitals && n.vitals.o2) n.vitals.o2 = O2_RENAME[n.vitals.o2] || n.vitals.o2; });
    });
    st.settings.custom.dx = [...new Set(st.settings.custom.dx.map(renameDx))].filter(x => !DXMAP[x]);
    st.settings.custom.comorb = [...new Set(st.settings.custom.comorb.map(renameComorb))].filter(x => !COMORB.some(c => c[0] === x));
    st.v = 2;
    return st;
  }

  function loadState() {
    let raw = '';
    try { raw = B.load(); } catch (e) { raw = ''; }
    if (raw === '!ERR') return 'ERR';
    if (!raw) { S = newState(); return 'OK'; }
    try { S = normalize(JSON.parse(raw)); return 'OK'; } catch (e) { return 'ERR'; }
  }

  let saveTimer = null;
  function save(now) {
    if (!S) return;
    clearTimeout(saveTimer);
    const run = () => { if (!S) return; const ok = B.save(JSON.stringify(S)); if (ok === false) toast('Could not save — is the phone storage full?'); try { syncReminders(); } catch (e) { } };
    if (now) run(); else saveTimer = setTimeout(run, 250);
  }
  const touch = p => { p.updated = Date.now(); };
  const getP = id => S && S.patients.find(p => p.id === id);
  const lockMin = () => { const v = localStorage.getItem('rn_lock'); return v == null ? 2 : Number(v); };
  const bioEnabled = () => localStorage.getItem('rn_bio') !== '0' && B.bioAvail();
  const themeSetting = () => localStorage.getItem('rn_theme') || 'auto';

  // ===================== Theme & insets =====================
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    const t = themeSetting();
    const dark = t === 'dark' || (t === 'auto' && mq && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { B.bars(dark); } catch (e) { }
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);
  window.onInsets = (t, b) => {
    document.documentElement.style.setProperty('--sat', (Number(t) || 0) + 'px');
    document.documentElement.style.setProperty('--sab', (Number(b) || 0) + 'px');
  };
  try { const [t, b] = String(B.insets()).split(',').map(Number); window.onInsets(t, b); } catch (e) { }

  // ===================== Toast, dialogs, menus =====================
  let toastTimer = null;
  function toast(html, ms = 2200) {
    const t = $('#toast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  let dialogEl = null;
  function dialog({ title, html = '', ok = 'OK', cancel = 'Cancel', danger = false, onMount }) {
    return new Promise(resolve => {
      closeDialog(false);
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="dlg-backdrop"></div><div class="dialog" role="dialog">
        ${title ? `<h3>${esc(title)}</h3>` : ''}<div class="dlg-body">${html}</div>
        <div class="btnrow">${cancel ? `<button class="btn ghost" data-dlg="0">${esc(cancel)}</button>` : ''}
        <button class="btn ${danger ? 'danger' : ''}" data-dlg="1">${esc(ok)}</button></div></div>`;
      document.body.appendChild(wrap);
      dialogEl = { el: wrap, resolve };
      wrap.querySelector('.dlg-backdrop').addEventListener('click', () => closeDialog(false));
      wrap.querySelectorAll('[data-dlg]').forEach(b => b.addEventListener('click', () => {
        const yes = b.dataset.dlg === '1';
        if (yes && dialogEl && dialogEl.validate && !dialogEl.validate(wrap)) return;
        closeDialog(yes ? (dialogEl.collect ? dialogEl.collect(wrap) : true) : false);
      }));
      if (onMount) onMount(wrap, dialogEl);
    });
  }
  function closeDialog(result) {
    if (!dialogEl) return false;
    const d = dialogEl; dialogEl = null;
    d.el.remove();
    d.resolve(result);
    return true;
  }

  let menuEl = null;
  function openMenu(items) {
    closeMenu();
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="menu-catch"></div><div class="menu">${items.map((it, i) => `<button data-mi="${i}">${esc(it[0])}</button>`).join('')}</div>`;
    document.body.appendChild(wrap);
    menuEl = wrap;
    wrap.querySelector('.menu-catch').addEventListener('click', closeMenu);
    wrap.querySelectorAll('[data-mi]').forEach(b => b.addEventListener('click', () => { closeMenu(); items[Number(b.dataset.mi)][1](); }));
  }
  function closeMenu() { if (!menuEl) return false; menuEl.remove(); menuEl = null; return true; }

  // ===================== Sheets =====================
  const sheets = [];
  function openSheet({ title, body, foot = '', full = false, ctx = {}, onMount, onClose, cls = '' }) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="backdrop"></div><div class="sheet ${full ? 'full' : ''} ${cls}">
      <div class="shead"><button class="iconbtn" data-act="closeSheet" aria-label="Close">${I.close}</button><h2>${esc(title)}</h2><span class="shead-x"></span></div>
      <div class="sbody">${body}</div>${foot ? `<div class="sfoot">${foot}</div>` : ''}</div>`;
    $('#sheets').appendChild(wrap);
    const s = { el: wrap, ctx, onClose };
    sheets.push(s);
    if (!full) wrap.querySelector('.backdrop').addEventListener('click', () => closeSheet());
    if (onMount) onMount(wrap, ctx, s);
    return s;
  }
  function closeSheet() {
    const s = sheets.pop();
    if (!s) return false;
    s.el.remove();
    if (s.onClose) s.onClose();
    return true;
  }
  const topSheet = () => sheets[sheets.length - 1];
  function closeAllLayers() {
    closeDialog(false); closeMenu(); closeScanner();
    while (sheets.length) { const s = sheets.pop(); s.el.remove(); }
  }

  // ===================== Navigation =====================
  let view = { name: 'home' };
  const hist = [];
  function go(name, params = {}) {
    if (view) { view.scroll = window.scrollY; hist.push(view); }
    view = Object.assign({ name }, params);
    render();
    window.scrollTo(0, 0);
  }
  function back() {
    if (closeDialog(false) || closeMenu() || closeScanner() || closeSheet()) return true;
    if (hist.length) { view = hist.pop(); render(); window.scrollTo(0, view.scroll || 0); return true; }
    return false;
  }
  window.handleBack = () => { if (!unlocked) return false; return back(); };

  function render() {
    if (!unlocked || !S) return;
    const r = { home: renderHome, patient: renderPatient, search: renderSearch, settings: renderSettings, glossary: renderGlossary, converter: renderConverter, present: renderPresent, calcs: renderCalcs, advice: renderAdviceLib, round: renderRound, logbook: renderLogbook }[view.name];
    (r || renderHome)();
  }
  function refreshPatient() { const y = window.scrollY; render(); window.scrollTo(0, y); }

  // ===================== Event delegation =====================
  const ACT = {}, CHG = {}, INP = {};
  let suppressClickUntil = 0, suppressIn = null;
  document.addEventListener('click', e => {
    // After a long-press, swallow the click that follows the release (only on the pressed item, if one was given).
    if (Date.now() < suppressClickUntil && (!suppressIn || suppressIn.contains(e.target))) { e.preventDefault(); e.stopPropagation(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  }, true);
  document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e); });
  document.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el && INP[el.dataset.inp]) INP[el.dataset.inp](el, e); });

  // Long-press: an item marked data-lp opens its editor; otherwise an abbreviation shows its meaning.
  let lpTimer = null, lpStart = null, lpFired = 0;
  const fireLP = el => { const fn = ACT[el.dataset.lp]; if (!fn) return false; lpFired = Date.now(); suppressClickUntil = Date.now() + 700; suppressIn = el; if (navigator.vibrate) navigator.vibrate(15); fn(el); return true; };
  document.addEventListener('touchstart', e => {
    const lp = e.target.closest('[data-lp]');
    const el = lp ? null : e.target.closest('[data-abbr]');
    if (!lp && !el) return;
    const t = e.touches[0];
    lpStart = { x: t.clientX, y: t.clientY };
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
      lpTimer = null;
      if (lp) { fireLP(lp); return; }
      const txt = explain(el.dataset.abbr);
      if (txt) { toast(txt, 4000); lpFired = Date.now(); suppressClickUntil = Date.now() + 700; suppressIn = null; }
    }, 500);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!lpTimer || !lpStart) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - lpStart.x) > 10 || Math.abs(t.clientY - lpStart.y) > 10) { clearTimeout(lpTimer); lpTimer = null; }
  }, { passive: true });
  document.addEventListener('touchend', () => { clearTimeout(lpTimer); lpTimer = null; }, { passive: true });
  document.addEventListener('contextmenu', e => {
    if (e.target.closest('input, textarea')) return;
    e.preventDefault();
    if (Date.now() - lpFired < 900) return;
    const lp = e.target.closest('[data-lp]');
    if (lp) { fireLP(lp); return; }
    const el = e.target.closest('[data-abbr]');
    if (el) { const txt = explain(el.dataset.abbr); if (txt) toast(txt, 4000); }
  });

  // Generic segmented control
  const segHTML = (name, opts, val, cls = '') => `<div class="seg ${cls}" data-seg="${name}" data-value="${esc(val || '')}">${opts.map(o => {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    return `<button type="button" class="${v === val ? 'on' : ''}" data-act="seg" data-v="${esc(v)}">${label}</button>`;
  }).join('')}</div>`;
  const SEG_HOOK = {};
  ACT.seg = el => {
    const seg = el.closest('[data-seg]');
    $$('button', seg).forEach(b => b.classList.toggle('on', b === el));
    seg.dataset.value = el.dataset.v;
    const h = SEG_HOOK[seg.dataset.seg]; if (h) h(el.dataset.v, seg);
    if (seg.closest('.calc-form')) recalc();
  };
  const segVal = (root, name) => { const s = $(`[data-seg="${name}"]`, root); return s ? s.dataset.value : ''; };

  ACT.closeSheet = () => closeSheet();

  // ===================== Helpers for patients =====================
  const specShort = k => (SPECIALTIES.find(s => s.key === k) || { short: k || '' }).short;
  const pName = p => p.anonymized ? 'Teaching case' : `${p.firstName || ''}${p.initials ? ' ' + p.initials : ''}`;
  const ageSex = p => `${p.age != null && p.age !== '' ? p.age : ''}${p.sex || ''}`;
  function dayOf(p) {
    if (!p.admitDate) return null;
    const end = p.status === 'discharged' && p.dischargeDate ? p.dischargeDate : today();
    return Math.max(1, daysBetween(p.admitDate, end) + 1);
  }
  const pendingCount = p => p.plan.filter(x => !x.done).length;
  function retentionLeft(p) {
    if (p.status !== 'discharged' || !p.dischargeDate || p.anonymized) return null;
    return Math.max(0, S.settings.retention - daysBetween(p.dischargeDate, today()));
  }
  const allWards = () => [...new Set(S.patients.map(p => (p.ward || '').trim()).filter(Boolean))].sort(natCmp);
  // Attending physicians typed before, most recently updated patient first.
  const allAttendings = () => [...new Set([...S.patients].sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(p => (p.attending || '').trim()).filter(Boolean))];

  // ===================== Labs =====================
  const LABMAP = Object.fromEntries(LABS.map(l => [l.k, l]));
  const CALC_GROUP = { eGFR: 'RFT', AG: 'Lytes', cCa: 'Lytes', 'P/F': 'ABG' };
  const CALC_UNIT = { eGFR: 'mL/min/1.73m²', AG: 'mmol/L', cCa: 'mg/dL', 'P/F': '' };
  function refRange(l, sex) {
    const lo = sex === 'F' ? (l.loF != null ? l.loF : l.lo) : (l.loM != null ? l.loM : l.lo);
    const hi = sex === 'F' ? (l.hiF != null ? l.hiF : l.hi) : (l.hiM != null ? l.hiM : l.hi);
    return { lo, hi };
  }
  function classify(k, v, sex) {
    if (v == null || v === '') return '';
    if (k === 'eGFR') return v < 15 ? 'crit' : v < 60 ? 'lo' : '';
    if (k === 'P/F') return v < 100 ? 'crit' : v < 300 ? 'lo' : '';
    if (k === 'cCa') return classify('Ca', v, sex);
    const l = LABMAP[k];
    if (!l) return '';
    if (l.sel) return v !== 'Neg' ? 'hi' : '';
    if (typeof v !== 'number') return '';
    const c = l.crit;
    if (c) {
      if (c.lo != null && (l.critIncl ? v <= c.lo : v < c.lo)) return 'crit';
      if (c.hi != null && (l.critIncl ? v >= c.hi : v > c.hi)) return 'crit';
    }
    const { lo, hi } = refRange(l, sex);
    if (hi != null && v > hi) return 'hi';
    if (lo != null && v < lo) return 'lo';
    return '';
  }
  const labsSorted = p => [...p.labs].sort((a, b) => a.date === b.date ? (b.created || 0) - (a.created || 0) : (a.date < b.date ? 1 : -1));
  function egfr(cr, age, sex) {
    const F = sex === 'F', k = F ? 0.7 : 0.9, a = F ? -0.241 : -0.302, r = cr / k;
    let e = 142 * Math.pow(Math.min(r, 1), a) * Math.pow(Math.max(r, 1), -1.2) * Math.pow(0.9938, age);
    if (F) e *= 1.012;
    return Math.round(e);
  }
  function onDialysis(p) {
    const all = [...p.comorb, p.mainDx || '', ...p.problems.filter(x => x.active).map(x => x.text)];
    return all.some(x => /ESKD on HD|ESKD on PD|ESKD-HD|ESKD-PD|AKI – on dialysis|AKI-RRT/.test(x));
  }
  function computed(p, e) {
    const v = e.values, out = {};
    const age = Number(p.age);
    if (typeof v.Cr === 'number' && age >= 18 && (p.sex === 'M' || p.sex === 'F') && !onDialysis(p)) out.eGFR = egfr(v.Cr, age, p.sex);
    if ([v.Na, v.Cl, v.HCO3].every(x => typeof x === 'number')) out.AG = round(v.Na - v.Cl - v.HCO3, 0);
    if (typeof v.Ca === 'number' && typeof v.Alb === 'number') out.cCa = round(v.Ca + 0.8 * (4 - v.Alb), 1);
    if (typeof v.pO2 === 'number' && typeof v.FiO2 === 'number' && v.FiO2 > 0) out['P/F'] = Math.round(v.pO2 / (v.FiO2 > 1 ? v.FiO2 / 100 : v.FiO2));
    return out;
  }
  // ----- Drug allergies -----
  const ALGMAP = Object.fromEntries(ALLERGENS.map(a => [a.k, a]));
  const algTokens = agent => { const a = ALGMAP[agent]; return [agent.toLowerCase(), ...((a && a.match) || [])]; };
  // Which recorded allergies does this medicine touch? level 'match' = same group, 'related' = cross-reacting group.
  function allergyHits(p, medName) {
    if (!p || p.allergyStatus !== 'yes' || !medName) return [];
    const m = medName.toLowerCase(), hits = [];
    p.allergies.forEach(al => {
      if (algTokens(al.agent).some(t => t && m.includes(t))) { hits.push({ al, level: 'match' }); return; }
      const rel = (ALGMAP[al.agent] || {}).related || [];
      const r = rel.find(k => algTokens(k).slice(1).some(t => m.includes(t)));
      if (r) hits.push({ al, level: 'related', group: r });
    });
    return hits;
  }
  const algText = al => `${al.agent}${al.reaction ? ' (' + al.reaction.toLowerCase() + ')' : ''}`;
  const allergyConflicts = p => p.meds.filter(m => !m.stop && allergyHits(p, m.name).some(h => h.level === 'match'));

  function patientFlags(p) {
    const L = labsSorted(p);
    const cflags = (p.cultures || []).filter(c => c.status === 'pos' && daysBetween(c.date, today()) <= 7).map(c => `${c.specimen} culture +`);
    if (!L.length) return [...(allergyConflicts(p).length ? ['Allergy conflict'] : []), ...cflags];
    const last = L[0], flags = [];
    for (const l of LABS) {
      const v = last.values[l.k];
      if (v != null && classify(l.k, v, p.sex) === 'crit') flags.push(`${l.k} ${fmtNum(v)}`);
    }
    const cr = last.values.Cr;
    if (typeof cr === 'number') {
      const prior = L.slice(1).filter(e => typeof e.values.Cr === 'number' && daysBetween(e.date, last.date) <= 7);
      const rise03 = prior.filter(e => daysBetween(e.date, last.date) <= 2).some(e => cr - e.values.Cr >= 0.3 - 1e-9);
      const minPrior = prior.length ? Math.min(...prior.map(e => e.values.Cr)) : null;
      if (rise03 || (minPrior != null && cr >= 1.5 * minPrior)) flags.push('Cr↑');
    }
    if (allergyConflicts(p).length) flags.unshift('Allergy conflict');
    return [...flags, ...cflags];
  }
  // Values that are almost certainly typed in the wrong unit or mistyped.
  const PLAUSIBLE = { Cr: [0.1, 25], Urea: [2, 400], Glu: [10, 2000], Ca: [3, 20], PO4: [0.3, 25], Mg: [0.2, 10], Alb: [0.5, 7], Hb: [2, 25], K: [1, 12], Na: [90, 200], HCO3: [2, 60], Cl: [50, 160], pH: [6.5, 8], 'U-pH': [4, 9], Uric: [0.3, 30], 'T.Bil': [0.05, 60], WBC: [0, 500], Plt: [0, 3000], INR: [0.5, 20] };

  // ===================== Retention (auto-delete) =====================
  function runRetention() {
    if (!S) return;
    const days = S.settings.retention;
    let removed = 0, anon = 0;
    S.patients = S.patients.filter(p => {
      if (p.status !== 'discharged' || !p.dischargeDate || p.anonymized) return true;
      if (daysBetween(p.dischargeDate, today()) < days) return true;
      if (p.teaching) { anonymize(p); anon++; return true; }
      removed++;
      return false;
    });
    if (removed || anon) {
      save(true);
      const msg = [removed ? `${removed} discharged record${removed > 1 ? 's' : ''} deleted` : '', anon ? `${anon} teaching case${anon > 1 ? 's' : ''} anonymized` : ''].filter(Boolean).join(' · ');
      setTimeout(() => toast(msg, 3000), 400);
    }
  }
  function anonymize(p) {
    p.firstName = ''; p.initials = ''; p.hospNo = ''; p.bed = ''; p.ward = ''; p.memo = '';
    p.anonymized = true; touch(p);
  }

  // ===================== Lock screen =====================
  let pinBuf = '', pinMode = 'unlock', pinFirst = '';
  function failCount() { return Number(localStorage.getItem('rn_fail') || 0); }
  function lockedUntil() { return Number(localStorage.getItem('rn_until') || 0); }

  function renderLock(mode, msg = '', err = false) {
    unlocked = false;
    pinMode = mode; pinBuf = '';
    const setup = mode !== 'unlock';
    const bio = mode === 'unlock' && bioEnabled();
    const title = mode === 'unlock' ? 'RoundNotes' : mode === 'setup1' ? 'Create a PIN' : 'Confirm your PIN';
    const defMsg = mode === 'unlock' ? 'Enter your PIN' : mode === 'setup1' ? '4 to 6 digits. You will need it every time you open the app.' : 'Enter the same PIN again';
    $('#app').innerHTML = `<div class="lock">
      <div class="logo">${I.logo}</div>
      <h1>${title}</h1>
      ${mode === 'setup1' ? `<div class="notice"><b>Privacy:</b> record only the patient's <b>first name, initials and hospital number</b>. No family names, national ID or phone numbers. Data stays on this phone, encrypted.</div>` : ''}
      <div class="msg ${err ? 'err' : ''}" id="pin-msg">${esc(msg || defMsg)}</div>
      <div class="dots" id="pin-dots"></div>
      <div class="pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-act="pin" data-d="${n}">${n}</button>`).join('')}
        ${setup ? `<button class="fn" data-act="pinOk" id="pin-ok">OK</button>` : bio ? `<button class="fn" data-act="bio" aria-label="Fingerprint">${I.finger}</button>` : '<span></span>'}
        <button data-act="pin" data-d="0">0</button>
        <button class="fn" data-act="pinDel" aria-label="Delete">${I.bksp}</button>
      </div>
      ${mode === 'unlock' ? '<button class="link" data-act="forgotPin">Forgot PIN?</button>' : ''}
    </div>`;
    drawDots();
  }
  function drawDots() {
    const want = pinMode === 'unlock' ? Number(localStorage.getItem('rn_pinlen') || 4) : Math.max(4, pinBuf.length);
    $('#pin-dots').innerHTML = Array.from({ length: want }, (_, i) => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('');
    const ok = $('#pin-ok'); if (ok) ok.style.opacity = pinBuf.length >= 4 ? 1 : .35;
  }
  ACT.pin = el => {
    if (pinMode === 'unlock' && Date.now() < lockedUntil()) {
      const s = Math.ceil((lockedUntil() - Date.now()) / 1000);
      $('#pin-msg').textContent = `Too many attempts. Try again in ${s} s`; return;
    }
    if (pinBuf.length >= 6) return;
    pinBuf += el.dataset.d;
    drawDots();
    if (pinMode === 'unlock' && pinBuf.length === Number(localStorage.getItem('rn_pinlen') || 4)) setTimeout(tryUnlock, 80);
  };
  ACT.pinDel = () => { pinBuf = pinBuf.slice(0, -1); drawDots(); };
  ACT.pinOk = () => {
    if (pinBuf.length < 4) return;
    if (pinMode === 'setup1') { pinFirst = pinBuf; renderLock('setup2'); }
    else if (pinMode === 'setup2') {
      if (pinBuf !== pinFirst) { renderLock('setup1', 'The PINs did not match. Start again.', true); return; }
      const pin = pinBuf;
      pinBusy = true;
      Promise.resolve(B.setPin(pin)).then(ok => {
        pinBusy = false;
        if (!ok) { renderLock('setup1', 'Could not save the PIN. Try again.', true); return; }
        localStorage.setItem('rn_pinlen', String(pin.length));
        localStorage.setItem('rn_fail', '0');
        unlock();
      });
    }
  };
  let pinBusy = false;   // the web edition checks the PIN asynchronously
  function tryUnlock() {
    if (pinBusy) return;
    pinBusy = true;
    Promise.resolve(B.checkPin(pinBuf)).then(ok => { pinBusy = false; afterPin(ok); });
  }
  function afterPin(ok) {
    if (ok) { localStorage.setItem('rn_fail', '0'); unlock(); return; }
    const f = failCount() + 1;
    localStorage.setItem('rn_fail', String(f));
    if (f >= 5) localStorage.setItem('rn_until', String(Date.now() + (f >= 10 ? 300000 : 30000)));
    renderLock('unlock', f >= 5 ? `Wrong PIN. Wait ${f >= 10 ? '5 minutes' : '30 seconds'}.` : 'Wrong PIN. Try again.', true);
  }
  ACT.bio = () => B.bioAuth();
  window.onBiometric = status => { if (status === 'ok' && !unlocked) unlock(); };
  ACT.forgotPin = async () => {
    const r = await dialog({
      title: 'Reset RoundNotes?', danger: true, ok: 'Erase everything',
      html: `<p>A forgotten PIN cannot be recovered. Resetting <b>erases all patients on this phone</b>. You can restore from a backup file afterwards.</p><input class="inp" id="erase-c" placeholder='Type ERASE to confirm' autocomplete="off">`,
      onMount: (w, d) => { d.validate = w2 => ($('#erase-c', w2).value.trim().toUpperCase() === 'ERASE') || ($('#erase-c', w2).classList.add('err'), false); }
    });
    if (!r) return;
    B.wipe();
    localStorage.removeItem('rn_fail'); localStorage.removeItem('rn_until');
    renderLock('setup1', 'All data erased. Create a new PIN.');
  };

  function unlock() {
    const st = loadState();
    unlocked = true;
    hist.length = 0;
    view = { name: 'home' };
    if (st === 'ERR') { S = null; renderLoadError(); return; }
    runRetention();
    render();
    syncReminders(true);
    setTimeout(openLaunchReminder, 300);
  }
  function renderLoadError() {
    $('#app').innerHTML = `<div class="topbar"><h1>RoundNotes</h1></div><div class="content">
      <div class="card"><h3 style="margin-top:0">Saved data could not be opened</h3>
      <p class="muted">This can happen after the phone's security settings were reset. Restore from your latest backup file, or start with an empty list.</p>
      <div class="btnrow"><button class="btn" data-act="restoreBackup">Restore backup</button><button class="btn sec" data-act="startFresh">Start fresh</button></div></div></div>`;
  }
  ACT.startFresh = async () => {
    const ok = await dialog({ title: 'Start with an empty list?', html: '<p>The unreadable data will be replaced.</p>', ok: 'Start fresh', danger: true });
    if (!ok) return;
    S = newState(); save(true); render();
  };
  function lockNow() {
    if (!unlocked) return;
    save(true);
    S = null;
    closeAllLayers();
    hist.length = 0;
    renderLock('unlock');
    if (bioEnabled()) setTimeout(() => B.bioAuth(), 250);
  }
  window.onAppPause = () => { lastPause = Date.now(); if (unlocked) save(true); };
  window.onAppResume = () => {
    if (!unlocked) return;
    if (Date.now() < ui.noLockUntil) return;
    if (Date.now() - lastPause >= lockMin() * 60000) lockNow();
    else runRetention();
  };

  // ===================== Home =====================
  function topbar(title, sub, left, right) {
    return `<div class="topbar">${left || ''}<h1>${esc(title)}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</h1>${right || ''}</div>`;
  }
  const backBtn = `<button class="iconbtn" data-act="back" aria-label="Back">${I.back}</button>`;
  ACT.back = () => back();

  function renderHome() {
    const all = S.patients;
    const active = all.filter(p => p.status === 'active');
    const counts = { round: active.length, discharged: all.filter(p => p.status === 'discharged').length, teaching: all.filter(p => p.teaching).length };
    const tab = ui.homeTab;
    let list = tab === 'round' ? active : tab === 'discharged' ? all.filter(p => p.status === 'discharged') : all.filter(p => p.teaching);
    if (ui.spec !== 'All') list = list.filter(p => p.specialty === ui.spec);
    const wards = [...new Set(active.map(p => (p.ward || '').trim()).filter(Boolean))].sort(natCmp);
    if (ui.ward !== 'All' && !wards.includes(ui.ward)) ui.ward = 'All';
    if (tab === 'round' && ui.ward !== 'All') list = list.filter(p => (p.ward || '').trim() === ui.ward);
    const atts = [...new Set(active.map(p => (p.attending || '').trim()).filter(Boolean))].sort(alpha);
    if (!ui.att || (ui.att !== 'All' && !atts.includes(ui.att))) ui.att = 'All';
    if (tab === 'round' && ui.att !== 'All') list = list.filter(p => (p.attending || '').trim() === ui.att);

    let body = '';
    if (tab === 'round') {
      list.sort((a, b) => natCmp(a.ward, b.ward) || natCmp(a.bed, b.bed) || natCmp(a.firstName, b.firstName));
      let lastWard = null;
      list.forEach(p => {
        const w = (p.ward || '').trim() || 'No ward';
        if (w !== lastWard && wards.length) { body += `<div class="ward-head">${esc(w)}</div>`; lastWard = w; }
        body += cardHTML(p);
      });
    } else if (tab === 'discharged') {
      list.sort((a, b) => (b.dischargeDate || '').localeCompare(a.dischargeDate || ''));
      if (list.length) body += `<div class="hint mb">Discharged records are deleted ${S.settings.retention} days after discharge (teaching cases are kept without name or hospital number). Change this in Settings.</div>`;
      list.forEach(p => { body += cardHTML(p); });
    } else {
      list.sort((a, b) => (b.updated || 0) - (a.updated || 0));
      list.forEach(p => { body += cardHTML(p); });
    }
    if (!list.length) {
      body += tab === 'round'
        ? `<div class="empty"><div class="big">🩺</div><div class="bold">No patients on today's round</div><div class="small mt">Tap <b>Add patient</b> to start.</div></div>`
        : tab === 'discharged' ? `<div class="empty">No discharged patients.</div>` : `<div class="empty">No teaching cases yet.<div class="small mt">Mark a patient as a teaching case in the Dx tab.</div></div>`;
    }

    $('#app').innerHTML = topbar('RoundNotes', `${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`, '',
      `<button class="iconbtn" data-act="goSearch" aria-label="Search">${I.search}</button><button class="iconbtn" data-act="homeMenu" aria-label="Menu">${I.more}</button>`) +
      `<div class="content">
        ${segHTML('hometab', [['round', `Round<span class="count">${counts.round}</span>`], ['discharged', `Discharged<span class="count">${counts.discharged}</span>`], ['teaching', `Teaching<span class="count">${counts.teaching}</span>`]], tab)}
        <div class="filters">
          ${[['All', 'All'], ...SPECIALTIES.map(s => [s.key, s.short])].map(([k, l]) => `<button class="chip ${ui.spec === k ? 'on' : ''}" data-act="specFilter" data-k="${esc(k)}">${l}</button>`).join('')}
          ${tab === 'round' && wards.length > 1 ? `<select data-chg="wardFilter"><option value="All">All wards</option>${wards.map(w => `<option ${ui.ward === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>` : ''}
          ${tab === 'round' && atts.length > 1 ? `<select data-chg="attFilter"><option value="All">All attendings</option>${atts.map(a => `<option ${ui.att === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>` : ''}
        </div>
        <div class="mt">${body}</div>
      </div>
      ${tab === 'round' ? `<button class="fab" data-act="addPatient">${I.plus}Add patient</button>` : ''}`;
  }
  SEG_HOOK.hometab = v => { ui.homeTab = v; renderHome(); };
  ACT.specFilter = el => { ui.spec = el.dataset.k; renderHome(); };
  CHG.wardFilter = el => { ui.ward = el.value; renderHome(); };
  CHG.attFilter = el => { ui.att = el.value; renderHome(); };
  ACT.goSearch = () => go('search');
  ACT.homeMenu = () => openMenu([
    ['Round sheet (whole list)', () => go('round')],
    ['Logbook', () => go('logbook')],
    ['Calculators', () => go('calcs')],
    ['Patient education (EN / عربي)', () => go('advice')],
    ['Unit converter', () => go('converter')],
    ['Abbreviations', () => go('glossary')],
    ['Back up now', () => backupNow()],
    ['Settings', () => go('settings')],
    ['Lock now', () => lockNow()]
  ]);
  ACT.openP = el => go('patient', { id: el.dataset.id });

  function cardHTML(p) {
    const flags = p.status === 'active' ? patientFlags(p) : [];
    const pend = pendingCount(p);
    const d = dayOf(p);
    const dx = p.mainDx || '';
    let badges = '';
    if (p.allergyStatus === 'yes' && p.allergies.length) badges += `<span class="badge alg">Allergy: ${esc(p.allergies[0].agent)}${p.allergies.length > 1 ? ' +' + (p.allergies.length - 1) : ''}</span>`;
    if (flags.length) badges += `<span class="badge flag">⚠ ${esc(flags.slice(0, 2).join(' · '))}${flags.length > 2 ? ' +' + (flags.length - 2) : ''}</span>`;
    if (p.status === 'active' && pend) badges += `<span class="badge task">${pend} to do</span>`;
    if (p.status === 'active') {
      const rems = p.plan.filter(x => !x.done && x.rem), due = rems.filter(x => x.rem <= Date.now()).length;
      const next = rems.filter(x => x.rem > Date.now()).sort((a, b) => a.rem - b.rem)[0];
      if (due) badges += `<span class="badge remdue">⏰ ${due} due</span>`;
      else if (next) badges += `<span class="badge rem">⏰ ${esc(fmtRem(next.rem, true))}</span>`;
    }
    if (p.teaching) badges += `<span class="badge teach">Teaching</span>`;
    const left = retentionLeft(p);
    if (left != null) badges += `<span class="badge task">${p.teaching ? 'Anonymized' : 'Deleted'} in ${left} d</span>`;
    const meta = [p.hospNo ? `Hosp# ${esc(p.hospNo)}` : '', specShort(p.specialty), d && p.status === 'active' ? 'D' + d : '', p.status === 'discharged' && p.dischargeDate ? 'Disch ' + fmtDM(p.dischargeDate) : '', p.attending && (!ui.att || ui.att === 'All') ? esc(p.attending) : ''].filter(Boolean).join(' · ');
    return `<div class="card tap pcard" data-act="openP" data-id="${p.id}">
      <div class="bed">${esc(p.bed || '–')}<small>BED</small></div>
      <div class="grow"><div class="pname">${esc(pName(p))} <span class="muted small">${esc(ageSex(p))}</span></div>
        ${dx ? `<div class="pdx" data-abbr="${esc(dx)}">${esc(dx)}</div>` : '<div class="pdx muted">No diagnosis yet</div>'}
        ${p.memo && p.status === 'active' ? `<div class="pmemo">📌 ${esc(p.memo)}</div>` : ''}
        <div class="pmeta">${meta}</div>
        ${badges ? `<div class="badges-row">${badges}</div>` : ''}</div></div>`;
  }

  // ===================== Patient form =====================
  ACT.addPatient = () => patientForm(null);
  function patientForm(p) {
    const isNew = !p;
    const d = p || { specialty: ui.spec !== 'All' && SPECIALTIES.some(s => s.key === ui.spec) ? ui.spec : S.settings.defSpec, admitDate: today(), sex: '', attending: ui.att && ui.att !== 'All' ? ui.att : (S.settings.lastAtt || '') };
    const atts = allAttendings();
    const wards = allWards();
    openSheet({
      full: true, title: isNew ? 'New patient' : 'Edit patient',
      ctx: { id: p ? p.id : null, mainDx: d.mainDx || '', alg: { status: d.allergyStatus || 'unknown', list: (d.allergies || []).map(a => Object.assign({}, a)) } },
      body: `
        <div class="grid2">
          <div class="field"><label>First name *</label><input class="inp" id="f-first" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="e.g. Ahmad" value="${esc(d.firstName || '')}"></div>
          <div class="field"><label>Initials</label><input class="inp" id="f-init" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="e.g. K.A." value="${esc(d.initials || '')}"></div>
        </div>
        <div class="hint" id="f-name-hint" style="margin-top:-6px;margin-bottom:10px">First name and initials only — no family name, national ID or phone number.</div>
        <div class="field"><label>Hospital number *</label>
          <div class="row"><input class="inp grow" id="f-hosp" autocomplete="off" inputmode="numeric" spellcheck="false" placeholder="File / MRN number" value="${esc(d.hospNo || '')}">
          <button class="btn sec sm" data-act="kbToggle" title="Letters keyboard">ABC</button>
          <button class="btn sec sm" data-act="scanHosp" aria-label="Scan barcode">${I.scan.replace('<svg', '<svg width="22" height="22" style="stroke:currentColor;fill:none;stroke-width:2"')}</button></div></div>
        ${algEditorHTML(d.allergyStatus || 'unknown')}
        <div class="grid3">
          <div class="field"><label>Age</label><input class="inp" id="f-age" inputmode="numeric" maxlength="3" value="${esc(d.age != null ? d.age : '')}"></div>
          <div class="field" style="grid-column: span 2"><label>Sex</label>${segHTML('sex', [['M', 'Male'], ['F', 'Female']], d.sex)}</div>
        </div>
        <div class="field"><label>Specialty</label>${segHTML('spec', SPECIALTIES.map(s => [s.key, s.short]), d.specialty, 'wrap specs')}</div>
        <div class="grid2">
          <div class="field"><label>Ward</label><input class="inp" id="f-ward" list="dl-wards" autocomplete="off" value="${esc(d.ward || '')}"><datalist id="dl-wards">${wards.map(w => `<option value="${esc(w)}">`).join('')}</datalist></div>
          <div class="field"><label>Bed</label><input class="inp" id="f-bed" autocomplete="off" value="${esc(d.bed || '')}"></div>
        </div>
        <div class="field"><label>Attending physician</label><input class="inp" id="f-att" list="dl-att" autocomplete="off" maxlength="40" placeholder="e.g. Dr Saleh" value="${esc(d.attending || '')}"><datalist id="dl-att">${atts.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
          ${atts.length ? `<div class="chips mt-s">${atts.slice(0, 6).map(a => `<button class="chip static" data-act="attPick" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}</div>
        <div class="grid2">
          <div class="field"><label>Admission date</label><input class="inp" type="date" id="f-adm" max="${today()}" value="${esc(d.admitDate || '')}"></div>
          <div class="field"><label>Weight (kg)</label><input class="inp" id="f-wt" inputmode="decimal" data-inp="bmiLive" value="${esc(d.weight != null ? d.weight : '')}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Height (cm)</label><input class="inp" id="f-ht" inputmode="decimal" data-inp="bmiLive" value="${esc(d.height != null ? d.height : '')}"></div>
          <div class="field"><label>BMI</label><div class="inp ro" id="f-bmi">${bmiOf(d) != null ? bmiOf(d) + ' kg/m²' : '—'}</div></div>
        </div>
        <div class="field bcr-wrap" id="f-bcr-wrap" ${BCR_SPECS.includes(d.specialty) || num(d.baseCr) ? '' : 'hidden'}><label>Baseline creatinine <span class="muted tiny">· before this illness, for AKI staging</span></label>
          <div class="grid2" style="margin:0"><input class="inp" id="f-bcr" inputmode="decimal" placeholder="e.g. 1.1" value="${esc(num(d.baseCr) != null ? d.baseCr : '')}">${segHTML('bcru', [['mg', 'mg/dL'], ['si', 'µmol/L']], 'mg')}</div>
          <div class="mt-s">${segHTML('bcrsrc', [['known', 'Previous result'], ['est', 'Estimated'], ['nadir', 'Lowest this stay']], d.baseCrSrc || 'known', 'wrap')}</div>
        </div>
        <div class="field"><label>Main diagnosis <span class="muted tiny" id="f-dx-spec">· ${esc(d.specialty || '')} list</span></label><button class="pickbtn" data-act="formPickDx" id="f-dx">${d.mainDx ? esc(d.mainDx) : '<span class="ph">Choose from list…</span>'}</button></div>`,
      foot: `<button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="savePatient">Save</button>`,
      onMount: (w, ctx) => { renderAlgList(w, ctx); if (isNew) setTimeout(() => $('#f-first', w).focus(), 150); }
    });
  }
  function bmiOf(p) {
    const w = num(p.weight), h = num(p.height);
    return w && h && h > 50 && h < 250 ? Math.round(w / Math.pow(h / 100, 2) * 10) / 10 : null;
  }
  INP.bmiLive = () => { const w = topSheet().el, b = bmiOf({ weight: $('#f-wt', w).value, height: $('#f-ht', w).value }); $('#f-bmi', w).textContent = b != null ? b + ' kg/m²' : '—'; };
  function algEditorHTML(status) {
    return `<div class="field"><label>Drug allergies</label>${segHTML('alg', [['unknown', 'Not asked'], ['nkda', 'NKDA'], ['yes', 'Allergic']], status)}
      <div id="alg-box" class="alg-box"></div></div>`;
  }
  function renderAlgList(w, ctx) {
    const box = $('#alg-box', w), a = ctx.alg;
    if (a.status !== 'yes') { box.innerHTML = a.status === 'nkda' ? '<div class="hint">No known drug allergies.</div>' : '<div class="hint">Ask about drug allergies when you can.</div>'; return; }
    box.innerHTML = a.list.map((x, i) => `<div class="alg-row"><b class="grow">${esc(x.agent)}</b>
        <select class="inp" data-chg="algReact" data-i="${i}" style="width:auto;min-height:38px;padding:6px 8px;font-size:14px"><option value="">Reaction…</option>${REACTIONS.map(r => `<option ${x.reaction === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <button class="x" data-act="algDel" data-i="${i}" aria-label="Remove">×</button></div>`).join('') +
      `<button class="btn ghost sm" data-act="algAdd">+ Add allergy</button>`;
  }
  SEG_HOOK.alg = v => {
    const s = topSheet(); s.ctx.alg.status = v; renderAlgList(s.el, s.ctx);
    if (v === 'yes' && !s.ctx.alg.list.length) ACT.algAdd();
  };
  ACT.algAdd = () => {
    const s = topSheet();
    const items = [...S.settings.custom.allergy.map(x => [x, '']), ...ALLERGENS.map(a => [a.k, a.match && a.match.length ? 'e.g. ' + MEDS.filter(m => a.match.some(t => m.toLowerCase().includes(t))).slice(0, 3).join(', ') : ''])];
    openPicker({
      title: 'Drug allergy', groups: [{ name: 'Allergy groups', items }], multi: true, customKey: 'allergy',
      selected: s.ctx.alg.list.map(x => x.agent), placeholder: 'Search, or type a specific drug…',
      onDone: v => {
        const keep = s.ctx.alg.list.filter(x => v.includes(x.agent));
        v.forEach(agent => { if (!keep.some(x => x.agent === agent)) keep.push({ agent, reaction: '' }); });
        s.ctx.alg.list = keep;
        if (!keep.length) { s.ctx.alg.status = 'unknown'; const b = $$('[data-seg="alg"] button', s.el).find(x => x.dataset.v === 'unknown'); if (b) { $$('[data-seg="alg"] button', s.el).forEach(x => x.classList.toggle('on', x === b)); $('[data-seg="alg"]', s.el).dataset.value = 'unknown'; } }
        renderAlgList(s.el, s.ctx);
      }
    });
  };
  ACT.algDel = el => { const s = topSheet(); s.ctx.alg.list.splice(Number(el.dataset.i), 1); renderAlgList(s.el, s.ctx); };
  CHG.algReact = el => { const s = topSheet(); s.ctx.alg.list[Number(el.dataset.i)].reaction = el.value; };
  function algFromCtx(ctx) {
    const a = ctx.alg;
    if (a.status === 'yes' && !a.list.length) return null;
    return { allergyStatus: a.status, allergies: a.status === 'yes' ? a.list.map(x => ({ agent: x.agent, reaction: x.reaction || '' })) : [] };
  }
  ACT.editAlg = () => {
    const p = getP(view.id);
    openSheet({
      title: 'Drug allergies', ctx: { pid: p.id, alg: { status: p.allergyStatus, list: p.allergies.map(a => Object.assign({}, a)) } },
      body: algEditorHTML(p.allergyStatus),
      foot: `<button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="saveAlg">Save</button>`,
      onMount: (w, ctx) => renderAlgList(w, ctx)
    });
  };
  ACT.saveAlg = () => {
    const s = topSheet(), p = getP(s.ctx.pid), a = algFromCtx(s.ctx);
    if (!a) { toast('Add at least one allergy, or choose NKDA'); return; }
    Object.assign(p, a); touch(p); save(); closeSheet(); refreshPatient();
    const c = allergyConflicts(p);
    toast(c.length ? `<b>⚠ Current medicine conflicts:</b> ${esc(c.map(m => m.name).join(', '))}` : 'Allergies saved', c.length ? 4000 : 1800);
  };
  ACT.kbToggle = el => {
    const i = $('#f-hosp');
    i.inputMode = i.inputMode === 'numeric' ? 'text' : 'numeric';
    el.textContent = i.inputMode === 'numeric' ? 'ABC' : '123';
    i.blur(); setTimeout(() => i.focus(), 50);
  };
  ACT.scanHosp = () => openScanner(v => { const i = $('#f-hosp'); if (i) { i.value = v; toast(`Scanned <b>${esc(v)}</b> — check it matches the file`, 3000); } });
  const BCR_SPECS = ['Nephrology', 'ICU'];
  SEG_HOOK.spec = (v, seg) => {
    const w = seg.closest('.sheet'), l = w && $('#f-dx-spec', w); if (l) l.textContent = `· ${v} list`;
    const b = w && $('#f-bcr-wrap', w); if (b && !num($('#f-bcr', w).value)) b.hidden = !BCR_SPECS.includes(v);
  };
  ACT.formPickDx = () => {
    const s = topSheet();
    const spec = segVal(s.el, 'spec') || S.settings.defSpec;
    openPicker({
      title: `Main diagnosis · ${specShort(spec)}`, groups: dxGroups(spec), selected: s.ctx.mainDx ? [s.ctx.mainDx] : [], customKey: 'dx',
      onDone: v => { s.ctx.mainDx = v[0] || ''; $('#f-dx', s.el).innerHTML = s.ctx.mainDx ? esc(s.ctx.mainDx) : '<span class="ph">Choose from list…</span>'; }
    });
  };
  ACT.savePatient = async () => {
    const s = topSheet(), w = s.el;
    const first = $('#f-first', w).value.trim().replace(/\s+/g, ' ');
    const hosp = digits($('#f-hosp', w).value).trim();
    let bad = false;
    $('#f-first', w).classList.toggle('err', !first || /\s/.test(first));
    $('#f-hosp', w).classList.toggle('err', !hosp);
    if (!first) { bad = true; toast('First name is required'); }
    else if (/\s/.test(first)) { bad = true; const h = $('#f-name-hint', w); h.classList.add('err'); h.textContent = 'First name only (one word). Put other letters in Initials.'; }
    else if (!hosp) { bad = true; toast('Hospital number is required'); }
    if (bad) return;
    const ageV = num($('#f-age', w).value);
    const data = {
      firstName: first, initials: $('#f-init', w).value.trim().toUpperCase(), hospNo: hosp,
      age: ageV == null ? '' : Math.round(ageV), sex: segVal(w, 'sex'), specialty: segVal(w, 'spec') || S.settings.defSpec,
      ward: $('#f-ward', w).value.trim(), bed: $('#f-bed', w).value.trim(), attending: $('#f-att', w).value.trim().replace(/\s+/g, ' '), admitDate: $('#f-adm', w).value || today(),
      weight: num($('#f-wt', w).value), height: num($('#f-ht', w).value), mainDx: s.ctx.mainDx
    };
    if (data.weight == null) data.weight = '';
    if (data.height == null) data.height = '';
    // Baseline creatinine is stored in mg/dL; µmol/L is converted (values over 30 typed as mg/dL are taken as µmol/L).
    let bcr = num($('#f-bcr', w).value);
    if (bcr != null && bcr > 0) {
      let si = segVal(w, 'bcru') === 'si';
      if (!si && bcr > 30) { si = true; toast(`Baseline ${bcr} read as µmol/L = ${Math.round(bcr / 88.4 * 100) / 100} mg/dL`, 3500); }
      data.baseCr = si ? Math.round(bcr / 88.4 * 100) / 100 : bcr;
      data.baseCrSrc = segVal(w, 'bcrsrc') || 'known';
    } else { data.baseCr = ''; data.baseCrSrc = ''; }
    const alg = algFromCtx(s.ctx);
    if (!alg) { toast('Add at least one allergy, or choose NKDA'); return; }
    Object.assign(data, alg);
    if (data.attending) S.settings.lastAtt = data.attending;
    const same = S.patients.find(x => x.id !== s.ctx.id && !x.anonymized && (x.hospNo || '').toLowerCase() === hosp.toLowerCase());
    if (same) {
      if (same.status === 'active') {
        const r = await dialog({ title: 'Already on your list', html: `<p><b>${esc(pName(same))}</b> (Hosp# ${esc(same.hospNo)}) is already on today's round.</p>`, ok: 'Open it', cancel: 'Save anyway' });
        if (r) { closeSheet(); go('patient', { id: same.id }); return; }
      } else if (!s.ctx.id) {
        const r = await dialog({ title: 'Previous admission found', html: `<p><b>${esc(pName(same))}</b> (Hosp# ${esc(same.hospNo)}) was discharged on ${fmtD(same.dischargeDate)}. Readmit that record to keep the history?</p>`, ok: 'Readmit', cancel: 'New record' });
        if (r) {
          Object.assign(same, data, { status: 'active', dischargeDate: null, mainDx: data.mainDx || same.mainDx });
          touch(same); save(); closeSheet(); go('patient', { id: same.id }); toast('Readmitted'); return;
        }
      }
    }
    if (s.ctx.id) {
      const p = getP(s.ctx.id); Object.assign(p, data); touch(p); save(); closeSheet(); refreshPatient(); toast('Saved');
    } else {
      const p = Object.assign({ id: uid(), created: Date.now(), updated: Date.now(), status: 'active', problems: [], comorb: [], labs: [], imaging: [], cultures: [], meds: [], plan: [], notes: [], allergies: [], allergyStatus: 'unknown', calcs: [], advice: [], consults: [], teaching: false, learning: '' }, data);
      S.patients.push(p); autoLogPatient(p); save(); closeSheet(); go('patient', { id: p.id }); toast(S.settings.autoLog && p.mainDx ? 'Patient added · logged' : 'Patient added');
    }
  };

  // ===================== Picker =====================
  const alpha = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
  const sortItems = items => [...items].sort((x, y) => alpha(x[0], y[0]));
  function dxGroups(spec) {
    const g = [];
    const custom = S.settings.custom.dx.map(x => [x, '']);
    if (custom.length) g.push({ name: 'My items', items: custom });
    if (DX[spec]) g.push({ name: spec, items: DX[spec] });
    // Other specialties stay hidden until asked for, so the list matches the patient's specialty.
    SPECIALTIES.forEach(s => { if (s.key !== spec) g.push({ name: s.key, items: DX[s.key], extra: true }); });
    return g;
  }
  function openPicker({ title, groups, multi = false, selected = [], customKey = null, onDone, placeholder = 'Search or type a new item…' }) {
    const ctx = { sel: new Set(selected), groups, multi, customKey, onDone, q: '', showAll: false };
    const s = openSheet({
      title, ctx, cls: 'picker',
      body: `<div class="psearch"><div class="searchbox">${I.search}<input class="inp" id="pk-q" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"></div></div><div id="pk-list"></div>`,
      foot: multi ? `<button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="pickDone">Done (<span id="pk-n">${ctx.sel.size}</span>)</button>` : ''
    });
    renderPicker(s);
    const q = $('#pk-q', s.el);
    q.addEventListener('input', () => { ctx.q = q.value; renderPicker(s); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && ctx.q.trim()) { const first = $('#pk-list .popt[data-act="pickOpt"]', s.el) || $('#pk-list .popt', s.el); if (first) first.click(); } });
  }
  function renderPicker(s) {
    const { groups, sel, q, multi, customKey } = s.ctx;
    const ql = fold(q.trim());
    const words = ql.split(/\s+/).filter(Boolean);
    const seen = new Set();
    let html = '', exact = false, hidden = 0;
    const hiddenSet = new Set();
    const match = ([a, f, c]) => !words.length || words.every(w => fold(`${a} ${f || ''} ${c || ''}`).includes(w));
    const row = ([a, f, c]) => {
      seen.add(a);
      if (fold(a) === ql) exact = true;
      return `<div class="popt ${sel.has(a) ? 'on' : ''}" data-act="pickOpt" data-v="${esc(a)}"><div class="grow"><div class="a">${esc(a)}</div>${f && f !== a ? `<div class="f">${esc(f)}</div>` : ''}</div>${c ? `<span class="icd">${esc(c)}</span>` : ''}${multi ? '<span class="tick"></span>' : (sel.has(a) ? '<span class="tick"></span>' : '')}</div>`;
    };
    // While searching, every specialty is searched: the patient's own list first, then one "Other specialties" group.
    const searching = words.length > 0;
    for (const g of groups) {
      if (g.extra && (searching || !s.ctx.showAll)) continue;
      const items = sortItems(g.items).filter(it => !seen.has(it[0]) && match(it));
      if (!items.length) continue;
      html += `<div class="pgroup">${esc(g.name)}</div>` + items.map(row).join('');
    }
    if (searching) {
      const more = new Map();
      groups.filter(g => g.extra).forEach(g => g.items.forEach(it => { if (!seen.has(it[0]) && !more.has(it[0]) && match(it)) more.set(it[0], it); }));
      if (more.size) html += `<div class="pgroup">Other specialties</div>` + sortItems([...more.values()]).map(row).join('');
    } else if (!s.ctx.showAll) {
      groups.filter(g => g.extra).forEach(g => g.items.forEach(it => { if (!seen.has(it[0])) hiddenSet.add(it[0]); }));
      hidden = hiddenSet.size;
    }
    if (hidden) html += `<div class="popt more" data-act="pickShowAll"><div class="grow"><div class="a" style="color:var(--pri)">Show other specialties</div><div class="f">Typing in the search box searches all specialties</div></div></div>`;
    if (ql && !exact && customKey) {
      const add = `<div class="popt" data-act="pickCustom"><div class="grow"><div class="a" style="color:var(--pri)">+ Add “${esc(q.trim())}”</div><div class="f">Saved to your list for next time</div></div></div>`;
      html = html ? html + add : add;
    }
    if (!html) html = '<div class="empty">Nothing found</div>';
    $('#pk-list', s.el).innerHTML = html;
  }
  ACT.pickShowAll = () => { const s = topSheet(); s.ctx.showAll = true; renderPicker(s); };
  ACT.pickOpt = el => {
    const s = topSheet(), v = el.dataset.v;
    if (s.ctx.multi) {
      if (s.ctx.sel.has(v)) s.ctx.sel.delete(v); else s.ctx.sel.add(v);
      el.classList.toggle('on');
      $('#pk-n', s.el).textContent = s.ctx.sel.size;
    } else {
      closeSheet(); s.ctx.onDone([v]);
    }
  };
  ACT.pickCustom = () => {
    const s = topSheet(), v = s.ctx.q.trim();
    if (!v) return;
    const list = S.settings.custom[s.ctx.customKey];
    if (list && !list.includes(v)) { list.push(v); save(); }
    if (s.ctx.multi) {
      s.ctx.sel.add(v);
      s.ctx.groups = s.ctx.groups.some(g => g.name === 'My items') ? s.ctx.groups.map(g => g.name === 'My items' ? { name: g.name, items: list.map(x => [x, '']) } : g) : [{ name: 'My items', items: list.map(x => [x, '']) }, ...s.ctx.groups];
      s.ctx.q = ''; $('#pk-q', s.el).value = '';
      $('#pk-n', s.el).textContent = s.ctx.sel.size;
      renderPicker(s);
    } else { closeSheet(); s.ctx.onDone([v]); }
  };
  ACT.pickDone = () => { const s = topSheet(); closeSheet(); s.ctx.onDone([...s.ctx.sel]); };

  // ===================== Patient view =====================
  const PTABS = [['dx', 'Dx'], ['labs', 'Labs'], ['inv', 'Imaging'], ['meds', 'Meds'], ['plan', 'Plan'], ['daily', 'Daily']];
  function renderPatient() {
    const p = getP(view.id);
    if (!p) { view = hist.pop() || { name: 'home' }; render(); return; }
    const tab = ui.ptab[p.id] || 'dx';
    const d = dayOf(p);
    const n = { labs: p.labs.length + p.cultures.length, inv: p.imaging.length, meds: p.meds.filter(m => !m.stop).length, plan: pendingCount(p), daily: p.notes.length };
    const flags = p.status === 'active' ? patientFlags(p) : [];
    let tabHTML = '';
    if (tab === 'dx') tabHTML = dxTab(p);
    else if (tab === 'labs') tabHTML = labsTab(p);
    else if (tab === 'inv') tabHTML = invTab(p);
    else if (tab === 'meds') tabHTML = medsTab(p);
    else if (tab === 'plan') tabHTML = planTab(p);
    else tabHTML = dailyTab(p);

    $('#app').innerHTML = topbar(pName(p), `${p.specialty}${p.status === 'discharged' ? ' · discharged ' + fmtDM(p.dischargeDate) : ''}`, backBtn,
      `<button class="iconbtn" data-act="pMenu" aria-label="More">${I.more}</button>`) +
      `<div class="phead">
        ${algBanner(p)}
        <div class="row wrap" style="gap:6px 12px">
          <span class="bold">${esc([p.age !== '' && p.age != null ? p.age + ' y' : '', p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : ''].filter(Boolean).join(' · '))}</span>
          ${p.teaching ? '<span class="badge teach">Teaching</span>' : ''}
        </div>
        <div class="pmeta">${[p.ward, p.bed ? 'Bed ' + p.bed : '', d ? `Day ${d}` : '', p.admitDate ? 'Adm ' + fmtD(p.admitDate) : '', p.weight ? p.weight + ' kg' : '', bmiOf(p) != null ? 'BMI ' + bmiOf(p) : '', num(p.baseCr) ? `Baseline Cr ${bcrShow(p)}` : ''].filter(Boolean).map(esc).join(' · ')}</div>
        ${p.attending ? `<div class="pmeta">Attending: <b>${esc(p.attending)}</b></div>` : ''}
        ${p.memo ? `<button class="memo" data-act="editMemo">📌 ${esc(p.memo)}</button>` : (p.status === 'active' && !p.anonymized ? '<button class="memo empty" data-act="editMemo">+ Short note</button>' : '')}
        ${p.hospNo ? `<button class="hosp" data-act="copyHosp" aria-label="Copy hospital number"><small>HOSP#</small>${esc(p.hospNo)}${I.copy}</button>` : ''}
        ${flags.length ? `<div class="mt"><span class="badge flag">⚠ ${esc(flags.join(' · '))}</span></div>` : ''}
        <div class="actions">
          <button class="btn sm" data-act="present">Present</button>
          <button class="btn sm tools-btn" data-act="tools">Tools</button>
          ${p.status === 'active' ? '<button class="btn sec sm" data-act="discharge">Discharge</button>' : (p.anonymized ? '' : '<button class="btn sec sm" data-act="readmit">Readmit</button>')}
          ${p.anonymized ? '' : '<button class="btn sec sm" data-act="editP">Edit</button>'}
        </div>
      </div>
      <div class="tabs" style="top:calc(56px + var(--sat))">${PTABS.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-act="ptab" data-k="${k}">${l}${n[k] ? `<span class="n">${n[k]}</span>` : ''}</button>`).join('')}</div>
      <div class="content">${tabHTML}</div>`;
    const on = $('.tabs button.on');
    if (on) { const t = on.parentElement; t.scrollLeft = Math.max(0, on.offsetLeft - (t.clientWidth - on.offsetWidth) / 2); }
  }
  function algBanner(p) {
    if (p.allergyStatus === 'yes' && p.allergies.length) {
      const c = allergyConflicts(p);
      return `<button class="alg-banner" data-act="editAlg"><span class="alg-ico">⚠</span><span class="grow"><b>DRUG ALLERGY</b><br>${esc(p.allergies.map(algText).join(' · '))}${c.length ? `<br><b>Conflict with current: ${esc(c.map(m => m.name).join(', '))}</b>` : ''}</span></button>`;
    }
    if (p.allergyStatus === 'nkda') return `<button class="alg-ok" data-act="editAlg" data-abbr="NKDA">NKDA — no known drug allergies</button>`;
    return p.anonymized ? '' : `<button class="alg-unk" data-act="editAlg">Drug allergies not recorded — tap to add</button>`;
  }
  ACT.ptab = el => { ui.ptab[view.id] = el.dataset.k; render(); };
  ACT.copyHosp = () => { const p = getP(view.id); B.copy(p.hospNo); toast(`Hospital number <b>${esc(p.hospNo)}</b> copied`); };
  ACT.editP = () => patientForm(getP(view.id));
  ACT.pMenu = () => {
    const p = getP(view.id);
    const items = [['Present (case summary)', () => go('present', { id: p.id })]];
    if (!p.anonymized) items.push(['Edit patient details', () => patientForm(p)]);
    if (!p.anonymized) items.push([p.memo ? 'Edit short note' : 'Add a short note', () => ACT.editMemo()]);
    items.push(['Add to my logbook', () => logForm(null, p)]);
    items.push([p.teaching ? 'Unmark teaching case' : 'Mark as teaching case', () => { p.teaching = !p.teaching; touch(p); save(); refreshPatient(); }]);
    if (p.status === 'active') items.push(['Discharge', () => ACT.discharge()]);
    items.push(['Delete patient', () => deletePatient(p)]);
    openMenu(items);
  };
  // Short note: one line shown on the round list and the patient header (e.g. "Contact family").
  const MEMO_QUICK = ['Contact family', 'Family meeting today', 'NPO after midnight', 'Awaiting bed / transfer', 'Isolation precautions', 'Fall risk', 'Needs interpreter', 'Likely discharge today', 'Discuss with consultant'];
  ACT.editMemo = () => {
    const p = getP(view.id);
    if (!p) return;
    openSheet({ title: 'Short note', ctx: { pid: p.id },
      body: `<input class="inp" id="memo-text" maxlength="80" autocomplete="off" placeholder="e.g. Contact family" value="${esc(p.memo || '')}">
        <div class="hint">One short line. It shows on the round list and at the top of this page. No family names or phone numbers.</div>
        <div class="chips mt">${MEMO_QUICK.map(t => `<button class="chip static" data-act="memoQuick" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>`,
      foot: `${p.memo ? '<button class="btn ghost danger-text" data-act="memoClear">Clear</button>' : '<button class="btn sec" data-act="closeSheet">Cancel</button>'}<button class="btn" data-act="memoSave">Save</button>`,
      onMount: w => { const t = $('#memo-text', w); setTimeout(() => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 250); } });
  };
  ACT.memoQuick = el => { const i = $('#memo-text', topSheet().el); i.value = el.dataset.v; i.focus(); };
  ACT.memoSave = () => { const s = topSheet(), p = getP(s.ctx.pid); p.memo = $('#memo-text', s.el).value.trim().replace(/\s+/g, ' ').slice(0, 80); touch(p); save(); closeSheet(); refreshPatient(); toast(p.memo ? 'Note saved' : 'Note cleared'); };
  ACT.memoClear = () => { const s = topSheet(), p = getP(s.ctx.pid); p.memo = ''; touch(p); save(); closeSheet(); refreshPatient(); toast('Note cleared'); };
  ACT.attPick = el => { $('#f-att', topSheet().el).value = el.dataset.v; };
  async function deletePatient(p) {
    const ok = await dialog({ title: 'Delete this patient?', html: `<p><b>${esc(pName(p))}</b> and all notes, labs and plans will be removed from this phone.</p>`, ok: 'Delete', danger: true });
    if (!ok) return;
    S.patients = S.patients.filter(x => x.id !== p.id); save(); back(); toast('Deleted');
  }
  ACT.discharge = async () => {
    const p = getP(view.id);
    const r = await dialog({
      title: 'Discharge patient', ok: 'Discharge',
      html: `<div class="field"><label class="lbl">Discharge date</label><input class="inp" type="date" id="dc-date" value="${today()}" max="${today()}"></div>
        <label class="switch"><input type="checkbox" id="dc-teach" ${p.teaching ? 'checked' : ''}><span>Keep as teaching case <span class="muted small">(name and hospital number removed after ${S.settings.retention} days)</span></span></label>
        <p class="small" style="margin:8px 0 0">Other discharged records are deleted automatically after ${S.settings.retention} days.</p>`,
      onMount: (w, d) => { d.collect = w2 => ({ date: $('#dc-date', w2).value || today(), teach: $('#dc-teach', w2).checked }); }
    });
    if (!r) return;
    p.status = 'discharged'; p.dischargeDate = r.date; p.teaching = r.teach; touch(p); save();
    back(); toast(`${esc(pName(p))} discharged`);
  };
  ACT.readmit = async () => {
    const p = getP(view.id);
    const r = await dialog({
      title: 'Readmit patient', ok: 'Readmit',
      html: `<div class="field"><label class="lbl">New admission date</label><input class="inp" type="date" id="ra-date" value="${today()}" max="${today()}"></div>`,
      onMount: (w, d) => { d.collect = w2 => $('#ra-date', w2).value || today(); }
    });
    if (!r) return;
    p.status = 'active'; p.dischargeDate = null; p.admitDate = r; touch(p); save(); refreshPatient(); toast('Readmitted');
  };

  // ----- Dx tab -----
  function dxTab(p) {
    // Core comorbidities + the patient's specialty set + anything already ticked; "More" opens the full list.
    const shown = new Set([...COMORB_CORE, ...(COMORB_SPEC[p.specialty] || []), ...p.comorb, ...(ui.allComorb[p.id] ? [...COMORB.map(c => c[0]), ...S.settings.custom.comorb] : [])]);
    const comorbAll = sortItems([...shown].map(c => [c, '']));
    const extra = [];
    const probs = p.problems;
    return `
      <div class="section-title">Main diagnosis</div>
      <button class="pickbtn card" style="margin:0" data-act="pickMainDx">${p.mainDx ? `<span class="grow"><span class="bold" data-abbr="${esc(p.mainDx)}">${esc(p.mainDx)}</span>${dxMeaning(p.mainDx) ? `<br><span class="muted small">${esc(dxMeaning(p.mainDx))}</span>` : ''}</span>${icdOf(p.mainDx) ? `<span class="icd">${esc(icdOf(p.mainDx))}</span>` : ''}` : '<span class="ph">Choose from list…</span>'}</button>
      <div class="section-title">Other problems <button class="btn ghost sm right" data-act="addProblems">+ Add</button></div>
      <div class="card">${probs.length ? probs.map(x => `<div class="item">
          <div class="grow tap ${x.active ? '' : 'done-text'}" data-act="editProb" data-lp="editProb" data-i="${x.id}">${esc(x.text)}${icdOf(x.text) ? ` <span class="icd">${esc(icdOf(x.text))}</span>` : ''}</div>
          <button class="btn sm ${x.active ? 'sec' : 'ghost'}" data-act="toggleProb" data-i="${x.id}">${x.active ? 'Active' : 'Resolved'}</button>
          <button class="x" data-act="delProb" data-i="${x.id}" aria-label="Remove">×</button></div>`).join('') : '<div class="muted small">None recorded. Tap <b>+ Add</b>.</div>'}</div>
      <div class="section-title">Comorbidities <span class="right muted tiny">${p.comorb.length ? p.comorb.length + ' selected' : ''}</span></div>
      <div class="card"><div class="chips">${[...comorbAll, ...extra].map(([a]) => `<button class="chip ${p.comorb.includes(a) ? 'on' : ''}" data-act="toggleComorb" data-v="${esc(a)}" data-abbr="${esc(a)}">${esc(a)}</button>`).join('')}
        <button class="chip add" data-act="addComorb">+ More</button></div>
        <div class="hint">Long-press any abbreviation to see its meaning.</div></div>
      <div class="section-title">Teaching</div>
      <div class="card">
        <label class="switch"><input type="checkbox" data-chg="teach" ${p.teaching ? 'checked' : ''}><span>Teaching case</span></label>
        <textarea class="inp" data-inp="learning" placeholder="Learning points (optional)…">${esc(p.learning || '')}</textarea>
      </div>`;
  }
  ACT.pickMainDx = () => {
    const p = getP(view.id);
    openPicker({ title: `Main diagnosis · ${specShort(p.specialty)}`, groups: dxGroups(p.specialty), selected: p.mainDx ? [p.mainDx] : [], customKey: 'dx', onDone: v => { p.mainDx = v[0] || ''; touch(p); save(); refreshPatient(); } });
  };
  ACT.addProblems = () => {
    const p = getP(view.id);
    openPicker({
      title: `Add problems · ${specShort(p.specialty)}`, groups: dxGroups(p.specialty), multi: true, customKey: 'dx', selected: [],
      onDone: v => {
        v.forEach(t => { if (t !== p.mainDx && !p.problems.some(x => x.text === t)) p.problems.push({ id: uid(), text: t, active: true }); });
        touch(p); save(); refreshPatient();
      }
    });
  };
  ACT.toggleProb = el => { const p = getP(view.id); const x = p.problems.find(y => y.id === el.dataset.i); x.active = !x.active; touch(p); save(); refreshPatient(); };
  ACT.editProb = el => {
    const p = getP(view.id), x = p.problems.find(y => y.id === el.dataset.i);
    if (!x) return;
    const mean = dxMeaning(x.text) || explain(x.text);
    openSheet({ title: 'Edit problem', ctx: { pid: p.id, i: x.id },
      body: `<input class="inp" id="pr-text" value="${esc(x.text)}">${mean ? `<div class="hint">${esc(String(mean).replace(/<[^>]+>/g, ''))}</div>` : ''}
        <button class="btn sec block mt" data-act="probPick">Choose from the diagnosis list…</button>
        <div class="mt">${segHTML('prstat', [['1', 'Active'], ['0', 'Resolved']], x.active ? '1' : '0')}</div>`,
      foot: `<button class="btn ghost danger-text" data-act="probEditDel">Delete</button><button class="btn" data-act="probEditSave">Save</button>` });
  };
  ACT.probPick = () => {
    const s = topSheet(), p = getP(s.ctx.pid);
    openPicker({ title: `Problem · ${specShort(p.specialty)}`, groups: dxGroups(p.specialty), customKey: 'dx', selected: [$('#pr-text', s.el).value],
      onDone: v => { const t = Array.isArray(v) ? v[0] : v; if (t) $('#pr-text', s.el).value = t; } });
  };
  ACT.probEditSave = () => {
    const s = topSheet(), p = getP(s.ctx.pid), x = p.problems.find(y => y.id === s.ctx.i), t = $('#pr-text', s.el).value.trim();
    if (!t) { toast('Write the problem, or delete it'); return; }
    x.text = t; x.active = segVal(s.el, 'prstat') === '1'; touch(p); save(); closeSheet(); refreshPatient();
  };
  ACT.probEditDel = () => { const s = topSheet(), p = getP(s.ctx.pid); p.problems = p.problems.filter(y => y.id !== s.ctx.i); touch(p); save(); closeSheet(); refreshPatient(); toast('Problem deleted'); };
  ACT.delProb = el => { const p = getP(view.id); p.problems = p.problems.filter(y => y.id !== el.dataset.i); touch(p); save(); refreshPatient(); };
  ACT.toggleComorb = el => {
    const p = getP(view.id), v = el.dataset.v;
    if (p.comorb.includes(v)) p.comorb = p.comorb.filter(x => x !== v); else p.comorb.push(v);
    el.classList.toggle('on'); touch(p); save();
    const t = $('.section-title .right.tiny'); if (t) t.textContent = p.comorb.length ? p.comorb.length + ' selected' : '';
  };
  ACT.addComorb = () => {
    const p = getP(view.id);
    openPicker({
      title: 'Add comorbidity', groups: [{ name: 'Comorbidities', items: [...S.settings.custom.comorb.map(c => [c, '']), ...COMORB] }], multi: true, customKey: 'comorb', selected: p.comorb,
      onDone: v => { p.comorb = v; touch(p); save(); refreshPatient(); }
    });
  };
  CHG.teach = el => { const p = getP(view.id); p.teaching = el.checked; touch(p); save(); refreshPatient(); };
  INP.learning = el => { const p = getP(view.id); p.learning = el.value; touch(p); save(); };

  // ----- Labs tab -----
  const BCR_SRC = { known: 'previous result', est: 'estimated', nadir: 'lowest this stay' };
  const bcrShow = (p, full) => { const v = num(p.baseCr); if (v == null) return ''; const t = v.toFixed(2); return full ? `${t} mg/dL (${Math.round(v * 88.4)} µmol/L)` : t; };
  function labsTab(p) {
    if (!p.labs.length) return `<button class="btn block" data-act="addLab">+ Add results</button><div class="empty"><div class="big">🧪</div>No results yet.<div class="small mt">Enter today's labs from the hospital system using the hospital number above.</div></div>${cultsHTML(p)}`;
    const L = labsSorted(p);
    const calc = L.map(e => computed(p, e));
    const order = LAB_ORDER[p.specialty] || LAB_ORDER.Nephrology;
    const used = new Set();
    L.forEach((e, i) => { Object.keys(e.values).forEach(k => used.add(k)); Object.keys(calc[i]).forEach(k => used.add(k)); });
    const cell = (k, i) => {
      const e = L[i];
      const v = CALC_GROUP[k] ? calc[i][k] : e.values[k];
      if (v == null || v === '') return '<td></td>';
      const cls = classify(k, v, p.sex);
      let arr = '';
      for (let j = i + 1; j < L.length; j++) {
        const pv = CALC_GROUP[k] ? calc[j][k] : L[j].values[k];
        if (pv == null || pv === '') continue;
        if (typeof v === 'number' && typeof pv === 'number' && v !== pv) arr = `<span class="arr">${v > pv ? '↑' : '↓'}</span>`;
        break;
      }
      const xb = k === 'Cr' && num(p.baseCr) && typeof v === 'number' ? `<span class="xb">${(v / num(p.baseCr)).toFixed(1)}×</span>` : '';
      const bad = labCheck(k, v).st === 'bad' ? ' v-bad' : '';
      return `<td class="${cls ? 'v-' + cls : ''}${bad}" data-act="labValue" data-lp="labValue" data-k="${esc(k)}" data-lid="${e.id}">${esc(fmtNum(v))}${arr}${xb}</td>`;
    };
    let rows = '';
    for (const g of order) {
      const keys = LABS.filter(l => l.g === g && used.has(l.k)).map(l => l.k);
      Object.keys(CALC_GROUP).forEach(k => { if (CALC_GROUP[k] === g && used.has(k)) keys.push(k); });
      if (!keys.length) continue;
      rows += `<tr class="grp"><td colspan="${L.length + 1}">${esc(LAB_GROUP_NAMES[g])}</td></tr>`;
      keys.forEach(k => {
        const l = LABMAP[k];
        const unit = l ? (l.u || '') : CALC_UNIT[k];
        rows += `<tr class="${CALC_GROUP[k] ? 'calc' : ''}"><td class="lname" data-act="labTrend" data-k="${esc(k)}" data-abbr="${esc(k)}"><b>${esc(k)}</b>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</td>${L.map((_, i) => cell(k, i)).join('')}</tr>`;
      });
    }
    const custom = [...used].filter(k => k.startsWith('x:'));
    if (custom.length) {
      rows += `<tr class="grp"><td colspan="${L.length + 1}">Other tests</td></tr>`;
      custom.forEach(k => {
        const unit = (L.find(e => e.units && e.units[k]) || { units: {} }).units[k] || '';
        rows += `<tr><td><b>${esc(k.slice(2))}</b>${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</td>${L.map((e) => e.values[k] != null ? `<td>${esc(fmtNum(e.values[k]))}</td>` : '<td></td>').join('')}</tr>`;
      });
    }
    return `<button class="btn block" data-act="addLab">+ Add results</button>
      <div class="legend"><span class="l-hi">High</span><span class="l-lo">Low</span><span>Red box = needs attention</span></div>
      <div class="hint" style="margin:-4px 0 8px">Tap a value to correct it · tap a test name for its trend chart · tap a date to edit that day</div>
      <div class="labwrap"><table class="labs"><thead><tr><th>Test</th>${L.map(e => `<th class="date" data-act="editLab" data-lid="${e.id}">${fmtDM(e.date)}${e.source === 'out' ? '<br><span class="badge out" data-abbr="Out">Out</span>' : ''}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      ${L.some(e => e.note) ? `<div class="section-title">Lab notes</div><div class="card">${L.filter(e => e.note).map(e => `<div class="item"><span class="muted small">${fmtDM(e.date)}</span><div class="grow">${esc(e.note)}</div></div>`).join('')}</div>` : ''}
      ${cultsHTML(p)}
      <div class="hint mt">${num(p.baseCr) ? `Baseline creatinine ${bcrShow(p, 1)} (${BCR_SRC[p.baseCrSrc] || 'previous result'}); the small number under each Cr is the ratio to baseline. ` : ''}Reference ranges are typical adult values and may differ from your lab. eGFR uses CKD-EPI 2021 and is hidden for dialysis patients.</div>`;
  }
  // Plausibility: outside PLAUSIBLE is unusual (confirm); beyond twice those limits is impossible (blocked, with a likely correction).
  function labCheck(k, v) {
    const pl = PLAUSIBLE[k];
    if (!pl || typeof v !== 'number' || (v >= pl[0] && v <= pl[1])) return { st: 'ok', sug: [] };
    const l = LABMAP[k], sug = [];
    if (l && l.si) { const c = round(l.si.f(v), l.si.dp); if (c >= pl[0] && c <= pl[1]) sug.push({ v: c, why: `if ${fmtNum(v)} was in ${l.si.u}` }); }
    for (const d of [10, 100, 1000]) { const c = round(v / d, 3); if (c >= pl[0] && c <= pl[1]) { if (!sug.some(x => x.v === c)) sug.push({ v: c, why: 'decimal point' }); break; } }
    return { st: v > pl[1] * 2 || v < pl[0] / 2 ? 'bad' : 'odd', sug };
  }
  // Returns true when the values may be saved; may change inputs to an accepted suggestion. items: [{k, v, input}]
  async function confirmLabValues(items, out) {
    const bad = items.filter(x => labCheck(x.k, x.v).st === 'bad'), odd = items.filter(x => labCheck(x.k, x.v).st === 'odd');
    if (bad.length) {
      bad.forEach(x => x.input && x.input.classList.add('err'));
      const one = bad.length === 1 ? bad[0] : null, chk = one ? labCheck(one.k, one.v) : null;
      const r = await dialog({
        title: bad.length === 1 ? 'This value is not possible' : 'These values are not possible', ok: 'Go back and fix', cancel: null,
        html: `<p>${bad.map(x => `<b>${esc(x.k)} ${esc(fmtNum(x.v))}</b> ${esc((LABMAP[x.k] || {}).u || '')}`).join('<br>')}</p>
          ${one && chk.sug.length ? `<p class="small">Did you mean:</p><div class="col-btns">${chk.sug.map(sg => `<button class="btn sec block" data-sug="${sg.v}">${esc(one.k)} ${esc(fmtNum(sg.v))} ${esc((LABMAP[one.k] || {}).u || '')} <span class="muted small">(${esc(sg.why)})</span></button>`).join('')}</div>` : '<p class="small">Check the number and the unit.</p>'}`,
        onMount: w => $$('[data-sug]', w).forEach(b => b.addEventListener('click', () => closeDialog({ sug: Number(b.dataset.sug) })))
      });
      if (r && r.sug != null && one && one.input) { one.input.value = r.sug; one.input.classList.remove('err'); one.v = r.sug; return confirmLabValues(items, out); }
      const f = bad[0].input; if (f) setTimeout(() => { f.focus(); f.select && f.select(); }, 50);
      return false;
    }
    if (odd.length) {
      return !!await dialog({
        title: 'Check these values', ok: 'Save anyway', cancel: 'Go back',
        html: `<p>${odd.map(x => esc(`${x.k} ${fmtNum(x.v)} ${(LABMAP[x.k] || {}).u || ''}`)).join('<br>')}</p><p class="small">${out ? 'You chose <b>Outside</b> (SI units). If the report was in mg/dL, switch to <b>Our lab</b>.' : 'If these came from an outside report in µmol/L or mmol/L, switch the source to <b>Outside</b>.'}</p>`
      });
    }
    return true;
  }
  function trendPoints(p, k) {
    const out = [];
    labsSorted(p).slice().reverse().forEach(e => {
      const v = CALC_GROUP[k] ? computed(p, e)[k] : e.values[k];
      if (typeof v === 'number') out.push({ v, d: e.date, id: e.id, cls: classify(k, v, p.sex) });
    });
    return out;
  }
  // Small SVG line chart: reference band, baseline creatinine (dashed), points coloured high/low.
  function trendSVG(p, k, markId) {
    const pts = trendPoints(p, k);
    if (!pts.length) return '';
    const l = LABMAP[k], rr = l && !l.sel ? refRange(l, p.sex) : {}, base = k === 'Cr' && num(p.baseCr) ? num(p.baseCr) : null;
    const W = 340, H = 190, pl = 40, pr = 26, pt = 22, pb = 28;
    let lo = Math.min(...pts.map(x => x.v)), hi = Math.max(...pts.map(x => x.v));
    [rr.lo, rr.hi, base].forEach(x => { if (x != null && isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } });
    if (hi === lo) { hi += Math.abs(hi) * 0.1 || 1; lo -= Math.abs(lo) * 0.1 || 1; }
    const span = hi - lo; lo -= span * 0.08; hi += span * 0.1;
    if (lo < 0 && Math.min(...pts.map(x => x.v)) >= 0) lo = 0;
    const X = i => pts.length === 1 ? (pl + W - pr) / 2 : pl + i * (W - pl - pr) / (pts.length - 1);
    const Y = v => pt + (hi - v) * (H - pt - pb) / (hi - lo);
    const step = (() => { const raw = (hi - lo) / 4, m = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / m; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * m; })();
    let g = '';
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(t)}" y2="${Y(t)}" class="tg"/><text x="${pl - 5}" y="${Y(t) + 3.5}" class="ty">${fmtNum(round(t, 3))}</text>`;
    if (rr.lo != null || rr.hi != null) { const a = Y(rr.hi != null ? Math.min(rr.hi, hi) : hi), b = Y(rr.lo != null ? Math.max(rr.lo, lo) : lo); g += `<rect x="${pl}" y="${a}" width="${W - pl - pr}" height="${Math.max(0, b - a)}" class="tband"/>`; }
    if (base != null) g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(base)}" y2="${Y(base)}" class="tbase"/><text x="${W - pr}" y="${Y(base) - 4}" class="tbl">baseline ${fmtNum(base)}</text>`;
    g += `<polyline points="${pts.map((x, i) => `${X(i)},${Y(x.v)}`).join(' ')}" class="tline"/>`;
    const many = pts.length > 8, imin = pts.reduce((a, x, i) => x.v < pts[a].v ? i : a, 0), imax = pts.reduce((a, x, i) => x.v > pts[a].v ? i : a, 0);
    pts.forEach((x, i) => {
      g += `<circle cx="${X(i)}" cy="${Y(x.v)}" r="${x.id === markId ? 6 : 4.5}" class="tp ${x.cls ? 'tp-' + x.cls : ''} ${x.id === markId ? 'tp-mark' : ''}"/>`;
      if (!many || i === 0 || i === pts.length - 1 || i === imin || i === imax) g += `<text x="${X(i)}" y="${Y(x.v) - 9}" class="tv">${esc(fmtNum(x.v))}</text>`;
      const every = Math.ceil(pts.length / 6);
      if (i % every === 0 || i === pts.length - 1) g += `<text x="${X(i)}" y="${H - 9}" class="tx">${fmtDM(x.d)}</text>`;
    });
    return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(k)} trend">${g}</svg>`;
  }
  function trendSummary(p, k) {
    const pts = trendPoints(p, k);
    if (pts.length < 2) return pts.length ? 'Only one result so far.' : '';
    const a = pts[0], z = pts[pts.length - 1], pk = pts.reduce((m, x) => x.v > m.v ? x : m), mn = pts.reduce((m, x) => x.v < m.v ? x : m);
    const base = k === 'Cr' && num(p.baseCr) ? num(p.baseCr) : null;
    return `First ${fmtNum(a.v)} (${fmtDM(a.d)}) → latest ${fmtNum(z.v)} (${fmtDM(z.d)}) · highest ${fmtNum(pk.v)}, lowest ${fmtNum(mn.v)}${base ? ` · latest ${(z.v / base).toFixed(1)}× baseline` : ''}`;
  }
  function labHead(p, k) {
    const l = LABMAP[k];
    let t = `<div class="bold">${esc(k)} <span class="muted small" style="font-weight:400">${esc(l ? l.n : glText(k))}</span></div>`;
    if (l && !l.sel) { const { lo, hi } = refRange(l, p.sex); if (lo != null || hi != null) t += `<div class="small muted">Reference ${lo != null ? lo : ''}${lo != null && hi != null ? '–' : ''}${hi != null ? hi : (lo != null ? '+' : '')} ${esc(l.u || '')}</div>`; }
    return t;
  }
  ACT.labTrend = el => {
    const p = getP(view.id), k = el.dataset.k, pts = trendPoints(p, k);
    openSheet({ title: `${k} trend`, ctx: { pid: p.id, k },
      body: `${labHead(p, k)}<div class="mt">${trendSVG(p, k) || '<div class="empty">No numeric results.</div>'}</div><div class="small muted">${esc(trendSummary(p, k))}</div>
        ${pts.length ? `<div class="card mt" style="padding:4px 8px">${pts.slice().reverse().map(x => `<div class="item tap" data-act="labValue" data-k="${esc(k)}" data-lid="${x.id}"><span class="grow">${fmtD(x.d)}</span><b class="${x.cls ? 'v-' + x.cls : ''}">${esc(fmtNum(x.v))}</b><span class="muted">›</span></div>`).join('')}</div>` : ''}` });
  };
  ACT.labValue = el => {
    const p = getP(view.id), k = el.dataset.k, e = p.labs.find(x => x.id === el.dataset.lid);
    if (!e) return;
    if (topSheet() && topSheet().ctx && topSheet().ctx.k === k) closeSheet();
    const l = LABMAP[k], v = CALC_GROUP[k] ? computed(p, e)[k] : e.values[k];
    if (CALC_GROUP[k] || !l) { ACT.labTrend({ dataset: { k } }); return; }
    const chk = labCheck(k, v);
    openSheet({
      title: `${k} · ${fmtD(e.date)}`, ctx: { pid: p.id, lid: e.id, k, ed: true },
      body: `${labHead(p, k)}
        ${chk.st === 'bad' ? `<div class="warnbox mt">⚠ ${esc(fmtNum(v))} is not a possible ${esc(k)} value${chk.sug.length ? ` — probably ${esc(fmtNum(chk.sug[0].v))}` : ''}. Correct it below.</div>` : ''}
        <div class="field mt"><label>Result${l.u ? ` (${esc(l.u)})` : ''}</label>
          ${l.sel ? `<select class="inp" id="lv-val"><option value=""></option>${l.sel.map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
            : `<input class="inp" id="lv-val" inputmode="decimal" autocomplete="off" value="${esc(v != null ? fmtNum(v) : '')}">`}
          ${e.orig && e.orig[k] != null && l.si ? `<div class="hint">Entered as ${esc(fmtNum(e.orig[k]))} ${esc(l.si.u)} (outside lab); edit here in ${esc(l.u)}.</div>` : ''}</div>
        ${l.sel ? '' : `<div class="mt">${trendSVG(p, k, e.id)}</div><div class="small muted">${esc(trendSummary(p, k))}</div>`}`,
      foot: `<button class="btn ghost danger-text" data-act="labValueDel">Delete</button><button class="btn sec" data-act="labValueDay">Whole day</button><button class="btn" data-act="labValueSave">Save</button>`,
      onMount: w => { const i = $('#lv-val', w); if (i && chk.st === 'bad') setTimeout(() => { i.focus(); i.select(); }, 250); }
    });
  };
  ACT.labValueSave = async () => {
    const s = topSheet(), p = getP(s.ctx.pid), e = p.labs.find(x => x.id === s.ctx.lid), k = s.ctx.k, l = LABMAP[k], inp = $('#lv-val', s.el);
    const old = e.values[k];
    if (l.sel) { if (inp.value) e.values[k] = inp.value; else delete e.values[k]; }
    else {
      const v = num(inp.value);
      if (v == null) { if (inp.value.trim()) { toast('Enter a number'); return; } return ACT.labValueDel(); }
      const items = [{ k, v, input: inp }];
      if (!await confirmLabValues(items, false)) return;
      e.values[k] = items[0].v;
      if (e.orig) delete e.orig[k];
    }
    if (!Object.keys(e.values).length) p.labs = p.labs.filter(x => x !== e);
    touch(p); save(); closeSheet(); refreshPatient();
    toast(old !== e.values[k] ? `${esc(k)} changed from ${esc(fmtNum(old))} to <b>${esc(fmtNum(e.values[k]))}</b>` : 'No change', 2200);
  };
  ACT.labValueDel = async () => {
    const s = topSheet(), p = getP(s.ctx.pid), e = p.labs.find(x => x.id === s.ctx.lid), k = s.ctx.k;
    if (!await dialog({ title: `Delete ${k} ${fmtNum(e.values[k])} from ${fmtD(e.date)}?`, ok: 'Delete', danger: true })) return;
    delete e.values[k]; if (e.orig) delete e.orig[k];
    if (!Object.keys(e.values).length) p.labs = p.labs.filter(x => x !== e);
    touch(p); save(); closeSheet(); refreshPatient(); toast(`${esc(k)} deleted`);
  };
  ACT.labValueDay = () => { const s = topSheet(), p = getP(s.ctx.pid), e = p.labs.find(x => x.id === s.ctx.lid); closeSheet(); labForm(p, e); };
  ACT.labInfo = el => {
    const p = getP(view.id), k = el.dataset.k, e = p.labs.find(x => x.id === el.dataset.lid);
    const l = LABMAP[k];
    let txt = `<b>${esc(k)}</b> ${esc(l ? l.n : glText(k))}`;
    if (l && !l.sel) {
      const { lo, hi } = refRange(l, p.sex);
      if (lo != null || hi != null) txt += `<br>Ref ${lo != null ? lo : ''}${lo != null && hi != null ? '–' : ''}${hi != null ? hi : (lo != null ? '+' : '')} ${esc(l.u || '')}`;
    }
    if (e && e.orig && e.orig[k] != null && l && l.si) txt += `<br>Entered as ${esc(fmtNum(e.orig[k]))} ${esc(l.si.u)} (outside lab)`;
    toast(txt, 3500);
  };
  ACT.addLab = () => labForm(getP(view.id), null);
  ACT.editLab = el => { const p = getP(view.id); labForm(p, p.labs.find(x => x.id === el.dataset.lid)); };

  function labForm(p, entry) {
    const e = entry || { date: today(), source: 'our', values: {}, orig: {}, units: {}, note: '' };
    const order = LAB_ORDER[p.specialty] || LAB_ORDER.Nephrology;
    const L = labsSorted(p).filter(x => !entry || x.id !== entry.id);
    const prevOf = k => { const x = L.find(y => y.values[k] != null && (!entry || y.date <= e.date)); return x ? `${fmtNum(x.values[k])} · ${fmtDM(x.date)}` : ''; };
    const valFor = l => {
      if (e.source === 'out' && e.orig && e.orig[l.k] != null) return e.orig[l.k];
      return e.values[l.k] != null ? e.values[l.k] : '';
    };
    const groupsHTML = order.filter(g => LABS.some(l => l.g === g)).map((g, gi) => {
      const labs = LABS.filter(l => l.g === g);
      const filled = labs.filter(l => e.values[l.k] != null).length;
      const open = gi < 4 || filled > 0;
      return `<details class="labgrp" ${open ? 'open' : ''}><summary>${esc(LAB_GROUP_NAMES[g])}<span class="filled">${filled ? filled + ' entered' : ''}</span></summary>
        ${labs.map(l => {
          const prev = prevOf(l.k);
          if (l.sel) return `<div class="labrow"><div><div class="lk" data-abbr="${esc(l.k)}">${esc(l.k)}</div></div>
            <select class="inp" data-lab="${esc(l.k)}"><option value=""></option>${l.sel.map(o => `<option ${e.values[l.k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
            <div class="prev">${esc(prev)}</div></div>`;
          return `<div class="labrow"><div><div class="lk" data-abbr="${esc(l.k)}">${esc(l.k)}</div><div class="lu" data-unit="${esc(l.k)}">${esc(l.u || '')}</div></div>
            <input class="inp" data-lab="${esc(l.k)}" data-inp="labVal" inputmode="${l.k === 'BE' ? 'text' : 'decimal'}" autocomplete="off" enterkeyhint="next" value="${esc(valFor(l))}">
            <div class="prev">${prev ? 'prev ' + esc(prev) : ''}</div><div class="conv" data-conv="${esc(l.k)}"></div></div>`;
        }).join('')}</details>`;
    }).join('');
    const extras = Object.keys(e.values).filter(k => k.startsWith('x:'));
    openSheet({
      full: true, title: entry ? 'Edit results' : 'Add results',
      ctx: { pid: p.id, lid: entry ? entry.id : null, source: e.source || 'our' },
      body: `
        <div class="grid2">
          <div class="field"><label>Date</label><input class="inp" type="date" id="lab-date" max="${today()}" value="${esc(e.date)}"></div>
          <div class="field"><label>Source</label>${segHTML('src', [['our', 'Our lab'], ['out', 'Outside']], e.source || 'our')}</div>
        </div>
        <div class="hint mb" id="src-hint"></div>
        ${groupsHTML}
        <details class="labgrp" ${extras.length ? 'open' : ''}><summary>Other test (not in the list)</summary>
          <div id="xrows">${extras.map(k => xRow(k.slice(2), e.values[k], (e.units || {})[k])).join('')}</div>
          <div style="padding:8px 12px"><button class="btn ghost sm" data-act="addXRow">+ Add another test</button></div></details>
        <div class="field mt"><label>Note (optional)</label><input class="inp" id="lab-note" autocomplete="off" value="${esc(e.note || '')}" placeholder="e.g. hemolysed sample, post-HD"></div>`,
      foot: `${entry ? '<button class="btn danger" data-act="delLab" style="flex:none">Delete</button>' : ''}<button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="saveLab">Save</button>`,
      onMount: w => {
        updateSrc(w);
        if (!extras.length) $('#xrows', w).innerHTML = xRow('', '', '');
        $$('input[data-lab]', w).forEach(inp => inp.addEventListener('keydown', ev => {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          const all = $$('input[data-lab], select[data-lab]', w).filter(x => x.offsetParent !== null);
          const i = all.indexOf(inp);
          if (all[i + 1]) all[i + 1].focus(); else inp.blur();
        }));
      }
    });
  }
  const xRow = (name, val, unit) => `<div class="labrow xrow" style="grid-template-columns:1fr 90px 70px"><input class="inp" data-x="n" placeholder="Test name" value="${esc(name || '')}" style="text-align:left;font-weight:500"><input class="inp" data-x="v" inputmode="decimal" placeholder="Value" value="${esc(val != null ? val : '')}"><input class="inp" data-x="u" placeholder="Unit" value="${esc(unit || '')}" style="text-align:left;font-weight:400;font-size:14px"></div>`;
  ACT.addXRow = () => { const w = topSheet().el; $('#xrows', w).insertAdjacentHTML('beforeend', xRow('', '', '')); };
  SEG_HOOK.src = v => { const s = topSheet(); s.ctx.source = v; updateSrc(s.el); };
  function updateSrc(w) {
    const out = topSheet().ctx.source === 'out';
    $('#src-hint', w).innerHTML = out
      ? 'Type values <b>as printed on the outside report</b> (SI units, e.g. creatinine in µmol/L). They are converted to our units when saved.'
      : 'Our lab units (creatinine in mg/dL). For results from government or private hospitals in µmol/L, choose <b>Outside</b>.';
    LABS.forEach(l => {
      const u = $(`[data-unit="${CSS.escape(l.k)}"]`, w);
      if (u) u.textContent = out && l.si ? l.si.u : (l.u || '');
      updateConv(w, l.k);
    });
  }
  function updateConv(w, k) {
    const l = LABMAP[k], c = $(`[data-conv="${CSS.escape(k)}"]`, w);
    if (!c) return;
    const out = topSheet().ctx.source === 'out';
    const v = num(($(`[data-lab="${CSS.escape(k)}"]`, w) || {}).value);
    c.textContent = out && l.si && v != null ? `= ${fmtNum(round(l.si.f(v), l.si.dp))} ${l.u}` : '';
  }
  INP.labVal = el => updateConv(topSheet().el, el.dataset.lab);
  ACT.saveLab = async () => {
    const s = topSheet(), w = s.el, p = getP(s.ctx.pid);
    const out = s.ctx.source === 'out';
    const values = {}, orig = {}, units = {};
    const checks = [];
    for (const l of LABS) {
      const el = $(`[data-lab="${CSS.escape(l.k)}"]`, w);
      if (!el) continue;
      el.classList.remove('err');
      if (l.sel) { if (el.value) values[l.k] = el.value; continue; }
      const v = num(el.value);
      if (v == null) continue;
      let stored = v;
      if (out && l.si) { stored = round(l.si.f(v), l.si.dp); orig[l.k] = v; }
      values[l.k] = stored;
      if (!out || !l.si) checks.push({ k: l.k, v: stored, input: el });
      else if (labCheck(l.k, stored).st !== 'ok') checks.push({ k: l.k, v: stored, input: null });
    }
    $$('.xrow', w).forEach(r => {
      const n = $('[data-x="n"]', r).value.trim(), raw = $('[data-x="v"]', r).value.trim(), u = $('[data-x="u"]', r).value.trim();
      if (!n || !raw) return;
      const v = num(raw);
      values['x:' + n] = v == null ? raw : v;
      if (u) units['x:' + n] = u;
    });
    if (!Object.keys(values).length) { toast('Enter at least one result'); return; }
    if (!await confirmLabValues(checks, out)) return;
    checks.forEach(x => { values[x.k] = x.v; });
    const date = $('#lab-date', w).value || today();
    const note = $('#lab-note', w).value.trim();
    if (s.ctx.lid) {
      const e = p.labs.find(x => x.id === s.ctx.lid);
      Object.assign(e, { date, source: s.ctx.source, values, orig, units, note });
    } else {
      p.labs.push({ id: uid(), created: Date.now(), date, source: s.ctx.source, values, orig, units, note });
    }
    touch(p); save(); closeSheet(); refreshPatient();
    const f = patientFlags(p);
    toast(f.length ? `Saved · <b>⚠ ${esc(f.join(', '))}</b>` : 'Results saved', f.length ? 3500 : 1800);
  };
  ACT.delLab = async () => {
    const s = topSheet();
    if (!await dialog({ title: 'Delete these results?', ok: 'Delete', danger: true })) return;
    const p = getP(s.ctx.pid); p.labs = p.labs.filter(x => x.id !== s.ctx.lid); touch(p); save(); closeSheet(); refreshPatient();
  };

  // ----- Imaging / investigations tab -----
  function invGroups(spec) {
    const g = [];
    if (S.settings.custom.inv.length) g.push({ name: 'My items', items: S.settings.custom.inv.map(x => [x, '']) });
    if (INV[spec]) g.push({ name: spec, items: INV[spec] });
    g.push({ name: 'Common', items: INV.common });
    SPECIALTIES.forEach(s => { if (s.key !== spec) g.push({ name: s.key, items: INV[s.key], extra: true }); });
    return g;
  }
  function invTab(p) {
    const list = [...p.imaging].sort((a, b) => a.date === b.date ? (b.created || 0) - (a.created || 0) : (a.date < b.date ? 1 : -1));
    return `<button class="btn block" data-act="addInv">+ Add imaging or investigation</button>
      ${list.length ? `<div class="card mt">${list.map(x => `<div class="item tap" data-act="editInv" data-lp="editInv" data-i="${x.id}">
          <div class="grow"><div class="row"><b data-abbr="${esc(x.type)}">${esc(x.type)}</b><span class="badge st-${esc(x.status)}">${esc(x.status)}</span><span class="right muted small">${fmtDM(x.date)}</span></div>
          ${x.finding ? `<div class="note-text">${esc(x.finding)}</div>` : ''}</div></div>`).join('')}</div>`
        : `<div class="empty"><div class="big">🩻</div>No imaging or investigations yet.</div>`}`;
  }
  ACT.addInv = () => invForm(getP(view.id), null);
  ACT.editInv = el => { const p = getP(view.id); invForm(p, p.imaging.find(x => x.id === el.dataset.i)); };
  function invForm(p, x) {
    const d = x || { date: today(), type: '', status: 'Normal', finding: '' };
    openSheet({
      full: true, title: x ? 'Edit investigation' : 'Add investigation',
      ctx: { pid: p.id, id: x ? x.id : null, type: d.type },
      body: `
        <div class="field"><label>Type</label><button class="pickbtn" data-act="invPickType" id="inv-type">${d.type ? esc(d.type) : '<span class="ph">Choose…</span>'}</button></div>
        <div class="field"><label>Date</label><input class="inp" type="date" id="inv-date" max="${today()}" value="${esc(d.date)}"></div>
        <div class="field"><label>Result</label>${segHTML('invst', ['Normal', 'Abnormal', 'Pending'], d.status)}</div>
        <div class="field"><label>Findings — tap to add</label><div class="chips" id="inv-chips"></div></div>
        <div class="field"><textarea class="inp" id="inv-find" placeholder="Findings / report summary">${esc(d.finding)}</textarea></div>`,
      foot: `${x ? '<button class="btn danger" data-act="delInv" style="flex:none">Delete</button>' : ''}<button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="saveInv">Save</button>`,
      onMount: w => { drawInvChips(w, d.type); if (!x) setTimeout(() => ACT.invPickType(), 120); }
    });
  }
  function drawInvChips(w, type) {
    const f = FINDINGS[type] || FINDINGS._default;
    $('#inv-chips', w).innerHTML = f.map(t => `<button class="chip static" data-act="invChip" data-v="${esc(t)}" data-abbr="${esc(t)}">${esc(t)}</button>`).join('');
  }
  ACT.invPickType = () => {
    const s = topSheet(), p = getP(s.ctx.pid);
    openPicker({
      title: 'Imaging / investigation', groups: invGroups(p.specialty), selected: s.ctx.type ? [s.ctx.type] : [], customKey: 'inv',
      onDone: v => { s.ctx.type = v[0] || ''; $('#inv-type', s.el).innerHTML = s.ctx.type ? esc(s.ctx.type) : '<span class="ph">Choose…</span>'; drawInvChips(s.el, s.ctx.type); }
    });
  };
  ACT.invChip = el => {
    const ta = $('#inv-find', topSheet().el), t = el.dataset.v;
    const cur = ta.value.trim();
    ta.value = cur ? (/[,.;:]$/.test(cur) || cur.endsWith(': ') ? cur + ' ' + t : cur + ', ' + t) : t;
    if (t === 'Normal' || t === 'No acute findings' || t === 'No growth') {
      const seg = $('[data-seg="invst"]', topSheet().el); const b = $$('button', seg).find(x => x.dataset.v === 'Normal'); if (b) ACT.seg(b);
    } else if (!['See report', 'Report pending'].includes(t)) {
      const seg = $('[data-seg="invst"]', topSheet().el); if (seg.dataset.value === 'Normal' || seg.dataset.value === 'Pending') { const b = $$('button', seg).find(x => x.dataset.v === 'Abnormal'); if (b) ACT.seg(b); }
    }
    const blank = ta.value.indexOf('__');
    ta.focus();
    if (blank >= 0) ta.setSelectionRange(blank, blank + 2); else if (/: $/.test(t)) ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  ACT.saveInv = () => {
    const s = topSheet(), w = s.el, p = getP(s.ctx.pid);
    if (!s.ctx.type) { toast('Choose the type first'); return; }
    const data = { type: s.ctx.type, date: $('#inv-date', w).value || today(), status: segVal(w, 'invst') || 'Normal', finding: $('#inv-find', w).value.trim() };
    if (s.ctx.id) Object.assign(p.imaging.find(x => x.id === s.ctx.id), data);
    else p.imaging.push(Object.assign({ id: uid(), created: Date.now() }, data));
    touch(p); save(); closeSheet(); refreshPatient(); toast('Saved');
  };
  ACT.delInv = async () => {
    const s = topSheet();
    if (!await dialog({ title: 'Delete this investigation?', ok: 'Delete', danger: true })) return;
    const p = getP(s.ctx.pid); p.imaging = p.imaging.filter(x => x.id !== s.ctx.id); touch(p); save(); closeSheet(); refreshPatient();
  };

  // ----- Cultures (Labs tab) -----
  // {id, date (sent), specimen, status pend|neg|pos|contam, organism, tags[], sens{abx: 'S'|'R'}, note}
  const CULT_ST = [['pend', 'Pending'], ['neg', 'No growth'], ['pos', 'Growth'], ['contam', 'Contaminant']];
  const cultStName = s => (CULT_ST.find(x => x[0] === s) || ['', s])[1];
  function cultLine(c, short) {
    const ab = k => Object.keys(c.sens || {}).filter(a => c.sens[a] === k);
    const s = ab('S'), r = ab('R');
    let t = `${c.specimen}${short ? ' ' + fmtDM(c.date) : ` (sent ${fmtDM(c.date)})`}: `;
    t += c.status === 'pos' ? (c.organism || 'growth') + ((c.tags || []).length ? ` [${c.tags.join(', ')}]` : '') : cultStName(c.status).toLowerCase();
    if (c.status === 'pos' && s.length) t += `; S: ${s.join(', ')}`;
    if (c.status === 'pos' && r.length) t += `; R: ${r.join(', ')}`;
    if (!short && c.note) t += ` — ${c.note.replace(/\n+/g, '; ')}`;
    return t;
  }
  const cultsSorted = p => [...p.cultures].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  // For the round sheet: pending ones and anything from the last 14 days.
  const cultsRecent = p => cultsSorted(p).filter(c => c.status === 'pend' || daysBetween(c.date, today()) <= 14);
  function cultsHTML(p) {
    const list = cultsSorted(p);
    return `<div class="section-title">Cultures <span class="right muted tiny">${list.filter(c => c.status === 'pend').length ? list.filter(c => c.status === 'pend').length + ' pending' : ''}</span></div>
      ${list.length ? `<div class="card">${list.map(c => `<div class="item tap" data-act="editCult" data-lp="editCult" data-i="${c.id}">
          <div class="grow"><div class="row"><b>${esc(c.specimen)}</b><span class="badge cst-${c.status}">${esc(cultStName(c.status))}</span><span class="right muted small">${fmtDM(c.date)}</span></div>
          ${c.status === 'pos' ? `<div><i>${esc(c.organism || 'Organism not yet named')}</i>${(c.tags || []).map(t => ` <span class="badge flag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${c.status === 'pos' && Object.keys(c.sens || {}).length ? `<div class="small">${['S', 'R'].map(k => { const a = Object.keys(c.sens).filter(x => c.sens[x] === k); return a.length ? `<span class="${k === 'R' ? 'danger-text' : 'ok-text'}">${k === 'S' ? 'Sensitive' : 'Resistant'}:</span> ${esc(a.join(', '))}` : ''; }).filter(Boolean).join('<br>')}</div>` : ''}
          ${c.note ? `<div class="note-text">${esc(c.note)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
      <button class="btn sec block mt-s" data-act="addCult">+ Add culture</button>`;
  }
  ACT.addCult = () => cultForm(getP(view.id), null);
  ACT.editCult = el => { const p = getP(view.id); cultForm(p, p.cultures.find(x => x.id === el.dataset.i)); };
  function cultForm(p, c) {
    const d = c || { date: today(), specimen: '', status: 'pend', organism: '', tags: [], sens: {}, note: '' };
    openSheet({ full: true, title: c ? 'Edit culture' : 'Add culture',
      ctx: { pid: p.id, id: c ? c.id : null, organism: d.organism || '', tags: [...(d.tags || [])], sens: Object.assign({}, d.sens || {}) },
      body: `<div class="field"><label>Specimen</label><div class="chips" id="cu-specs">${CULTURE_SPECIMENS.map(s => `<button class="chip ${d.specimen === s ? 'on' : ''}" data-act="cultSpec" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          <input class="inp mt-s" id="cu-spec" autocomplete="off" placeholder="Or type another specimen" value="${esc(CULTURE_SPECIMENS.includes(d.specimen) ? '' : d.specimen)}"></div>
        <div class="field"><label>Date sent</label><input class="inp" type="date" id="cu-date" max="${today()}" value="${esc(d.date)}"></div>
        <div class="field"><label>Result</label>${segHTML('cust', CULT_ST, d.status, 'wrap')}</div>
        <div id="cu-pos"></div>
        <div class="field"><label>Note <span class="muted tiny">· optional (e.g. Gram stain, colony count)</span></label><textarea class="inp" id="cu-note" rows="2">${esc(d.note || '')}</textarea></div>`,
      foot: `${c ? '<button class="btn danger" data-act="delCult" style="flex:none">Delete</button>' : ''}<button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="saveCult">Save</button>`,
      onMount: w => drawCultPos(w, d.status) });
  }
  function drawCultPos(w, st) {
    const s = topSheet(), box = $('#cu-pos', w);
    if (st !== 'pos') { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="field"><label>Organism</label><button class="pickbtn" data-act="cultOrg" id="cu-org">${s.ctx.organism ? esc(s.ctx.organism) : '<span class="ph">Choose organism…</span>'}</button></div>
      <div class="field"><label>Resistance</label><div class="chips">${RESIST_TAGS.map(t => `<button class="chip ${s.ctx.tags.includes(t) ? 'on' : ''}" data-act="cultTag" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="field"><label>Sensitivity — tap once for <span class="ok-text">S</span>, twice for <span class="danger-text">R</span>, again to clear</label>
        <div class="chips" id="cu-abx">${ANTIBIOTICS.map(a => abxChip(a, s.ctx.sens[a])).join('')}</div></div>`;
  }
  const abxChip = (a, v) => `<button class="chip abx ${v === 'S' ? 'abx-s' : v === 'R' ? 'abx-r' : ''}" data-act="cultAbx" data-v="${esc(a)}">${v ? `<b>${v}</b> ` : ''}${esc(a)}</button>`;
  SEG_HOOK.cust = (v, seg) => drawCultPos(seg.closest('.sheet'), v);
  ACT.cultSpec = el => { const w = topSheet().el; $$('#cu-specs .chip', w).forEach(b => b.classList.toggle('on', b === el && !el.classList.contains('on'))); $('#cu-spec', w).value = ''; };
  ACT.cultTag = el => { const s = topSheet(), t = el.dataset.v; s.ctx.tags = s.ctx.tags.includes(t) ? s.ctx.tags.filter(x => x !== t) : [...s.ctx.tags, t]; el.classList.toggle('on'); };
  ACT.cultAbx = el => { const s = topSheet(), a = el.dataset.v, cur = s.ctx.sens[a]; const nx = !cur ? 'S' : cur === 'S' ? 'R' : ''; if (nx) s.ctx.sens[a] = nx; else delete s.ctx.sens[a]; el.outerHTML = abxChip(a, nx); };
  ACT.cultOrg = () => {
    const s = topSheet();
    const mine = S.settings.custom.org || [];
    openPicker({ title: 'Organism', groups: [...(mine.length ? [{ name: 'My items', items: mine.map(x => [x, '']) }] : []), { name: 'Organisms', items: sortItems(ORGANISMS) }], selected: s.ctx.organism ? [s.ctx.organism] : [], customKey: 'org',
      onDone: v => { s.ctx.organism = v[0] || ''; $('#cu-org', s.el).innerHTML = s.ctx.organism ? esc(s.ctx.organism) : '<span class="ph">Choose organism…</span>'; } });
  };
  ACT.saveCult = () => {
    const s = topSheet(), w = s.el, p = getP(s.ctx.pid);
    const chip = $('#cu-specs .chip.on', w), specimen = ($('#cu-spec', w).value.trim() || (chip ? chip.dataset.v : ''));
    if (!specimen) { toast('Choose the specimen'); return; }
    const status = segVal(w, 'cust') || 'pend';
    const data = { specimen, date: $('#cu-date', w).value || today(), status, organism: status === 'pos' ? s.ctx.organism : '', tags: status === 'pos' ? s.ctx.tags : [], sens: status === 'pos' ? s.ctx.sens : {}, note: $('#cu-note', w).value.trim() };
    if (s.ctx.id) Object.assign(p.cultures.find(x => x.id === s.ctx.id), data);
    else p.cultures.push(Object.assign({ id: uid(), created: Date.now() }, data));
    touch(p); save(); closeSheet(); refreshPatient(); toast('Culture saved');
  };
  ACT.delCult = async () => {
    const s = topSheet();
    if (!await dialog({ title: 'Delete this culture?', ok: 'Delete', danger: true })) return;
    const p = getP(s.ctx.pid); p.cultures = p.cultures.filter(x => x.id !== s.ctx.id); touch(p); save(); closeSheet(); refreshPatient();
  };
  // v0.8.1: cultures used to be entered as investigations — move them to the Labs tab once.
  const OLD_CULT = { 'Blood culture': 'Blood', 'Urine culture': 'Urine', 'Sputum culture': 'Sputum', 'Wound swab culture': 'Wound swab', 'Catheter tip culture': 'Catheter tip', 'Line tip culture': 'Line tip', 'Endotracheal aspirate culture': 'Endotracheal aspirate' };
  function migrateCultures(p) {
    if (!Array.isArray(p.cultures)) p.cultures = [];
    const keep = [];
    (p.imaging || []).forEach(x => {
      const spec = OLD_CULT[x.type] || (/\bculture\b/i.test(x.type || '') ? x.type.replace(/\s*culture\s*/i, ' ').trim() || x.type : null);
      if (!spec) { keep.push(x); return; }
      p.cultures.push({ id: x.id, created: x.created || Date.now(), date: x.date || today(), specimen: spec, status: x.status === 'Pending' ? 'pend' : x.status === 'Abnormal' ? 'pos' : 'neg', organism: '', tags: [], sens: {}, note: x.finding || '' });
    });
    p.imaging = keep;
  }

  // ----- Medications tab -----
  const medLine = m => [m.name, m.dose ? `${m.dose} ${m.unit || ''}`.trim() : '', m.route, m.freq].filter(Boolean).join(' ');
  function medsTab(p) {
    const active = p.meds.filter(m => !m.stop).sort((a, b) => a.name.localeCompare(b.name));
    const stopped = p.meds.filter(m => m.stop).sort((a, b) => (b.stop || '').localeCompare(a.stop || ''));
    const show = ui.showStopped[p.id];
    return `<button class="btn block" data-act="addMed">+ Add medication</button>
      ${active.length ? `<div class="section-title">Current <span class="right muted tiny">${active.length}</span></div><div class="card">${active.map(m => `<div class="item">
          <div class="grow tap" data-act="editMed" data-lp="editMed" data-i="${m.id}"><div class="bold">${esc(m.name)}</div>${medAlgNote(p, m.name)}<div class="small" data-abbr="${esc([m.route, m.freq].join(' '))}">${esc([m.dose ? `${m.dose} ${m.unit || ''}` : '', m.route, m.freq].filter(Boolean).join(' · '))}</div>
          <div class="tiny muted">${m.start ? 'since ' + fmtDM(m.start) : ''}${m.note ? ' · ' + esc(m.note) : ''}</div></div>
          <button class="btn sec sm" data-act="stopMed" data-i="${m.id}">Stop</button></div>`).join('')}</div>`
        : `<div class="empty"><div class="big">💊</div>No current medications.</div>`}
      ${stopped.length ? `<button class="btn ghost sm mt" data-act="toggleStopped">${show ? 'Hide' : 'Show'} stopped (${stopped.length})</button>
        ${show ? `<div class="card">${stopped.map(m => `<div class="item"><div class="grow tap" data-act="editMed" data-i="${m.id}"><div class="done-text">${esc(medLine(m))}</div><div class="tiny muted">${m.start ? fmtDM(m.start) : '?'} → ${fmtDM(m.stop)}</div></div><button class="btn ghost sm" data-act="restartMed" data-i="${m.id}">Restart</button></div>`).join('')}</div>` : ''}` : ''}`;
  }
  function medAlgNote(p, name) {
    const h = allergyHits(p, name);
    if (!h.length) return '';
    const m = h.find(x => x.level === 'match');
    return m ? `<div class="med-alert">⚠ Allergy: ${esc(algText(m.al))}</div>` : `<div class="med-caution">Caution: related to ${esc(h[0].al.agent)} allergy</div>`;
  }
  ACT.toggleStopped = () => { ui.showStopped[view.id] = !ui.showStopped[view.id]; refreshPatient(); };
  ACT.stopMed = el => { const p = getP(view.id); const m = p.meds.find(x => x.id === el.dataset.i); m.stop = today(); touch(p); save(); refreshPatient(); toast(`${esc(m.name)} stopped`); };
  ACT.restartMed = el => { const p = getP(view.id); const m = p.meds.find(x => x.id === el.dataset.i); m.stop = null; m.start = today(); touch(p); save(); refreshPatient(); };
  ACT.addMed = () => medForm(getP(view.id), null);
  ACT.editMed = el => { const p = getP(view.id); medForm(p, p.meds.find(x => x.id === el.dataset.i)); };
  function medForm(p, m) {
    const d = m || { name: '', dose: '', unit: 'mg', route: 'PO', freq: 'Daily', start: today(), note: '' };
    const opt = (list, val) => list.map(o => { const [v, f] = Array.isArray(o) ? o : [o, '']; return `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(v)}${f ? ' — ' + esc(f) : ''}</option>`; }).join('');
    openSheet({
      full: true, title: m ? 'Edit medication' : 'Add medication',
      ctx: { pid: p.id, id: m ? m.id : null },
      body: `
        <div class="field"><label>Medicine (generic name)</label><input class="inp" id="m-name" autocomplete="off" spellcheck="false" autocapitalize="words" placeholder="Start typing, e.g. furo…" value="${esc(d.name)}" data-inp="medSuggest">
          <div class="chips mt" id="m-sugg"></div></div>
        <div class="grid2">
          <div class="field"><label>Dose</label><input class="inp" id="m-dose" inputmode="decimal" autocomplete="off" value="${esc(d.dose)}"></div>
          <div class="field"><label>Unit</label><select class="inp" id="m-unit">${opt(DOSE_UNITS, d.unit)}</select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Route</label><select class="inp" id="m-route">${opt(ROUTES, d.route)}</select></div>
          <div class="field"><label>Frequency</label><select class="inp" id="m-freq">${opt(FREQS, d.freq)}</select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Started</label><input class="inp" type="date" id="m-start" max="${today()}" value="${esc(d.start || '')}"></div>
          <div class="field"><label>Note</label><input class="inp" id="m-note" autocomplete="off" placeholder="e.g. hold if SBP <100" value="${esc(d.note || '')}"></div>
        </div>
        <div class="hint">Spelled-out units and frequencies avoid look-alike errors (no "U", "IU" or "QD").</div>`,
      foot: m ? `<button class="btn danger" data-act="delMed" style="flex:none">Delete</button><button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="saveMed">Save</button>`
        : `<button class="btn sec" data-act="saveMed" data-more="1">Save + another</button><button class="btn" data-act="saveMed">Save</button>`,
      onMount: w => { if (!m) setTimeout(() => $('#m-name', w).focus(), 150); }
    });
  }
  INP.medSuggest = el => {
    const q = el.value.trim().toLowerCase();
    const box = $('#m-sugg', topSheet().el);
    if (q.length < 2) { box.innerHTML = ''; return; }
    const pool = [...new Set([...S.settings.custom.meds, ...MEDS])];
    const starts = pool.filter(x => x.toLowerCase().startsWith(q));
    const has = pool.filter(x => !x.toLowerCase().startsWith(q) && x.toLowerCase().includes(q));
    const list = [...starts, ...has].slice(0, 8);
    const p = getP(topSheet().ctx.pid);
    box.innerHTML = list.map(x => { const h = allergyHits(p, x); return `<button class="chip ${h.some(y => y.level === 'match') ? 'chip-alg' : ''}" data-act="medPick" data-v="${esc(x)}">${h.length ? '⚠ ' : ''}${esc(x)}</button>`; }).join('');
  };
  ACT.medPick = el => { const w = topSheet().el; $('#m-name', w).value = el.dataset.v; $('#m-sugg', w).innerHTML = ''; $('#m-dose', w).focus(); };
  ACT.saveMed = async el => {
    const s = topSheet(), w = s.el, p = getP(s.ctx.pid);
    const name = $('#m-name', w).value.trim().replace(/\s+/g, ' ');
    if (!name) { toast('Type the medicine name'); return; }
    const hits = allergyHits(p, name);
    if (hits.length) {
      const ok = await dialog({
        title: '⚠ Allergy alert', danger: true, ok: 'Add anyway', cancel: "Don't add",
        html: hits.map(h => h.level === 'match'
          ? `<p><b>${esc(algText(h.al))}</b><br>${esc(name)} belongs to this group.</p>`
          : `<p><b>${esc(algText(h.al))}</b><br>${esc(name)} is in a related group (${esc(h.group)}). Cross-reactivity is usually low — check the type of reaction first.</p>`).join('')
      });
      if (!ok) return;
    }
    const data = { name: name.charAt(0).toUpperCase() + name.slice(1), dose: cleanDose($('#m-dose', w).value), unit: $('#m-unit', w).value, route: $('#m-route', w).value, freq: $('#m-freq', w).value, start: $('#m-start', w).value || '', note: $('#m-note', w).value.trim() };
    if (!MEDS.some(x => x.toLowerCase() === data.name.toLowerCase()) && !S.settings.custom.meds.some(x => x.toLowerCase() === data.name.toLowerCase())) S.settings.custom.meds.push(data.name);
    if (s.ctx.id) Object.assign(p.meds.find(x => x.id === s.ctx.id), data);
    else p.meds.push(Object.assign({ id: uid(), created: Date.now(), stop: null }, data));
    touch(p); save();
    if (el.dataset.more) {
      toast(`${esc(data.name)} added`);
      ['#m-name', '#m-dose', '#m-note'].forEach(k => { $(k, w).value = ''; });
      $('#m-unit', w).value = 'mg'; $('#m-route', w).value = 'PO'; $('#m-freq', w).value = 'Daily';
      $('#m-sugg', w).innerHTML = ''; $('#m-name', w).focus();
      refreshPatient();
      return;
    }
    closeSheet(); refreshPatient(); toast('Saved');
  };
  ACT.delMed = async () => {
    const s = topSheet();
    if (!await dialog({ title: 'Delete this medication?', html: '<p>To keep a record that it was given, use <b>Stop</b> instead.</p>', ok: 'Delete', danger: true })) return;
    const p = getP(s.ctx.pid); p.meds = p.meds.filter(x => x.id !== s.ctx.id); touch(p); save(); closeSheet(); refreshPatient();
  };

  // ----- Plan tab -----
  function planTab(p) {
    const pend = p.plan.filter(x => !x.done);
    const done = p.plan.filter(x => x.done).sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''));
    const quick = [...new Set([...(PLAN[p.specialty] || []), ...PLAN.general, ...S.settings.custom.plan])].sort(alpha);
    const showDone = ui.showDone[p.id];
    const doneToday = done.filter(x => x.doneDate === today());
    const doneShown = showDone ? done : doneToday;
    return `
      <div class="row"><input class="inp grow" id="plan-new" autocomplete="off" placeholder="Add a plan item…" enterkeyhint="done"><button class="btn" data-act="addPlan" style="flex:none">Add</button></div>
      <div class="section-title">To do <span class="right muted tiny">${pend.length}</span></div>
      <div class="card">${pend.length ? pend.map(x => planItem(x)).join('') : '<div class="muted small">Nothing pending.</div>'}</div>
      ${doneShown.length ? `<div class="section-title">${showDone ? 'Done' : 'Done today'}</div><div class="card">${doneShown.map(x => planItem(x)).join('')}</div>` : ''}
      ${done.length > doneToday.length || showDone ? `<button class="btn ghost sm" data-act="toggleDone">${showDone ? 'Hide older done items' : `Show all done (${done.length})`}</button>` : ''}
      ${consultsHTML(p)}
      <div class="section-title">Quick add</div>
      <div class="chips">${quick.map(t => `<button class="chip static" data-act="quickPlan" data-v="${esc(t)}" data-abbr="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="hint mt">Unfinished items stay on the list each day until ticked.</div>
      <div class="section-title">Patient education <span class="right muted tiny">English · العربية</span></div>
      <div class="chips">${[...new Set(p.advice.map(x => x.id))].map(id => ADVICE.find(a => a.id === id)).filter(Boolean).map(a => `<button class="chip static on" data-act="openAdv" data-id="${a.id}">${esc(a.en.t)}</button>`).join('')}<button class="chip static add" data-act="toolsInfo">${p.advice.length ? 'More patient education…' : 'Choose patient education…'}</button></div>`;
  }
  // ----- Patient advice -----
  const advFor = spec => ADVICE.filter(a => a.specs.includes(spec));
  const advLang = () => S.settings.advLang === 'ar' ? 'ar' : 'en';
  function advBodyHTML(a, lang) {
    const L = a[lang], out = [];
    let list = [];
    const flush = () => { if (list.length) { out.push(`<ul>${list.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`); list = []; } };
    L.b.forEach(t => { if (t.startsWith('# ')) { flush(); out.push(`<h3>${esc(t.slice(2))}</h3>`); } else list.push(t); });
    flush();
    return `<div class="adv-body" ${lang === 'ar' ? 'dir="rtl" lang="ar"' : 'lang="en"'}><h2>${esc(L.t)}</h2>${out.join('')}</div>`;
  }
  const advText = (a, lang) => [a[lang].t, '', ...a[lang].b.map(t => t.startsWith('# ') ? '\n' + t.slice(2) : '• ' + t)].join('\n').replace(/\n{3,}/g, '\n\n');
  function openAdv(a, p) {
    openSheet({
      full: true, title: a.en.t, ctx: { adv: a.id, pid: p ? p.id : null },
      body: `${segHTML('advlang', [['en', 'English'], ['ar', 'العربية']], advLang())}<div id="adv-view" class="mt"></div>
        <div class="hint mt">General advice — adjust it to this patient's plan before giving it.</div>`,
      foot: `<button class="btn sec" data-act="copyAdv">${I.copy.replace('<svg', '<svg width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:2;vertical-align:-3px"')} Copy</button>${p ? `<button class="btn" data-act="giveAdv">${p.advice.some(x => x.id === a.id) ? 'Given again' : 'Mark as given'}</button>` : ''}`,
      onMount: w => drawAdv(w)
    });
  }
  function drawAdv(w) {
    const s = topSheet(), a = ADVICE.find(x => x.id === s.ctx.adv);
    $('#adv-view', w || s.el).innerHTML = advBodyHTML(a, advLang());
  }
  SEG_HOOK.advlang = v => { S.settings.advLang = v; save(); drawAdv(); };
  ACT.openAdv = el => {
    const a = ADVICE.find(x => x.id === el.dataset.id);
    const fromPicker = topSheet() && topSheet().ctx && topSheet().ctx.advPid;
    const pid = fromPicker ? topSheet().ctx.advPid : (view.name === 'patient' ? view.id : null);
    if (fromPicker) closeSheet();
    openAdv(a, pid ? getP(pid) : null);
  };
  ACT.copyAdv = () => { const s = topSheet(), a = ADVICE.find(x => x.id === s.ctx.adv); B.copy(advText(a, advLang())); toast('Copied — paste it into a message for the patient'); };
  ACT.giveAdv = () => {
    const s = topSheet(), a = ADVICE.find(x => x.id === s.ctx.adv), p = getP(s.ctx.pid);
    p.advice.push({ id: a.id, date: today(), lang: advLang() });
    p.plan.push({ id: uid(), text: `Patient education given: ${a.en.t}${advLang() === 'ar' ? ' (Arabic)' : ''}`, done: true, created: today(), doneDate: today() });
    touch(p); save(); closeSheet(); refreshPatient(); toast('Recorded in the plan');
  };
  // ----- Consults -----
  const CONSULT_ST = { req: 'Requested', seen: 'Seen', off: 'Signed off' };
  const consultActive = p => p.consults.filter(c => c.status !== 'off');
  function consultCard(c) {
    const recs = [...c.recs].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
    return `<div class="consult tap" data-act="editConsult" data-lp="editConsult" data-i="${c.id}">
      <div class="row"><b class="grow">${esc(c.service)}</b><span class="badge cst-${c.status}">${CONSULT_ST[c.status]}</span></div>
      <div class="tiny muted">Asked ${fmtDM(c.reqDate)}${c.seenDate ? ` · seen ${fmtDM(c.seenDate)}` : ''}${c.offDate ? ` · signed off ${fmtDM(c.offDate)}` : ''}</div>
      ${c.reason ? `<div class="small mt-xs">Q: ${esc(c.reason)}</div>` : ''}
      ${recs.length ? `<ul class="recs">${recs.slice(0, 3).map(r => `<li><span class="tiny muted">${fmtDM(r.date)}</span> ${esc(r.text)}${r.planned ? ' <span class="tiny muted">· in plan</span>' : ''}</li>`).join('')}${recs.length > 3 ? `<li class="tiny muted">+${recs.length - 3} older</li>` : ''}</ul>` : '<div class="tiny muted mt-xs">No recommendations recorded yet — tap to add.</div>'}
    </div>`;
  }
  function consultsHTML(p) {
    const act = consultActive(p), off = p.consults.filter(c => c.status === 'off'), show = ui.showOff && ui.showOff[p.id];
    return `<div class="section-title">Consults <span class="tiny muted">${act.length ? act.length + ' active' : ''}</span><button class="btn ghost sm right" data-act="addConsult">+ Consult</button></div>
      ${act.length ? `<div class="card consults">${act.map(consultCard).join('')}</div>` : '<div class="muted small" style="margin:0 2px 6px">No active consults.</div>'}
      ${off.length ? `<button class="btn ghost sm" data-act="toggleOff">${show ? 'Hide signed-off consults' : `Signed off (${off.length})`}</button>${show ? `<div class="card consults">${off.map(consultCard).join('')}</div>` : ''}` : ''}`;
  }
  ACT.toggleOff = () => { ui.showOff = ui.showOff || {}; ui.showOff[view.id] = !ui.showOff[view.id]; refreshPatient(); };
  const consultGroups = p => [
    ...(S.settings.custom.consult && S.settings.custom.consult.length ? [{ name: 'My items', items: S.settings.custom.consult.map(x => [x, '']) }] : []),
    { name: 'Medical specialties', items: SPECIALTIES.filter(x => x.key !== p.specialty).map(x => [x.key, '']) },
    ...Object.entries(CONSULT_SERVICES).map(([name, items]) => ({ name, items: items.map(x => [x, '']) }))
  ];
  ACT.addConsult = () => {
    const p = getP(view.id);
    openPicker({ title: 'Consult which service?', groups: consultGroups(p), customKey: 'consult',
      onDone: v => { const svc = Array.isArray(v) ? v[0] : v; if (!svc) return; const c = { id: uid(), created: Date.now(), service: svc, status: 'req', reqDate: today(), seenDate: '', offDate: '', reason: '', recs: [] }; p.consults.push(c); touch(p); save(); refreshPatient(); consultForm(p, c, true); } });
  };
  ACT.editConsult = el => { const p = getP(view.id), c = p.consults.find(x => x.id === el.dataset.i); if (c) consultForm(p, c, false); };
  function consultForm(p, c, isNew) {
    const recRow = r => `<div class="item"><div class="grow"><div class="tiny muted">${fmtD(r.date)}</div><div class="small">${esc(r.text)}</div></div>
      ${r.planned ? '<span class="tiny muted">in plan</span>' : `<button class="btn ghost sm" data-act="recToPlan" data-r="${r.id}">→ Plan</button>`}<button class="x" data-act="recDel" data-r="${r.id}" aria-label="Remove">×</button></div>`;
    openSheet({ full: true, title: c.service, ctx: { pid: p.id, cid: c.id },
      body: `<div class="field"><label>Status</label>${segHTML('cst', [['req', 'Requested'], ['seen', 'Seen'], ['off', 'Signed off']], c.status)}</div>
        <div class="grid2"><div class="field"><label>Requested</label><input class="inp" type="date" id="c-req" max="${today()}" value="${esc(c.reqDate || '')}"></div>
          <div class="field"><label>Seen</label><input class="inp" type="date" id="c-seen" max="${today()}" value="${esc(c.seenDate || '')}"></div></div>
        <div class="field"><label>Question / reason for consult</label><textarea class="inp" id="c-reason" rows="2" placeholder="e.g. AKI on CKD — need for dialysis?">${esc(c.reason || '')}</textarea></div>
        <div class="lbl mt">Recommendations</div>
        <div class="row" style="align-items:flex-start"><textarea class="inp grow" id="c-rec" rows="2" placeholder="Add what the ${esc(c.service)} team recommended…"></textarea><button class="btn" data-act="recAdd" style="flex:none">Add</button></div>
        <div class="card mt" id="c-recs">${[...c.recs].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0)).map(recRow).join('') || '<div class="muted small">None yet.</div>'}</div>
        <div class="hint">"→ Plan" copies a recommendation into the plan to-do list.</div>`,
      foot: `<button class="btn ghost danger-text" data-act="consultDel">Delete</button><button class="btn" data-act="consultSave">Done</button>`,
      onMount: w => { if (isNew) setTimeout(() => $('#c-reason', w).focus(), 250); } });
  }
  const curConsult = () => { const s = topSheet(), p = getP(s.ctx.pid); return { s, p, c: p.consults.find(x => x.id === s.ctx.cid) }; };
  function consultReadForm() {
    const { s, p, c } = curConsult(), w = s.el, st = segVal(w, 'cst');
    c.reqDate = $('#c-req', w).value || c.reqDate || today();
    c.seenDate = $('#c-seen', w).value || (st !== 'req' && !c.seenDate ? today() : c.seenDate || '');
    if (st === 'off' && c.status !== 'off') c.offDate = today();
    if (st !== 'off') c.offDate = '';
    c.status = st; c.reason = $('#c-reason', w).value.trim();
    return { s, p, c };
  }
  ACT.recAdd = () => {
    const { s, p, c } = consultReadForm(), t = $('#c-rec', s.el).value.trim();
    if (!t) { $('#c-rec', s.el).focus(); return; }
    c.recs.push({ id: uid(), created: Date.now(), date: today(), text: t, planned: false });
    if (c.status === 'req') { c.status = 'seen'; c.seenDate = c.seenDate || today(); }
    touch(p); save(); closeSheet(); refreshPatient(); consultForm(p, c, false); toast('Recommendation added');
  };
  ACT.recDel = el => { const { p, c } = consultReadForm(); c.recs = c.recs.filter(r => r.id !== el.dataset.r); touch(p); save(); closeSheet(); refreshPatient(); consultForm(p, c, false); };
  ACT.recToPlan = el => {
    const { p, c } = consultReadForm(), r = c.recs.find(x => x.id === el.dataset.r);
    p.plan.push({ id: uid(), text: `${c.service}: ${r.text}`, done: false, created: today() });
    r.planned = true; touch(p); save(); closeSheet(); refreshPatient(); consultForm(p, c, false); toast('Added to the plan');
  };
  ACT.consultSave = () => {
    const { s, p } = consultReadForm(), pending = $('#c-rec', s.el).value.trim();
    if (pending) { ACT.recAdd(); closeSheet(); return; }
    touch(p); save(); closeSheet(); refreshPatient();
  };
  ACT.consultDel = async () => {
    const { p, c } = curConsult();
    if (!await dialog({ title: `Delete the ${c.service} consult?`, html: '<p class="small">Use "Signed off" instead if the team has finished — that keeps the record.</p>', ok: 'Delete', danger: true })) return;
    p.consults = p.consults.filter(x => x.id !== c.id); touch(p); save(); closeSheet(); refreshPatient();
  };
  function consultLines(p, short) {
    return consultActive(p).map(c => {
      const r = [...c.recs].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0))[0];
      return `${c.service} (${c.status === 'req' ? 'requested ' + fmtDM(c.reqDate) : 'seen ' + fmtDM(c.seenDate || c.reqDate)})${r ? `: ${short && r.text.length > 90 ? r.text.slice(0, 88) + '…' : r.text}` : c.reason && !short ? ` — Q: ${c.reason}` : ''}`;
    });
  }
  function planItem(x) {
    const age = !x.done && x.created && daysBetween(x.created, today()) > 0 ? `<span class="tiny muted"> · since ${fmtDM(x.created)}</span>` : '';
    return `<div class="item"><button class="chk ${x.done ? 'on' : ''}" data-act="togglePlan" data-i="${x.id}" aria-label="Done"></button>
      <div class="grow tap ${x.done ? 'done-text' : ''}" data-act="editPlan" data-lp="editPlan" data-i="${x.id}">${esc(x.text)}${age}${x.done && x.doneDate ? `<span class="tiny muted"> · ${fmtDM(x.doneDate)}</span>` : ''}</div>
      ${x.done ? '' : `<button class="bell ${remState(x)}" data-act="remindPlan" data-i="${x.id}" aria-label="Reminder">${I.bell}${x.rem ? `<span>${esc(fmtRem(x.rem, true))}</span>` : ''}</button>`}
      <button class="x" data-act="delPlan" data-i="${x.id}" aria-label="Remove">×</button></div>`;
  }
  function addPlanText(t) {
    const p = getP(view.id);
    t = t.trim();
    if (!t) return;
    p.plan.push({ id: uid(), text: t, done: false, created: today() });
    touch(p); save(); refreshPatient();
    const tt = taskTime(t);
    if (tt) toast(`Tap the bell 🔔 beside it to be reminded at <b>${esc(fmtRem(tt))}</b>`, 3500);
  }
  ACT.addPlan = () => {
    const i = $('#plan-new'), t = i.value.trim();
    if (!t) { i.focus(); return; }
    addPlanText(t);
    setTimeout(() => { const n = $('#plan-new'); if (n) n.focus(); }, 30);
  };
  ACT.quickPlan = el => {
    const t = el.dataset.v;
    if (t.includes('__') || /: $/.test(t)) {
      const i = $('#plan-new'); i.value = t; i.focus();
      const b = t.indexOf('__'); if (b >= 0) i.setSelectionRange(b, b + 2); else i.setSelectionRange(t.length, t.length);
      window.scrollTo(0, 0);
      return;
    }
    addPlanText(t);
    toast(`Added: ${esc(t)}`, 1200);
  };
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'plan-new') { e.preventDefault(); ACT.addPlan(); } });
  ACT.togglePlan = el => {
    const p = getP(view.id), x = p.plan.find(y => y.id === el.dataset.i);
    x.done = !x.done; x.doneDate = x.done ? today() : null; touch(p); save(); refreshPatient();
  };
  ACT.delPlan = el => { const p = getP(view.id); p.plan = p.plan.filter(y => y.id !== el.dataset.i); touch(p); save(); refreshPatient(); };
  ACT.toggleDone = () => { ui.showDone[view.id] = !ui.showDone[view.id]; refreshPatient(); };
  ACT.editPlan = el => {
    const p = getP(view.id), x = p.plan.find(y => y.id === el.dataset.i);
    if (!x) return;
    const mean = explain(x.text);
    openSheet({ title: 'Edit plan item', ctx: { pid: p.id, i: x.id },
      body: `<textarea class="inp" id="pe-text" rows="3">${esc(x.text)}</textarea>${mean ? `<div class="hint">${mean}</div>` : ''}
        <div class="mt">${segHTML('pedone', [['0', 'To do'], ['1', 'Done']], x.done ? '1' : '0')}</div>`,
      foot: `<button class="btn ghost danger-text" data-act="planEditDel">Delete</button><button class="btn" data-act="planEditSave">Save</button>`,
      onMount: w => { const t = $('#pe-text', w); setTimeout(() => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }, 250); } });
  };
  ACT.planEditSave = () => {
    const s = topSheet(), p = getP(s.ctx.pid), x = p.plan.find(y => y.id === s.ctx.i), t = $('#pe-text', s.el).value.trim();
    if (!t) { toast('Write the plan item, or delete it'); return; }
    const done = segVal(s.el, 'pedone') === '1';
    x.text = t; if (done !== !!x.done) { x.done = done; x.doneDate = done ? today() : null; }
    touch(p); save(); closeSheet(); refreshPatient();
  };
  ACT.planEditDel = () => { const s = topSheet(), p = getP(s.ctx.pid); p.plan = p.plan.filter(y => y.id !== s.ctx.i); touch(p); save(); closeSheet(); refreshPatient(); toast('Plan item deleted'); };

  // ----- Reminders: a phone alert for a plan item at a set time -----
  // Each pending plan item can carry rem (a time in ms). The full list of future reminders is handed to Android after
  // every save; Android keeps its own encrypted copy so alerts still fire with the app closed or after a restart.
  // The alert shows only the bed and the task (no name), and the lock screen shows just "A task is due".
  const hm = ms => { const d = new Date(ms); let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
  const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function fmtRem(ms, short) {
    const k = dayKey(ms), t = dayKey(Date.now()), tm = dayKey(Date.now() + 864e5);
    if (k === t) return hm(ms);
    if (k === tm) return (short ? 'Tmrw ' : 'Tomorrow ') + hm(ms);
    const d = new Date(ms);
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} ${hm(ms)}`;
  }
  const remState = x => !x.rem || x.done ? '' : x.rem <= Date.now() ? 'due' : 'on';
  // "Repeat K at 6 pm", "K 18:00", "6:30pm" → the next time that clock time comes round.
  function taskTime(text) {
    let h = null, m = 0;
    const a = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i.exec(text || '');
    const b = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text || '');
    if (a && Number(a[1]) >= 1 && Number(a[1]) <= 12) { h = Number(a[1]) % 12 + (/^p/i.test(a[3]) ? 12 : 0); m = Number(a[2] || 0); }
    else if (b) { h = Number(b[1]); m = Number(b[2]); }
    if (h === null || m > 59) return null;
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now() + 60000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const remTitle = p => p.bed ? `Bed ${p.bed}${p.ward ? ' · ' + p.ward : ''}` : `${specShort(p.specialty)} patient`;
  function remList() {
    const now = Date.now(), out = [];
    if (!S) return out;
    S.patients.forEach(p => {
      if (p.status !== 'active' || p.anonymized) return;
      p.plan.forEach(x => { if (!x.done && x.rem && x.rem > now) out.push({ id: x.id, at: x.rem, title: remTitle(p), text: x.text }); });
    });
    if (S.settings.testRem && S.settings.testRem > now) out.push({ id: 'test', at: S.settings.testRem, title: 'RoundNotes test', text: 'Reminders work on this phone.' });
    return out.sort((a, b) => a.at - b.at);
  }
  let remSig = null;
  function syncReminders(force) {
    if (!S) return;
    const sig = JSON.stringify(remList());
    if (!force && sig === remSig) return;
    remSig = sig;
    B.syncReminders(sig);
  }
  // Ask Android for permission to show alerts (Android 13+ asks once). Resolves true when alerts can show.
  function ensureNotify() {
    return new Promise(res => {
      const st = B.notifyState();
      if (st === 'granted') { res(true); return; }
      if (st === 'unsupported') { res(true); return; }
      if (st === 'ask') {
        ui.noLockUntil = Date.now() + 120000;
        // The permission prompt pauses the app; keep it unlocked for a few seconds after the answer.
        window.onNotifyResult = r => { window.onNotifyResult = null; ui.noLockUntil = Date.now() + 5000; res(r === 'granted'); };
        B.askNotify();
        return;
      }
      res(false);
    });
  }
  async function notifyBlockedDialog() {
    const r = await dialog({ title: 'Phone alerts are off', ok: 'Open settings', cancel: 'OK',
      html: '<p>The reminder is saved and shows in the app, but the phone will not alert you until notifications are allowed for RoundNotes.</p><p class="small muted">Settings → Apps → RoundNotes → Notifications → Allow.</p>' });
    if (r) { ui.noLockUntil = Date.now() + 300000; B.openAppSettings(); }
  }
  async function setRem(pid, id, at) {
    const p = getP(pid), x = p && p.plan.find(y => y.id === id);
    if (!x) return;
    if (at && at <= Date.now() + 30000) { toast('Pick a time in the future'); return false; }
    x.rem = at || null;
    touch(p); save(); refreshPatient();
    if (!at) { toast('Reminder removed'); return true; }
    if (B.notifyState() === 'unsupported') { toast(`Reminder set for ${fmtRem(at)} — it shows in the app when due`, 3200); return true; }
    toast(`Reminder set for ${fmtRem(at)}`);
    const ok = await ensureNotify();
    if (!ok) notifyBlockedDialog();
    return true;
  }
  ACT.remindPlan = el => {
    const p = getP(view.id), x = p.plan.find(y => y.id === el.dataset.i);
    if (!x) return;
    const now = Date.now(), fromText = taskTime(x.text);
    const at = (h, m, plusDay) => { const d = new Date(); if (plusDay) d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d.getTime(); };
    const round5 = ms => Math.ceil(ms / 300000) * 300000;
    const quick = [];
    if (fromText) quick.push([fromText, `${fmtRem(fromText)} (from the task)`]);
    quick.push([round5(now + 3600000), 'In 1 hour'], [round5(now + 7200000), 'In 2 hours'], [round5(now + 4 * 3600000), 'In 4 hours']);
    if (at(18, 0) > now + 600000 && !(fromText && fromText === at(18, 0))) quick.push([at(18, 0), '6:00 pm today']);
    quick.push([at(8, 0, true), 'Tomorrow 8:00 am']);
    const def = x.rem && x.rem > now ? x.rem : fromText || round5(now + 3600000);
    const dd = new Date(def);
    openSheet({ title: 'Remind me', ctx: { pid: p.id, i: x.id },
      body: `<div class="bold">${esc(x.text)}</div>
        ${x.rem ? `<div class="hint">${x.rem > now ? 'Set for' : 'Was due'} <b>${esc(fmtRem(x.rem))}</b></div>` : ''}
        <div class="lbl mt">Quick choice</div>
        <div class="chips">${quick.map(([t, l]) => `<button class="chip static" data-act="remQuick" data-t="${t}">${esc(l)}</button>`).join('')}</div>
        <div class="lbl mt">Or pick a day and time</div>
        <div class="remtime"><input class="inp" type="date" id="rem-date" min="${today()}" value="${dayKey(def)}"><input class="inp" type="time" id="rem-time" value="${String(dd.getHours()).padStart(2, '0')}:${String(dd.getMinutes()).padStart(2, '0')}"></div>
        <div class="hint mt">The phone alerts you even if RoundNotes is closed. The alert shows the bed and the task, never the name — so don't put names in the task.</div>`,
      foot: `${x.rem ? '<button class="btn ghost danger-text" data-act="remClear">Remove</button>' : '<button class="btn sec" data-act="closeSheet">Cancel</button>'}<button class="btn" data-act="remSet">Set reminder</button>` });
  };
  ACT.remQuick = async el => { const s = topSheet(); if (await setRem(s.ctx.pid, s.ctx.i, Number(el.dataset.t))) closeSheet(); };
  ACT.remSet = async () => {
    const s = topSheet(), d = $('#rem-date', s.el).value, t = $('#rem-time', s.el).value;
    if (!d || !t) { toast('Choose a day and a time'); return; }
    const [y, mo, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
    const ms = new Date(y, mo - 1, da, h, mi, 0, 0).getTime();
    if (await setRem(s.ctx.pid, s.ctx.i, ms)) closeSheet();
  };
  ACT.remClear = async () => { const s = topSheet(); await setRem(s.ctx.pid, s.ctx.i, null); closeSheet(); };
  // Tapping a phone alert opens the app on that patient's Plan tab (after the PIN).
  function openLaunchReminder() {
    const id = B.launchRem();
    if (!id || !S) return;
    if (id === 'test') { toast('Test reminder received — reminders work on this phone', 3500); return; }
    const p = S.patients.find(q => q.plan.some(x => x.id === id));
    if (!p) return;
    closeAllLayers();
    ui.ptab[p.id] = 'plan';
    if (view && view.name === 'patient' && view.id === p.id) render(); else go('patient', { id: p.id });
  }
  // If the app is about to lock (it was in the background too long), wait: the unlock opens the reminder.
  // Web edition: no phone alerts, so pop up due reminders while the app is open and unlocked.
  const remShown = new Set();
  setInterval(() => {
    if (B.notifyState() !== 'unsupported' || !unlocked || !S || $('.dialog')) return;
    const now = Date.now();
    for (const p of S.patients) {
      if (p.status !== 'active') continue;
      const x = p.plan.find(y => !y.done && y.rem && y.rem <= now && now - y.rem < 6 * 3600000 && !remShown.has(y.id + ':' + y.rem));
      if (!x) continue;
      remShown.add(x.id + ':' + x.rem);
      dialog({ title: '⏰ Reminder', ok: 'Open patient', cancel: 'Later', html: `<p><b>${esc(remTitle(p))}</b> — ${esc(pName(p))}</p><p>${esc(x.text)}</p><p class="small">Due ${esc(fmtRem(x.rem))}</p>` })
        .then(r => { if (r) { closeAllLayers(); ui.ptab[p.id] = 'plan'; go('patient', { id: p.id }); } });
      break;
    }
  }, 20000);
  window.onReminderTap = () => { if (unlocked && S && (Date.now() < ui.noLockUntil || Date.now() - lastPause < lockMin() * 60000)) openLaunchReminder(); };

  // ----- Daily notes tab -----
  // Intake/output totals for one note; UOP counts as output.
  const ioTotals = v => {
    const n = k => num(v && v[k]) || 0;
    const inn = n('ino') + n('iniv'), out = n('uop') + n('outd') + n('outo');
    const any = ['ino', 'iniv', 'outd', 'outo'].some(k => v && v[k]);
    return { inn: any ? inn : 0, out: any ? out : 0, net: any ? inn - out : null };
  };
  // Running fluid balance: the sum of each day's net balance up to and including the given date.
  const cumBal = (p, upto) => { let t = 0, n = 0; p.notes.forEach(x => { const b = num(x.vitals && x.vitals.bal); if (b != null && x.date <= upto) { t += b; n++; } }); return n > 1 ? t : null; };
  const fmtL = ml => `${ml > 0 ? '+' : ml < 0 ? '−' : ''}${round(Math.abs(ml) / 1000, 1)} L`;
  const vitalsLine = (v, wtKg) => {
    if (!v) return '';
    const parts = [];
    if (v.sbp || v.dbp) parts.push(['BP', `${v.sbp || '?'}/${v.dbp || '?'}`]);
    if (v.hr) parts.push(['HR', v.hr]);
    if (v.rr) parts.push(['RR', v.rr]);
    if (v.t) parts.push(['T', v.t + '°']);
    if (v.spo2) parts.push(['SpO2', v.spo2 + '%' + (v.o2 ? ' ' + v.o2 + (v.o2flow ? ' ' + v.o2flow + ' L' : '') : '')]);
    else if (v.o2) parts.push(['O2', v.o2]);
    const io = ioTotals(v);
    if (io.inn) parts.push(['In', io.inn + ' mL']);
    if (io.out) parts.push(['Out', io.out + ' mL']);
    if (v.uop) parts.push(['UOP', v.uop + ' mL' + (wtKg && num(v.uop) != null ? ` (${round(num(v.uop) / wtKg / 24, 2)} mL/kg/h)` : '')]);
    if (v.wt) parts.push(['Wt', v.wt + ' kg']);
    if (v.bal) { const b = String(v.bal).replace(/^\+/, ''); parts.push(['Bal', (Number(b) > 0 ? '+' : '') + b + ' mL']); }
    if (v.gcs) parts.push(['GCS', v.gcs]);
    return parts;
  };
  function dailyTab(p) {
    const list = [...p.notes].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
    const hasToday = list.some(n => n.date === today());
    const calcs = [...p.calcs].sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 12);
    return `<button class="btn block" data-act="addNote">${hasToday ? "Edit today's note" : "+ Today's note"}</button>
      ${calcs.length ? `<div class="section-title">Scores & calculations <button class="btn ghost sm right" data-act="tools">+ Tools</button></div><div class="card">${calcs.map(x => `<div class="item"><div class="grow"><div class="small sel-text">${esc(x.text)}</div><div class="tiny muted">${x.date === today() ? 'Today' : fmtD(x.date)}</div></div><button class="x" data-act="delCalc" data-i="${x.id}" aria-label="Remove">×</button></div>`).join('')}</div>` : ''}
      ${list.length ? list.map(n => {
        const vl = vitalsLine(n.vitals, num(n.vitals && n.vitals.wt) || num(p.weight));
        const cb = cumBal(p, n.date); if (cb != null && n.vitals && n.vitals.bal) vl.push(['Cumulative', fmtL(cb)]);
        return `<div class="card tap mt" data-act="editNote" data-lp="editNote" data-i="${n.id}"><div class="row"><b>${n.date === today() ? 'Today' : fmtD(n.date)}</b>${n.status ? `<span class="badge status-${esc(n.status)}">${esc(n.status)}</span>` : ''}<span class="right tiny muted">D${p.admitDate ? Math.max(1, daysBetween(p.admitDate, n.date) + 1) : '?'}</span></div>
          ${vl.length ? `<div class="vitals">${vl.map(([k, v]) => `<span data-abbr="${esc(k)}">${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
          ${n.text ? `<div class="note-text">${esc(n.text)}</div>` : ''}</div>`;
      }).join('') : `<div class="empty"><div class="big">📝</div>No daily notes yet.<div class="small mt">Each new note starts from the previous one, so you only change what's new.</div></div>`}`;
  }
  ACT.addNote = () => {
    const p = getP(view.id);
    const t = p.notes.find(n => n.date === today());
    noteForm(p, t || null);
  };
  ACT.editNote = el => { const p = getP(view.id); noteForm(p, p.notes.find(n => n.id === el.dataset.i)); };
  function noteForm(p, n) {
    const prev = [...p.notes].sort((a, b) => b.date.localeCompare(a.date))[0];
    const d = n || { date: today(), status: prev ? prev.status : '', vitals: { o2: prev && prev.vitals ? prev.vitals.o2 || '' : '' }, text: prev ? prev.text : '' };
    const v = d.vitals || {};
    const last = [...p.notes].filter(x => !n || x.id !== n.id).filter(x => x.date <= d.date).sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0))[0];
    const pv = (last && last.vitals) || {};
    const vi = (id, label, val, mode = 'decimal', ph = '', extra = '') => `<div class="field"><label data-abbr="${esc(label)}">${label}</label><input class="inp" id="v-${id}" inputmode="${mode}" autocomplete="off" placeholder="${esc(pv[id] ? pv[id] : ph)}" value="${esc(val != null ? val : '')}" ${extra}></div>`;
    openSheet({
      full: true, title: n ? `Note · ${fmtD(d.date)}` : "Today's note",
      ctx: { pid: p.id, id: n ? n.id : null },
      body: `
        <div class="grid2">
          <div class="field"><label>Date</label><input class="inp" type="date" id="n-date" max="${today()}" value="${esc(d.date)}"></div>
          <div class="field"><label>O2 support</label><select class="inp" id="v-o2"><option value=""></option>${O2.map(([a, f]) => `<option value="${esc(a)}" ${v.o2 === a ? 'selected' : ''}>${esc(a)}${f ? ' — ' + esc(f) : ''}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Overall</label>${segHTML('nst', NOTE_STATUS, d.status)}</div>
        <div class="lbl mt">Vitals</div>
        <div class="grid3">
          <div class="field" style="grid-column: span 2"><label data-abbr="BP">BP (mmHg)</label><div class="row"><input class="inp" id="v-sbp" inputmode="numeric" placeholder="${esc(pv.sbp || 'SBP')}" value="${esc(v.sbp || '')}"><span class="muted">/</span><input class="inp" id="v-dbp" inputmode="numeric" placeholder="${esc(pv.dbp || 'DBP')}" value="${esc(v.dbp || '')}"></div></div>
          ${vi('hr', 'HR', v.hr, 'numeric')}
          ${vi('rr', 'RR', v.rr, 'numeric')}
          ${vi('t', 'T °C', v.t)}
          ${vi('spo2', 'SpO2 %', v.spo2, 'numeric')}
          ${vi('o2flow', 'O2 L/min', v.o2flow)}
          ${vi('wt', 'Wt kg', v.wt)}
          ${vi('gcs', 'GCS', v.gcs, 'numeric', '3–15')}
        </div>
        ${last ? `<div class="hint">Grey numbers are from ${fmtD(last.date)}.</div>` : ''}
        <div class="lbl mt">Intake / output (24 h, mL)</div>
        <div class="grid3">
          ${vi('ino', 'In: oral', v.ino, 'numeric', '', 'data-inp="ioCalc"')}
          ${vi('iniv', 'In: IV', v.iniv, 'numeric', '', 'data-inp="ioCalc"')}
          ${vi('uop', 'Out: urine', v.uop, 'numeric', '', 'data-inp="ioCalc"')}
          ${vi('outd', 'Out: drain / NG', v.outd, 'numeric', '', 'data-inp="ioCalc"')}
          ${vi('outo', 'Out: other / UF', v.outo, 'numeric', '', 'data-inp="ioCalc"')}
          ${vi('bal', 'Net balance', v.bal, 'text', '+/−', 'data-inp="balTyped"')}
        </div>
        <div class="hint" id="io-sum">${ioSumText(p, d.date, v.bal, n ? n.id : null)}</div>
        <div class="field"><div class="row wrap" style="gap:6px"><label class="lbl grow" style="margin:0">Events / exam / assessment</label>${p.mainDx || p.problems.some(x => x.active) ? '<button class="btn ghost sm" data-act="insertProblems">+ Problem list</button>' : ''}${!n && prev && prev.text ? '<button class="btn ghost sm" data-act="clearNote">Clear copied text</button>' : ''}</div>
          <textarea class="inp mt" id="n-text" style="min-height:150px" placeholder="What changed since yesterday?">${esc(d.text || '')}</textarea>
          ${!n && prev && (prev.text || prev.status) ? `<div class="hint">Copied from ${fmtD(prev.date)}: overall status, O2 and note text — edit what changed.</div>` : ''}</div>`,
      foot: `${n ? '<button class="btn danger" data-act="delNote" style="flex:none">Delete</button>' : ''}<button class="btn sec" data-act="closeSheet">Cancel</button><button class="btn" data-act="saveNote">Save</button>`
    });
  }
  ACT.clearNote = () => { const t = $('#n-text', topSheet().el); t.value = ''; t.focus(); };
  function ioSumText(p, date, bal, exceptId) {
    const b = num(String(bal || '').replace('−', '-'));
    let prior = 0, n = 0;
    p.notes.forEach(x => { if (x.id === exceptId || x.date > date) return; const v = num(x.vitals && x.vitals.bal); if (v != null && !(x.date === date && !exceptId)) { prior += v; n++; } });
    if (b == null) return n ? `Cumulative before this note: ${fmtL(prior)}` : 'Net balance fills in from intake and output; you can also type it.';
    return `Net ${b > 0 ? '+' : ''}${b} mL · cumulative ${fmtL(prior + b)}${n ? '' : ' (first recorded day)'} · insensible losses not included`;
  }
  INP.ioCalc = () => {
    const s = topSheet(), w = s.el, g = id => num($('#v-' + id, w).value) || 0;
    const any = ['ino', 'iniv', 'outd', 'outo'].some(id => $('#v-' + id, w).value.trim());
    const bal = $('#v-bal', w);
    if (any && !bal.dataset.typed) { const net = g('ino') + g('iniv') - g('uop') - g('outd') - g('outo'); bal.value = (net > 0 ? '+' : '') + net; }
    $('#io-sum', w).innerHTML = ioSumText(getP(s.ctx.pid), $('#n-date', w).value || today(), bal.value, s.ctx.id);
  };
  INP.balTyped = el => { el.dataset.typed = el.value.trim() ? '1' : ''; const s = topSheet(); $('#io-sum', s.el).innerHTML = ioSumText(getP(s.ctx.pid), $('#n-date', s.el).value || today(), el.value, s.ctx.id); };
  ACT.insertProblems = () => {
    const s = topSheet(), p = getP(s.ctx.pid), t = $('#n-text', s.el);
    const probs = [p.mainDx, ...p.problems.filter(x => x.active).map(x => x.text)].filter(Boolean);
    const block = probs.map((x, i) => `${i + 1}. ${x} — `).join('\n');
    t.value = (t.value.trim() ? t.value.replace(/\s+$/, '') + '\n\n' : '') + 'Assessment / plan:\n' + block;
    t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  };
  ACT.saveNote = () => {
    const s = topSheet(), w = s.el, p = getP(s.ctx.pid);
    const g = id => digits($('#v-' + id, w).value).trim();
    const vitals = { sbp: g('sbp'), dbp: g('dbp'), hr: g('hr'), rr: g('rr'), t: g('t'), spo2: g('spo2'), o2: $('#v-o2', w).value, o2flow: g('o2flow'), uop: g('uop'), wt: g('wt'), bal: g('bal').replace('−', '-'), gcs: g('gcs'),
      ino: g('ino'), iniv: g('iniv'), outd: g('outd'), outo: g('outo') };
    Object.keys(vitals).forEach(k => { if (!vitals[k]) delete vitals[k]; });
    const data = { date: $('#n-date', w).value || today(), status: segVal(w, 'nst'), vitals, text: $('#n-text', w).value.trim() };
    if (s.ctx.id) Object.assign(p.notes.find(x => x.id === s.ctx.id), data);
    else p.notes.push(Object.assign({ id: uid(), created: Date.now() }, data));
    if (vitals.wt && num(vitals.wt) != null) p.weight = num(vitals.wt);
    touch(p); save(); closeSheet(); refreshPatient(); toast('Note saved');
  };
  ACT.delNote = async () => {
    const s = topSheet();
    if (!await dialog({ title: 'Delete this note?', ok: 'Delete', danger: true })) return;
    const p = getP(s.ctx.pid); p.notes = p.notes.filter(x => x.id !== s.ctx.id); touch(p); save(); closeSheet(); refreshPatient();
  };

  // ===================== Presentation =====================
  function presentText(p, o) {
    const L = [];
    const d = dayOf(p);
    const who = [pName(p), [p.age !== '' && p.age != null ? p.age + ' y' : '', p.sex === 'M' ? 'male' : p.sex === 'F' ? 'female' : ''].filter(Boolean).join(' '), p.specialty, [p.ward, p.bed ? 'bed ' + p.bed : ''].filter(Boolean).join(' ')].filter(Boolean);
    L.push(who.join(' · '));
    if (o.hosp && p.hospNo) L.push(`Hosp# ${p.hospNo}`);
    L.push(p.allergyStatus === 'yes' ? `ALLERGIES: ${p.allergies.map(algText).join('; ')}` : p.allergyStatus === 'nkda' ? 'No known drug allergies.' : 'Drug allergies: not recorded.');
    if (p.admitDate) L.push(`Day ${d} of admission (admitted ${fmtD(p.admitDate)})${p.status === 'discharged' ? `, discharged ${fmtD(p.dischargeDate)}` : ''}`);
    if (p.attending) L.push(`Attending: ${p.attending}`);
    if (p.memo && p.status === 'active') L.push(`Note: ${p.memo}`);
    L.push('');
    L.push(p.comorb.length ? `Known case of: ${p.comorb.join(', ')}.` : 'No recorded comorbidities.');
    if (num(p.baseCr)) L.push(`Baseline creatinine ${bcrShow(p, 1)} (${BCR_SRC[p.baseCrSrc] || 'previous result'}).`);
    const withIcd = t => o.icd && icdOf(t) ? `${t} [${icdOf(t)}]` : t;
    if (p.mainDx) L.push(`Main problem: ${withIcd(p.mainDx)}.`);
    const act = p.problems.filter(x => x.active).map(x => x.text);
    if (act.length) L.push(`Other active problems: ${act.map(withIcd).join('; ')}.`);
    const res = p.problems.filter(x => !x.active).map(x => x.text);
    if (res.length) L.push(`Resolved: ${res.join('; ')}.`);
    const notes = [...p.notes].sort((a, b) => b.date.localeCompare(a.date));
    const n = notes[0];
    if (n) {
      L.push('');
      const vl = vitalsLine(n.vitals, num(n.vitals && n.vitals.wt) || num(p.weight));
      const cb = cumBal(p, n.date); if (cb != null && n.vitals && n.vitals.bal) vl.push(['cumulative balance', fmtL(cb)]);
      L.push(`${n.date === today() ? 'Today' : fmtD(n.date)}${n.status ? ': ' + n.status : ''}.${vl.length ? ' ' + vl.map(([k, v]) => `${k} ${v}`).join(', ') + '.' : ''}`);
      if (n.text) L.push(n.text);
    }
    const labs = labsSorted(p);
    if (labs.length) {
      const e = labs[0], c = computed(p, e);
      const order = LAB_ORDER[p.specialty] || LAB_ORDER.Nephrology;
      const parts = [];
      order.forEach(g => {
        LABS.filter(l => l.g === g && e.values[l.k] != null).forEach(l => {
          const v = e.values[l.k], cls = classify(l.k, v, p.sex);
          let s = `${l.k} ${fmtNum(v)}${l.sel ? '' : cls === 'hi' ? ' (H)' : cls === 'lo' ? ' (L)' : cls === 'crit' ? ' (!!)' : ''}`;
          if (l.k === 'Cr' && num(p.baseCr) && typeof v === 'number') s += ` (${(v / num(p.baseCr)).toFixed(1)}× baseline)`;
          if (['Cr', 'K', 'Hb', 'Na', 'Urea'].includes(l.k)) {
            const prev = labs.slice(1).find(x => typeof x.values[l.k] === 'number');
            if (prev && typeof v === 'number' && prev.values[l.k] !== v) s += ` [${fmtNum(prev.values[l.k])} on ${fmtDM(prev.date)}]`;
          }
          parts.push(s);
        });
        Object.keys(c).forEach(k => { if (CALC_GROUP[k] === g) parts.push(`${k} ${c[k]}`); });
      });
      Object.keys(e.values).filter(k => k.startsWith('x:')).forEach(k => parts.push(`${k.slice(2)} ${e.values[k]}${e.units[k] ? ' ' + e.units[k] : ''}`));
      L.push('');
      L.push(`Labs (${fmtDM(e.date)}${e.source === 'out' ? ', outside lab, converted' : ''}): ${parts.join(', ')}.`);
    }
    if (p.cultures.length) { L.push(''); L.push('Cultures:'); cultsSorted(p).slice(0, 6).forEach(c => L.push(`- ${cultLine(c)}`)); }
    const inv = [...p.imaging].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    if (inv.length) {
      L.push('');
      L.push('Investigations:');
      inv.forEach(x => L.push(`- ${x.type} (${fmtDM(x.date)}): ${x.status}${x.finding ? ' — ' + x.finding.replace(/\n+/g, '; ') : ''}`));
    }
    if (o.meds) {
      const meds = p.meds.filter(m => !m.stop);
      if (meds.length) { L.push(''); L.push('Medications:'); meds.forEach(m => L.push(`- ${medLine(m)}`)); }
    }
    if (o.consults !== false) {
      const cl = consultLines(p, false);
      if (cl.length) { L.push(''); L.push('Consults:'); cl.forEach(x => L.push(`- ${x}`)); }
    }
    if (o.plan) {
      const pl = p.plan.filter(x => !x.done);
      if (pl.length) { L.push(''); L.push('Plan:'); pl.forEach(x => L.push(`- ${x.text}`)); }
    }
    const sc = [...p.calcs].sort((a, b) => (b.created || 0) - (a.created || 0));
    const latestBy = {};
    sc.forEach(x => { if (!latestBy[x.name]) latestBy[x.name] = x; });
    const scores = Object.values(latestBy).slice(0, 6);
    if (scores.length) { L.push(''); L.push('Scores:'); scores.forEach(x => L.push(`- ${x.text}${x.date !== today() ? ` (${fmtDM(x.date)})` : ''}`)); }
    if (p.teaching && p.learning) { L.push(''); L.push('Learning points:'); L.push(p.learning); }
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  ACT.present = () => go('present', { id: view.id });
  const presentOpts = { hosp: false, meds: true, plan: true, consults: true, icd: false };
  function renderPresent() {
    const p = getP(view.id);
    if (!p) { back(); return; }
    const txt = presentText(p, presentOpts);
    $('#app').innerHTML = topbar('Case summary', pName(p), backBtn, `<button class="iconbtn" data-act="copyPresent" aria-label="Copy">${I.copy}</button>`) +
      `<div class="content">
        <div class="chips mb">
          <button class="chip ${presentOpts.meds ? 'on' : ''}" data-act="presentOpt" data-k="meds">Medications</button>
          <button class="chip ${presentOpts.plan ? 'on' : ''}" data-act="presentOpt" data-k="plan">Plan</button>
          <button class="chip ${presentOpts.consults ? 'on' : ''}" data-act="presentOpt" data-k="consults">Consults</button>
          <button class="chip ${presentOpts.hosp ? 'on' : ''}" data-act="presentOpt" data-k="hosp">Hospital number</button>
          <button class="chip ${presentOpts.icd ? 'on' : ''}" data-act="presentOpt" data-k="icd">ICD-10 codes</button>
        </div>
        <div class="present" id="present-text">${esc(txt)}</div>
        <div class="row mt" style="gap:8px"><button class="btn sec grow" data-act="copyPresent">Copy text</button><button class="btn grow" data-act="presentPdf">Save PDF</button></div>
        <button class="btn ghost sm mt" data-act="logPresented">+ Log this case as presented</button>
        <div class="hint mt">Read this out on rounds. If you paste it anywhere, keep it inside the hospital team — don't post it on social media or group chats.</div>
      </div>`;
  }
  ACT.presentOpt = el => { presentOpts[el.dataset.k] = !presentOpts[el.dataset.k]; renderPresent(); };
  ACT.copyPresent = () => { const p = getP(view.id); B.copy(presentText(p, presentOpts)); toast('Copied'); };
  ACT.presentPdf = () => {
    const p = getP(view.id), lines = presentText(p, presentOpts).split('\n');
    const out = [{ t: `Case summary · ${pName(p)} · ${fmtD(today())}`, s: 'title', k: 't' }];
    let g = 0;
    lines.forEach((t, i) => {
      if (!t.trim()) { g++; return; }
      const head = /^(Consults|Plan|Medications|Investigations|Scores|Learning points|Assessment \/ plan):$/.test(t);
      out.push({ t, s: head ? 'head' : /^ALLERGIES/.test(t) ? 'alert' : 'body', k: 'g' + g });
    });
    savePdfLines(out, `CaseSummary_${(p.firstName || 'patient').replace(/[^\w\u0600-\u06FF-]+/g, '')}_${today()}.pdf`);
  };


  // ===================== Calculators =====================
  function prefillCtx(p) {
    if (!p) return null;
    const L = labsSorted(p);
    const notes = [...p.notes].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
    const all = [...p.comorb, p.mainDx || '', ...p.problems.filter(x => x.active).map(x => x.text)];
    return {
      age: num(p.age), sex: p.sex || '', weight: num(p.weight), height: num(p.height), bmi: bmiOf(p),
      baseCr: num(p.baseCr) ? { v: num(p.baseCr), src: 'record, ' + (BCR_SRC[p.baseCrSrc] || 'previous result') } : null,
      labMax: k => { const from = p.admitDate ? new Date(new Date(p.admitDate).getTime() - 7 * 864e5).toISOString().slice(0, 10) : ''; const xs = L.filter(x => typeof x.values[k] === 'number' && x.date >= from); if (!xs.length) return null; const e = xs.reduce((a, b) => b.values[k] > a.values[k] ? b : a); return { v: e.values[k], src: 'peak ' + fmtDM(e.date) }; },
      lab: k => { const e = L.find(x => x.values[k] != null && x.values[k] !== '' && typeof x.values[k] === 'number'); return e ? { v: e.values[k], src: 'labs ' + fmtDM(e.date) } : null; },
      vit: k => { const n = notes.find(x => x.vitals && num(x.vitals[k]) != null); return n ? { v: num(n.vitals[k]), src: 'note ' + fmtDM(n.date) } : null; },
      has: (...tests) => all.some(t => tests.some(r => r instanceof RegExp ? r.test(t) : t === r)),
      medHas: re => p.meds.some(m => !m.stop && re.test(m.name))
    };
  }
  const calcsFor = spec => CALCS.filter(c => c.specs.includes(spec));
  function calcListHTML(list) {
    return list.map(c => `<div class="popt" data-act="openCalc" data-id="${c.id}"><div class="grow"><div class="a">${esc(c.name)}</div><div class="f">${esc(c.cat)}</div></div><span class="muted">›</span></div>`).join('');
  }
  // Tools: two tabs — Calculators and Patient education (advice sheets in English and Arabic)
  // Tools opens on Calculators; "Choose patient education…" in the Plan tab opens it on Patient education.
  ACT.tools = (el, start) => {
    const p = getP(view.id), tab = start === 'info' ? 'info' : 'calc';
    ui.toolsTab = tab;
    openSheet({
      title: `Tools · ${p.specialty}`, ctx: { pid: p.id, advPid: p.id }, cls: 'picker',
      body: `${segHTML('toolstab', [['calc', 'Calculators'], ['info', 'Patient education']], tab)}<div id="tools-list" class="mt"></div>`,
      onMount: w => drawTools(w)
    });
  };
  ACT.toolsInfo = () => ACT.tools(null, 'info');
  ACT.advLibrary = ACT.toolsInfo;
  SEG_HOOK.toolstab = v => { ui.toolsTab = v; drawTools(); };
  function drawTools(w) {
    const s = topSheet(), p = getP(s.ctx.pid), el = $('#tools-list', w || s.el);
    if (ui.toolsTab === 'info') {
      const mine = advFor(p.specialty), others = ADVICE.filter(a => !mine.includes(a)).sort((x, y) => alpha(x.en.t, y.en.t));
      const row = a => `<div class="popt" data-act="openAdv" data-id="${a.id}"><div class="grow"><div class="a">${esc(a.en.t)}${p.advice.some(x => x.id === a.id) ? ' <span class="given">✓ given</span>' : ''}</div><div class="f" dir="rtl">${esc(a.ar.t)}</div></div><span class="muted">›</span></div>`;
      el.innerHTML = `<div class="hint mb">Instructions for the patient in English and Arabic — copy into a message or mark as given.</div>
        <div class="pgroup">${esc(p.specialty)}</div>${mine.map(row).join('') || '<div class="empty">No topics for this specialty yet.</div>'}
        <div class="pgroup">Other topics</div>${others.map(row).join('')}`;
    } else {
      const mine = calcsFor(p.specialty), others = CALCS.filter(c => !mine.includes(c));
      el.innerHTML = `<div class="hint mb">Values are filled in from this patient's latest labs, notes and record — check them.</div>
        <div class="pgroup">${esc(p.specialty)}</div>${calcListHTML(mine)}
        <div class="pgroup">Other calculators</div>${calcListHTML(others)}`;
    }
  }
  ACT.openCalc = el => {
    const c = CALCS.find(x => x.id === el.dataset.id);
    const fromTools = topSheet() && topSheet().ctx && topSheet().ctx.pid;
    const p = fromTools ? getP(topSheet().ctx.pid) : null;
    if (fromTools) closeSheet();
    openCalc(c, p);
  };
  function fieldHTML(f, P) {
    let val = f.def != null ? f.def : '', src = '';
    if (P && f.pre) {
      let r = null;
      try { r = f.pre(P); } catch (e) { r = null; }
      if (r && typeof r === 'object' && 'v' in r) { val = r.v; src = r.src; }
      else if (r !== null && r !== undefined && r !== '' && !(typeof r === 'number' && isNaN(r))) { val = r; src = 'record'; }
    }
    const hint = src ? `<div class="cf-src">from ${esc(src)}</div>` : '';
    if (f.t === 'seg') return `<div class="field"><label>${esc(f.l)}</label>${segHTML('cf_' + f.k, f.opts, String(val || ''))}${hint}</div>`;
    if (f.t === 'chk') return `<label class="cchk"><input type="checkbox" data-cf="${f.k}" data-chg="calc" ${val === true ? 'checked' : ''}><span class="grow">${esc(f.l)}${src && val === true ? ` <span class="cf-src">(${esc(src)})</span>` : ''}</span>${f.pts != null ? `<span class="pts">${f.pts < 0 ? "−" + -f.pts : "+" + f.pts}</span>` : ''}</label>`;
    if (f.t === 'sel') return `<div class="field"><label>${esc(f.l)}</label><select class="inp" data-cf="${f.k}" data-chg="calc"><option value="">Choose…</option>${f.opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</div>`;
    return `<div class="field cf-num"><label>${esc(f.l)}</label><div class="row"><input class="inp" data-cf="${f.k}" data-inp="calc" inputmode="decimal" autocomplete="off" value="${esc(val === '' || val == null ? '' : val)}"><span class="cf-u">${esc(f.u || '')}</span></div>${hint}</div>`;
  }
  function openCalc(c, p) {
    const P = prefillCtx(p);
    const nums = c.fields.filter(f => !f.t || f.t === 'num');
    const others = c.fields.filter(f => f.t && f.t !== 'num');
    openSheet({
      full: true, title: c.name, ctx: { calc: c, pid: p ? p.id : null, res: null },
      body: `${p ? `<div class="hint mb">For <b>${esc(pName(p))}</b> — fields marked “from …” were filled in from the record.</div>` : ''}
        <div class="calc-form">
          <div class="cf-grid">${nums.map(f => fieldHTML(f, P)).join('')}</div>
          ${others.map(f => fieldHTML(f, P)).join('')}
        </div>
        <div class="calc-res" id="calc-res"></div>
        <div class="hint mt">Source: ${esc(c.ref || '')}. A decision aid — check against the clinical picture.</div>`,
      foot: `<div class="calc-foot-main" id="calc-foot"></div><button class="btn sec" data-act="copyCalc">Copy</button>${p ? '<button class="btn" data-act="saveCalc">Save to patient</button>' : ''}`,
      onMount: w => { const f = $('.sfoot', w); if (f) f.classList.add('wrap'); recalc(); }
    });
  }
  function readCalc(sh) {
    const v = {};
    sh.ctx.calc.fields.forEach(f => {
      if (f.t === 'seg') { v[f.k] = segVal(sh.el, 'cf_' + f.k); return; }
      const el = $(`[data-cf="${f.k}"]`, sh.el);
      if (!el) return;
      if (f.t === 'chk') v[f.k] = el.checked;
      else if (f.t === 'sel') v[f.k] = el.value;
      else v[f.k] = num(el.value);
    });
    return v;
  }
  function recalc() {
    const sh = topSheet();
    if (!sh || !sh.ctx || !sh.ctx.calc) return;
    let r = null;
    try { r = sh.ctx.calc.calc(readCalc(sh)); } catch (e) { r = null; }
    sh.ctx.res = r;
    const box = $('#calc-res', sh.el);
    box.className = 'calc-res' + (r ? ' lvl-' + (r.level || 'ok') : '');
    box.innerHTML = r ? `<div class="calc-main">${esc(r.main)}</div>${(r.lines || []).map(l => `<div class="calc-line">${esc(l)}</div>`).join('')}` : '<div class="muted">Fill in the fields to see the result.</div>';
    const ft = $('#calc-foot', sh.el);
    if (ft) { ft.className = 'calc-foot-main' + (r ? ' lvl-' + (r.level || 'ok') : ''); ft.textContent = r ? r.main : 'Fill in the fields'; }
  }
  INP.calc = () => recalc();
  CHG.calc = () => recalc();
  ACT.copyCalc = () => { const r = topSheet().ctx.res; if (!r || !r.text) { toast('Nothing to copy yet'); return; } B.copy(r.text); toast('Copied'); };
  ACT.saveCalc = () => {
    const sh = topSheet(), r = sh.ctx.res, p = getP(sh.ctx.pid);
    if (!r || !r.text) { toast('Fill in the fields first'); return; }
    p.calcs.push({ id: uid(), created: Date.now(), date: today(), name: sh.ctx.calc.name, text: r.text });
    touch(p); save(); closeSheet(); refreshPatient(); toast('Saved to the Daily tab');
  };
  ACT.delCalc = el => { const p = getP(view.id); p.calcs = p.calcs.filter(x => x.id !== el.dataset.i); touch(p); save(); refreshPatient(); };
  ACT.goCalcs = () => go('calcs');
  let calcQ = '';
  function renderCalcs() {
    $('#app').innerHTML = topbar('Calculators', `${CALCS.length} tools`, backBtn, '') +
      `<div class="content"><div class="searchbox">${I.search}<input class="inp" id="cq" placeholder="Search calculators" autocomplete="off" data-inp="calcq" value="${esc(calcQ)}"></div>
      <div class="hint mt">Open a patient and tap <b>Tools</b> to have values filled in from the record.</div><div id="calc-list" class="mt"></div></div>`;
    drawCalcList();
  }
  INP.calcq = el => { calcQ = el.value; drawCalcList(); };
  function drawCalcList() {
    const q = fold(calcQ.trim());
    const list = CALCS.filter(c => !q || fold(`${c.name} ${c.cat} ${c.specs.join(' ')}`).includes(q));
    $('#calc-list').innerHTML = CALC_CATS.map(cat => {
      const l = list.filter(c => c.cat === cat);
      return l.length ? `<div class="pgroup">${esc(cat)}</div><div class="card" style="padding:4px 4px">${calcListHTML(l)}</div>` : '';
    }).join('') || '<div class="empty">No match.</div>';
  }

  // ===================== Round sheet: the whole active list on one page =====================
  const roundOpts = { hosp: true, labs: true, vitals: true, consults: true, tasks: true, meds: false };
  function roundKeyLabs(p, e) {
    const c = computed(p, e), out = [];
    const keyFirst = ['Cr', 'eGFR', 'K', 'Na', 'Hb', 'WBC', 'Plt', 'HCO3', 'Glu', 'INR', 'CRP'];
    const order = LAB_ORDER[p.specialty] || LAB_ORDER.Nephrology;
    const all = [];
    order.forEach(g => LABS.filter(l => l.g === g && e.values[l.k] != null).forEach(l => all.push([l.k, e.values[l.k]])));
    Object.keys(c).forEach(k => { if (c[k] != null) all.push([k, c[k]]); });
    const seen = new Set();
    const push = ([k, v]) => { if (seen.has(k)) return; seen.add(k); const cls = classify(k, v, p.sex); out.push({ k, v, cls, txt: `${k} ${fmtNum(v)}${cls === 'hi' ? '↑' : cls === 'lo' ? '↓' : cls === 'crit' ? '!!' : ''}${k === 'Cr' && num(p.baseCr) && typeof v === 'number' ? ` (${(v / num(p.baseCr)).toFixed(1)}×)` : ''}` }); };
    keyFirst.forEach(k => { const x = all.find(a => a[0] === k); if (x) push(x); });
    all.filter(([k, v]) => classify(k, v, p.sex)).forEach(push);
    return out.slice(0, 12);
  }
  function roundList() {
    let list = S.patients.filter(p => p.status === 'active' && !p.anonymized);
    if (ui.spec !== 'All') list = list.filter(p => p.specialty === ui.spec);
    if (ui.ward && ui.ward !== 'All') list = list.filter(p => (p.ward || '').trim() === ui.ward);
    if (ui.att && ui.att !== 'All') list = list.filter(p => (p.attending || '').trim() === ui.att);
    return list.sort((a, b) => natCmp(a.ward, b.ward) || natCmp(a.bed, b.bed) || natCmp(a.firstName, b.firstName));
  }
  function roundEntry(p) {
    const o = roundOpts, d = dayOf(p), r = {};
    r.head = [pName(p), [p.age !== '' && p.age != null ? p.age + ' y' : '', p.sex].filter(Boolean).join(' '), [p.ward, p.bed ? 'bed ' + p.bed : ''].filter(Boolean).join(' '), p.admitDate ? 'Day ' + d : '', ui.spec === 'All' ? specShort(p.specialty) : '', p.attending && (!ui.att || ui.att === 'All') ? p.attending : ''].filter(Boolean).join(' · ');
    r.hosp = o.hosp && p.hospNo ? p.hospNo : '';
    r.alg = p.allergyStatus === 'yes' ? 'ALLERGY: ' + p.allergies.map(algText).join('; ') : p.allergyStatus === 'nkda' ? 'NKDA' : 'Allergies not recorded';
    r.dx = [p.mainDx, ...p.problems.filter(x => x.active).map(x => x.text)].filter(Boolean).join('; ');
    const e = labsSorted(p)[0];
    r.labs = o.labs && e ? { date: fmtDM(e.date), items: roundKeyLabs(p, e) } : null;
    r.cults = o.labs ? cultsRecent(p).map(c => cultLine(c, true)) : [];
    const n = [...p.notes].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (o.vitals && n) {
      const vl = vitalsLine(n.vitals, num(n.vitals && n.vitals.wt) || num(p.weight)).filter(([k]) => ['BP', 'HR', 'T', 'SpO2', 'O2', 'UOP', 'Bal', 'GCS'].includes(k));
      const cb = cumBal(p, n.date);
      r.status = `${n.date === today() ? 'Today' : fmtDM(n.date)}${n.status ? ' ' + n.status : ''}${vl.length ? ': ' + vl.map(([k, v]) => `${k} ${v}`).join(', ') : ''}${cb != null && n.vitals && n.vitals.bal ? `, cum ${fmtL(cb)}` : ''}`;
    }
    r.consults = o.consults ? consultLines(p, true) : [];
    r.meds = o.meds ? p.meds.filter(m => !m.stop).map(m => medLine(m)) : [];
    r.tasks = o.tasks ? p.plan.filter(x => !x.done).map(x => x.text) : [];
    r.flags = patientFlags(p);
    r.memo = p.memo || '';
    return r;
  }
  function roundText() {
    const list = roundList(), L = [`Round sheet · ${fmtD(today())} · ${list.length} patient${list.length === 1 ? '' : 's'}${ui.spec !== 'All' ? ' · ' + ui.spec : ''}${ui.att && ui.att !== 'All' ? ' · ' + ui.att : ''}`];
    list.forEach((p, i) => {
      const r = roundEntry(p);
      L.push('', `${i + 1}. ${r.head}${r.hosp ? ' · Hosp# ' + r.hosp : ''}`);
      L.push(`   ${r.alg}`);
      if (r.dx) L.push(`   Dx: ${r.dx}`);
      if (r.memo) L.push(`   Note: ${r.memo}`);
      if (r.flags.length) L.push(`   ⚠ ${r.flags.join(', ')}`);
      if (r.status) L.push(`   ${r.status}`);
      if (r.labs) L.push(`   Labs ${r.labs.date}: ${r.labs.items.map(x => x.txt).join(', ')}`);
      r.cults.forEach(c => L.push(`   Culture: ${c}`));
      r.consults.forEach(c => L.push(`   Consult: ${c}`));
      r.meds.forEach(m => L.push(`   Rx: ${m}`));
      r.tasks.forEach(t => L.push(`   [ ] ${t}`));
    });
    return L.join('\n');
  }
  // Styled lines for the in-app PDF: one keep-together group per patient.
  function roundPdfLines() {
    const list = roundList(), out = [{ t: `Round sheet · ${fmtD(today())}${ui.spec !== 'All' ? ' · ' + ui.spec : ''}${ui.att && ui.att !== 'All' ? ' · ' + ui.att : ''} · ${list.length} patient${list.length === 1 ? '' : 's'}`, s: 'title', k: 'title' }];
    list.forEach((p, i) => {
      const r = roundEntry(p), k = 'p' + i;
      out.push({ t: `${i + 1}. ${r.head}${r.hosp ? '   ·   Hosp# ' + r.hosp : ''}`, s: 'head', k });
      out.push({ t: r.alg, s: p.allergyStatus === 'yes' ? 'alert' : 'muted', k });
      if (r.dx) out.push({ t: `Dx: ${r.dx}`, s: 'body', k });
      if (r.memo) out.push({ t: `Note: ${r.memo}`, s: 'body', k });
      if (r.flags.length) out.push({ t: `⚠ ${r.flags.join(', ')}`, s: 'alert', k });
      if (r.status) out.push({ t: r.status, s: 'body', k });
      if (r.labs) out.push({ t: `Labs ${r.labs.date}: ${r.labs.items.map(x => x.txt).join(', ')}`, s: 'body', k });
      r.cults.forEach(c => out.push({ t: `Culture: ${c}`, s: 'body', k }));
      r.consults.forEach(c => out.push({ t: `Consult: ${c}`, s: 'body', k }));
      if (r.meds.length) out.push({ t: `Rx: ${r.meds.join(' · ')}`, s: 'body', k });
      r.tasks.forEach(t => out.push({ t, s: 'task', k }));
    });
    return out;
  }
  function renderRound() {
    const list = roundList(), active = S.patients.filter(p => p.status === 'active' && !p.anonymized);
    const wards = [...new Set(active.map(p => (p.ward || '').trim()).filter(Boolean))].sort(natCmp);
    const ratts = [...new Set(active.map(p => (p.attending || '').trim()).filter(Boolean))].sort(alpha);
    const chip = (k, l) => `<button class="chip ${roundOpts[k] ? 'on' : ''}" data-act="roundOpt" data-k="${k}">${l}</button>`;
    $('#app').innerHTML = topbar('Round sheet', `${list.length} patient${list.length === 1 ? '' : 's'} · ${fmtD(today())}`, backBtn, `<button class="iconbtn" data-act="roundCopy" aria-label="Copy">${I.copy}</button>`) +
      `<div class="content">
        <div class="noprint">
          <div class="filters">${[['All', 'All'], ...SPECIALTIES.filter(s => active.some(p => p.specialty === s.key)).map(s => [s.key, s.short])].map(([k, l]) => `<button class="chip ${ui.spec === k ? 'on' : ''}" data-act="roundSpec" data-k="${esc(k)}">${l}</button>`).join('')}</div>
          ${wards.length > 1 ? `<div class="filters mt-s">${['All', ...wards].map(w => `<button class="chip ${(ui.ward || 'All') === w ? 'on' : ''}" data-act="roundWard" data-k="${esc(w)}">${w === 'All' ? 'All wards' : esc(w)}</button>`).join('')}</div>` : ''}
          ${ratts.length > 1 ? `<div class="filters mt-s">${['All', ...ratts].map(a => `<button class="chip ${(ui.att || 'All') === a ? 'on' : ''}" data-act="roundAtt" data-k="${esc(a)}">${a === 'All' ? 'All attendings' : esc(a)}</button>`).join('')}</div>` : ''}
          <div class="chips mt-s">${chip('hosp', 'Hospital no.')}${chip('labs', 'Labs')}${chip('vitals', 'Status & vitals')}${chip('consults', 'Consults')}${chip('tasks', 'To do')}${chip('meds', 'Medicines')}</div>
          <div class="row mt-s" style="gap:8px"><button class="btn sec grow" data-act="roundCopy">Copy text</button><button class="btn grow" data-act="roundPdf">Save PDF</button></div>
          <div class="hint">To print, open the saved PDF and use its Print option.</div>
          <div class="hint">Keep this inside the treating team — don't post it in group chats or social media.</div>
        </div>
        <div class="round-sheet">
          <div class="rs-title">Round sheet · ${fmtD(today())}${ui.spec !== 'All' ? ' · ' + esc(ui.spec) : ''}${ui.att && ui.att !== 'All' ? ' · ' + esc(ui.att) : ''} · ${list.length} patient${list.length === 1 ? '' : 's'}</div>
          ${list.length ? list.map((p, i) => { const r = roundEntry(p); return `<div class="rs-pt" data-act="openP" data-id="${p.id}">
            <div class="rs-head"><b>${i + 1}. ${esc(r.head)}</b>${r.hosp ? `<span class="rs-hosp">Hosp# ${esc(r.hosp)}</span>` : ''}</div>
            <div class="rs-alg ${p.allergyStatus === 'yes' ? 'yes' : ''}">${esc(r.alg)}</div>
            ${r.dx ? `<div><span class="rs-k">Dx</span> ${esc(r.dx)}</div>` : ''}
            ${r.memo ? `<div class="rs-memo">📌 ${esc(r.memo)}</div>` : ''}
            ${r.flags.length ? `<div class="rs-flag">⚠ ${esc(r.flags.join(', '))}</div>` : ''}
            ${r.status ? `<div><span class="rs-k">Status</span> ${esc(r.status)}</div>` : ''}
            ${r.labs ? `<div><span class="rs-k">Labs ${esc(r.labs.date)}</span> ${r.labs.items.map(x => `<span class="${x.cls ? 'rs-' + x.cls : ''}">${esc(x.txt)}</span>`).join(', ')}</div>` : ''}
            ${r.cults.map(c => `<div><span class="rs-k">Culture</span> ${esc(c)}</div>`).join('')}
            ${r.consults.map(c => `<div><span class="rs-k">Consult</span> ${esc(c)}</div>`).join('')}
            ${r.meds.length ? `<div><span class="rs-k">Rx</span> ${esc(r.meds.join(' · '))}</div>` : ''}
            ${r.tasks.length ? `<ul class="rs-tasks">${r.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          </div>`; }).join('') : '<div class="empty">No active patients in this list.</div>'}
        </div>
      </div>`;
  }
  ACT.roundOpt = el => { roundOpts[el.dataset.k] = !roundOpts[el.dataset.k]; renderRound(); };
  ACT.roundSpec = el => { ui.spec = el.dataset.k; renderRound(); };
  ACT.roundWard = el => { ui.ward = el.dataset.k; renderRound(); };
  ACT.roundAtt = el => { ui.att = el.dataset.k; renderRound(); };
  ACT.roundCopy = () => { B.copy(roundText()); toast('Round sheet copied'); };
  ACT.roundPrint = () => {
    ui.noLockUntil = Date.now() + 300000;
    if (!B.print(`Round sheet ${today()}`)) { ui.noLockUntil = 0; printProblem('error', 'This version cannot reach the print service'); }
  };
  ACT.roundPdf = () => savePdfLines(roundPdfLines(), `RoundSheet_${today()}.pdf`);
  function savePdfLines(lines, name) {
    ui.noLockUntil = Date.now() + 300000;
    if (!B.savePdf(lines, name)) { ui.noLockUntil = 0; toast('Could not create the PDF on this phone'); }
  }
  function printProblem(st, msg) {
    if (st === 'nospooler') dialog({ title: 'Printing is turned off on this phone', cancel: null, ok: 'OK',
      html: '<p>Android\'s <b>Print Spooler</b> app is disabled. To use Print, open <b>Settings → Apps</b>, show system apps, find <b>Print Spooler</b> and enable it.</p><p class="small">You can use <b>Save PDF</b> instead — it does not need the print service.</p>' });
    else dialog({ title: 'The print screen did not open', cancel: null, ok: 'OK', html: `<p class="small">${esc(msg || 'Unknown error')}</p><p>Use <b>Save PDF</b> instead — it creates the file inside the app.</p>` });
  }
  window.onPrintDone = (st, msg) => { if (st !== 'ok') { ui.noLockUntil = 0; printProblem(st, msg); } };
  window.onPdfDone = (st, msg) => {
    ui.noLockUntil = 0;
    if (st === 'ok') toast('PDF saved');
    else if (st === 'error') dialog({ title: 'Could not save the PDF', cancel: null, ok: 'OK', html: `<p class="small">${esc(msg || '')}</p>` });
  };

  // ===================== Patient advice library =====================
  let advQ = '', advSpec = 'All';
  function renderAdviceLib() {
    $('#app').innerHTML = topbar('Patient education', `${ADVICE.length} topics · English and Arabic`, backBtn, '') +
      `<div class="content"><div class="searchbox">${I.search}<input class="inp" placeholder="Search patient education" autocomplete="off" data-inp="advq" value="${esc(advQ)}"></div>
      <div class="filters mt">${[['All', 'All'], ...SPECIALTIES.map(s => [s.key, s.short])].map(([k, l]) => `<button class="chip ${advSpec === k ? 'on' : ''}" data-act="advSpec" data-k="${esc(k)}">${l}</button>`).join('')}</div>
      <div id="adv-list" class="mt"></div></div>`;
    drawAdvList();
  }
  INP.advq = el => { advQ = el.value; drawAdvList(); };
  ACT.advSpec = el => { advSpec = el.dataset.k; renderAdviceLib(); };
  function drawAdvList() {
    const q = fold(advQ.trim());
    const list = ADVICE.filter(a => (advSpec === 'All' || a.specs.includes(advSpec)) && (!q || fold(`${a.en.t} ${a.ar.t} ${a.en.b.join(' ')} ${a.ar.b.join(' ')}`).includes(q)))
      .sort((x, y) => alpha(x.en.t, y.en.t));
    $('#adv-list').innerHTML = list.length ? `<div class="card" style="padding:4px 4px">${list.map(a => `<div class="popt" data-act="openAdv" data-id="${a.id}"><div class="grow"><div class="a">${esc(a.en.t)}</div><div class="f" dir="rtl">${esc(a.ar.t)}</div></div><span class="muted">›</span></div>`).join('')}</div>` : '<div class="empty">No match.</div>';
  }

  // ===================== Search =====================
  function searchFields(p) {
    const f = [];
    const add = (label, t, expand) => { if (!t) return; f.push({ label, t: String(t), x: expand ? explain(String(t)).replace(/<[^>]+>/g, ' ') : '' }); };
    add('Name', pName(p)); add('Hosp#', p.hospNo); add('Ward', [p.ward, p.bed].filter(Boolean).join(' '));
    add('Main diagnosis', p.mainDx, true);
    add('Note', p.memo);
    add('Attending', p.attending);
    p.problems.forEach(x => add('Problem', x.text, true));
    p.comorb.forEach(x => add('Comorbidity', x, true));
    p.meds.forEach(m => add(m.stop ? 'Medication (stopped)' : 'Medication', medLine(m)));
    p.imaging.forEach(x => add('Investigation', `${x.type} ${x.status} ${x.finding || ''}`, true));
    (p.cultures || []).forEach(c => add('Culture', cultLine(c), true));
    p.plan.forEach(x => add('Plan', x.text, true));
    p.notes.forEach(n => add('Note ' + fmtDM(n.date), n.text));
    add('Learning points', p.learning);
    p.allergies.forEach(a => add('Allergy', algText(a)));
    if (p.allergyStatus === 'nkda') add('Allergy', 'NKDA — no known drug allergies');
    [p.mainDx, ...p.problems.map(x => x.text)].forEach(t => { if (icdOf(t)) add('ICD-10', `${icdOf(t)} ${t}`); });
    p.labs.forEach(e => { if (e.note) add('Lab note', e.note); });
    return f;
  }
  const searchState = { q: '', status: 'all' };
  function renderSearch() {
    $('#app').innerHTML = topbar('Search', '', backBtn, '') +
      `<div class="content">
        <div class="searchbox">${I.search}<input class="inp" id="sq" placeholder="Name, hosp#, diagnosis, drug, finding…" autocomplete="off" spellcheck="false" value="${esc(searchState.q)}" data-inp="search"></div>
        <div class="filters">${[['all', 'All'], ['active', 'On round'], ['discharged', 'Discharged'], ['teaching', 'Teaching']].map(([k, l]) => `<button class="chip ${searchState.status === k ? 'on' : ''}" data-act="searchFilter" data-k="${k}">${l}</button>`).join('')}</div>
        <div id="sres" class="mt"></div>
      </div>`;
    drawSearch();
    setTimeout(() => { const i = $('#sq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 80);
  }
  INP.search = el => { searchState.q = el.value; drawSearch(); };
  ACT.searchFilter = el => { searchState.status = el.dataset.k; renderSearch(); };
  function drawSearch() {
    const box = $('#sres');
    const words = fold(searchState.q).split(/\s+/).filter(Boolean);
    let list = S.patients;
    if (searchState.status === 'active') list = list.filter(p => p.status === 'active');
    else if (searchState.status === 'discharged') list = list.filter(p => p.status === 'discharged');
    else if (searchState.status === 'teaching') list = list.filter(p => p.teaching);
    if (!words.length) { box.innerHTML = `<div class="empty small">Search across all patients, including discharged ones.<br>Abbreviations and full terms both work (e.g. “HyperK” or “hyperkalemia”).</div>`; return; }
    const res = [];
    list.forEach(p => {
      const f = searchFields(p);
      const all = f.map(x => fold(x.t + ' ' + x.x)).join(' | ');
      if (!words.every(w => all.includes(w))) return;
      const hits = f.filter(x => words.some(w => fold(x.t + ' ' + x.x).includes(w))).slice(0, 3);
      res.push({ p, hits });
    });
    res.sort((a, b) => (a.p.status === 'active' ? 0 : 1) - (b.p.status === 'active' ? 0 : 1) || (b.p.updated || 0) - (a.p.updated || 0));
    const hl = t => { let s = esc(t); words.forEach(w => { const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[&<>"']/g, '') + ')', 'ig'); if (w.length > 1) s = s.replace(re, '<mark>$1</mark>'); }); return s; };
    box.innerHTML = res.length ? `<div class="tiny muted mb">${res.length} patient${res.length > 1 ? 's' : ''}</div>` + res.map(({ p, hits }) => `${cardHTML(p)}
      <div class="small" style="margin:-6px 6px 12px">${hits.map(h => `<div><span class="muted">${esc(h.label)}:</span> ${hl(h.t.length > 90 ? h.t.slice(0, 90) + '…' : h.t)}</div>`).join('')}</div>`).join('')
      : '<div class="empty">No matches.</div>';
  }

  // ===================== Converter =====================
  const convState = { i: 0, a: '', b: '' };
  function renderConverter() {
    const c = CONVERTERS[convState.i];
    $('#app').innerHTML = topbar('Unit converter', 'Outside (SI) ↔ our units', backBtn, '') +
      `<div class="content">
        <div class="field"><label>Test</label><select class="inp" data-chg="convSel">${CONVERTERS.map((x, i) => `<option value="${i}" ${i === convState.i ? 'selected' : ''}>${esc(x.n)}</option>`).join('')}</select></div>
        <div class="conv-box">
          <div class="conv-row"><input class="inp" id="cv-a" inputmode="decimal" autocomplete="off" data-inp="convA" value="${esc(convState.a)}" style="font-size:22px;font-weight:600"><span class="u">${esc(c.a)}</span></div>
          <div class="center muted" style="margin:-4px 0 6px">⇅</div>
          <div class="conv-row" style="margin:0"><input class="inp" id="cv-b" inputmode="decimal" autocomplete="off" data-inp="convB" value="${esc(convState.b)}" style="font-size:22px;font-weight:600"><span class="u">${esc(c.b)}</span></div>
        </div>
        <div class="hint mt">Type in either box. When you add results from an outside report, choose <b>Outside</b> on the lab screen and the app converts them for you.</div>
        <div class="section-title">Creatinine quick table</div>
        <div class="card"><div class="kv">${[44, 62, 88, 106, 133, 177, 221, 265, 354, 442, 530, 707].map(u => `<span class="k">${u} µmol/L</span><span><b>${round(u / 88.4, 2)}</b> mg/dL</span>`).join('')}</div></div>
      </div>`;
  }
  CHG.convSel = el => { convState.i = Number(el.value); convState.a = ''; convState.b = ''; renderConverter(); };
  INP.convA = el => { const c = CONVERTERS[convState.i], v = num(el.value); convState.a = el.value; convState.b = v == null ? '' : String(round(c.f(v), c.dpB)); $('#cv-b').value = convState.b; };
  INP.convB = el => { const c = CONVERTERS[convState.i], v = num(el.value); convState.b = el.value; convState.a = v == null ? '' : String(round(c.r(v), c.dpA)); $('#cv-a').value = convState.a; };

  // ===================== Glossary view =====================
  let glQ = '';
  function renderGlossary() {
    $('#app').innerHTML = topbar('Abbreviations', `${GL.size} terms`, backBtn, '') +
      `<div class="content"><div class="searchbox">${I.search}<input class="inp" id="glq" placeholder="Search abbreviations or meanings" autocomplete="off" data-inp="gl" value="${esc(glQ)}"></div><div id="gl-list" class="card mt"></div></div>`;
    drawGlossary();
  }
  INP.gl = el => { glQ = el.value; drawGlossary(); };
  function drawGlossary() {
    const q = fold(glQ.trim());
    const items = [...GL.entries()].map(([a, s]) => [a, [...s].join(' / ')]).filter(([a, f]) => !q || fold(a).includes(q) || fold(f).includes(q))
      .sort((x, y) => {
        const rank = a => !q ? 0 : a.toLowerCase() === q ? 0 : a.toLowerCase().startsWith(q) ? 1 : 2;
        return rank(x[0]) - rank(y[0]) || x[0].localeCompare(y[0], undefined, { sensitivity: 'base' });
      });
    $('#gl-list').innerHTML = items.length ? items.map(([a, f]) => `<div class="gl-item"><b>${esc(a)}</b><span>${esc(f)}</span></div>`).join('') : '<div class="muted">No match.</div>';
  }

  // ===================== Settings =====================
  function renderSettings() {
    const st = S.settings;
    const custom = CUSTOM_KEYS.map(k => [k, st.custom[k]]).filter(([, l]) => l.length);
    const names = { dx: 'Diagnoses', comorb: 'Comorbidities', inv: 'Investigations', meds: 'Medicines', plan: 'Plan items', allergy: 'Allergies', consult: 'Consult services', proc: 'Procedures', org: 'Organisms' };
    $('#app').innerHTML = topbar('Settings', '', backBtn, '') +
      `<div class="content">
        <div class="section-title">Security</div>
        <div class="card">
          <div class="field"><label>Lock the app after leaving it for</label>${segHTML('lockmin', [['0', 'At once'], ['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min']], String(lockMin()))}</div>
          ${B.bioAvail() ? `<label class="switch"><input type="checkbox" data-chg="bio" ${localStorage.getItem('rn_bio') !== '0' ? 'checked' : ''}><span>Unlock with fingerprint</span></label>` : ''}
          <button class="btn sec block" data-act="changePin">Change PIN</button>
          <div class="hint">${B.native ? 'Screenshots and screen recording are blocked inside the app.' : 'Screenshots cannot be blocked on this device — never share screenshots of patient data.'}</div>
        </div>
        <div class="section-title">Reminders</div>
        <div class="card" id="rem-card">${remCardHTML()}</div>
        <div class="section-title">Logbook</div>
        <div class="card">
          <label class="switch"><input type="checkbox" data-chg="autolog" ${st.autoLog ? 'checked' : ''}><span>Add each new patient to my logbook</span></label>
          <div class="hint">Only the date, specialty, diagnosis, age and sex are logged — never the name or hospital number.</div>
        </div>
        <div class="section-title">Discharged patients</div>
        <div class="card">
          <div class="field"><label>Delete discharged records after</label>${segHTML('ret', [['7', '7 d'], ['30', '30 d'], ['90', '90 d'], ['180', '180 d']], String(st.retention))}</div>
          <div class="hint">Teaching cases are kept, but their first name, initials, hospital number, ward and bed are removed. Check free-text notes yourself for anything identifying.</div>
        </div>
        <div class="section-title">Backup</div>
        <div class="card">
          <div class="small muted mb">${st.lastBackup ? 'Last backup: ' + fmtD(st.lastBackup) : 'No backup yet.'} Backups are password-protected files you save yourself — use them when you change phones.</div>
          <div class="btnrow"><button class="btn" data-act="backupNow">Back up now</button><button class="btn sec" data-act="restoreBackup">Restore</button></div>
        </div>
        <div class="section-title">Display</div>
        <div class="card">
          <div class="field"><label>Theme</label>${segHTML('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], themeSetting())}</div>
          <div class="field" style="margin:0"><label>Default specialty for new patients</label>${segHTML('defspec', SPECIALTIES.map(s => [s.key, s.short]), st.defSpec, 'wrap specs')}</div>
        </div>
        ${custom.length ? `<div class="section-title">Items you added to the lists</div><div class="card">${custom.map(([k, l]) => `<div class="lbl mt">${names[k]}</div><div class="chips">${l.map((x, i) => `<button class="chip static" data-act="delCustom" data-k="${k}" data-i="${i}">${esc(x)} <span class="muted">×</span></button>`).join('')}</div>`).join('')}<div class="hint">Tap an item to remove it from the list. Patient records are not changed.</div></div>` : ''}
        <div class="section-title">About</div>
        <div class="card small">
          <div><b>RoundNotes</b> ${esc(B.version())}</div>
          <div class="muted mt">For students and residents on clinical rounds. Data stays on this phone, encrypted, and is never sent anywhere. Record first name, initials and hospital number only.</div>
          <div class="muted mt">Reference ranges are typical adult values; your laboratory's ranges may differ. Check doses and results against the hospital system before acting on them.</div>
          <div class="muted mt">Barcode scanning uses ZXing (Apache License 2.0).</div>
        </div>
        <button class="btn danger block mt2" data-act="wipeAll">Delete all data</button>
      </div>`;
  }
  function remCardHTML() {
    const st = B.notifyState(), up = remList().filter(r => r.id !== 'test');
    if (st === 'unsupported') return `<div><b>Reminders on this device</b><div class="small mt-s">iPhone and iPad web apps cannot alert you when RoundNotes is closed. Reminders show here instead: a red bell and ⏰ badge when due, and a pop-up while the app is open.</div></div>
      <div class="small muted mt">${up.length ? `${up.length} reminder${up.length > 1 ? 's' : ''} set. Next: ${esc(fmtRem(up[0].at))} · ${esc(up[0].title)} · ${esc(up[0].text)}` : 'No reminders set. Tap the bell 🔔 beside a plan item to set one.'}</div>`;
    const stTxt = st === 'granted' ? '<span class="ok-text">✓ Allowed</span>' : st === 'ask' ? 'Not allowed yet' : '<span class="danger-text">Blocked</span>';
    return `<div class="row" style="justify-content:space-between"><div><b>Phone alerts</b><div class="small">${stTxt}</div></div>
        ${st === 'granted' ? '' : `<button class="btn sm" data-act="${st === 'ask' ? 'remAllow' : 'remOpenSettings'}">${st === 'ask' ? 'Allow' : 'Open settings'}</button>`}</div>
      <div class="small muted mt">${up.length ? `${up.length} reminder${up.length > 1 ? 's' : ''} set. Next: ${esc(fmtRem(up[0].at))} · ${esc(up[0].title)} · ${esc(up[0].text)}` : 'No reminders set. Tap the bell 🔔 beside a plan item to set one.'}</div>
      <button class="btn sec block mt" data-act="remTest">Send a test reminder in 1 minute</button>
      <div class="hint">Samsung and some other phones delay alerts to save battery. If the test arrives late: Settings → Apps → RoundNotes → Battery → <b>Unrestricted</b>.</div>
      <button class="btn ghost sm" data-act="remOpenSettings">Open RoundNotes app settings</button>`;
  }
  const redrawRemCard = () => { const c = $('#rem-card'); if (c) c.innerHTML = remCardHTML(); };
  ACT.remAllow = async () => { const ok = await ensureNotify(); redrawRemCard(); if (!ok) notifyBlockedDialog(); };
  ACT.remOpenSettings = () => { ui.noLockUntil = Date.now() + 300000; B.openAppSettings(); };
  ACT.remTest = async () => {
    const ok = await ensureNotify();
    if (!ok) { redrawRemCard(); notifyBlockedDialog(); return; }
    S.settings.testRem = Date.now() + 60000; save(true); redrawRemCard();
    toast('Test reminder in 1 minute — you can close the app or lock the phone', 4000);
  };
  CHG.autolog = el => { S.settings.autoLog = el.checked; save(); toast(el.checked ? 'New patients will be added to your logbook' : 'Saved'); };
  SEG_HOOK.lockmin = v => { localStorage.setItem('rn_lock', v); toast('Saved'); };
  SEG_HOOK.ret = v => { S.settings.retention = Number(v); save(); toast(`Discharged records will be deleted after ${v} days`); };
  SEG_HOOK.theme = v => { localStorage.setItem('rn_theme', v); applyTheme(); };
  SEG_HOOK.defspec = v => { S.settings.defSpec = v; save(); toast('Saved'); };
  CHG.bio = el => { localStorage.setItem('rn_bio', el.checked ? '1' : '0'); };
  ACT.delCustom = el => { const l = S.settings.custom[el.dataset.k]; l.splice(Number(el.dataset.i), 1); save(); renderSettings(); };
  ACT.changePin = async () => {
    const r = await dialog({
      title: 'Change PIN', ok: 'Change',
      html: `<div class="field"><label class="lbl">Current PIN</label><input class="inp" id="cp-old" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
        <div class="field"><label class="lbl">New PIN (4–6 digits)</label><input class="inp" id="cp-new" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
        <div class="field"><label class="lbl">New PIN again</label><input class="inp" id="cp-new2" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div><div class="hint err" id="cp-err"></div>`,
      onMount: (w, d) => {
        d.validate = w2 => {
          const o = digits($('#cp-old', w2).value), n1 = digits($('#cp-new', w2).value), n2 = digits($('#cp-new2', w2).value), e = $('#cp-err', w2);
          if (!/^\d{4,6}$/.test(o)) { e.textContent = 'Enter your current PIN.'; return false; }
          if (!/^\d{4,6}$/.test(n1)) { e.textContent = 'New PIN must be 4 to 6 digits.'; return false; }
          if (n1 !== n2) { e.textContent = 'The new PINs do not match.'; return false; }
          return true;
        };
        d.collect = w2 => ({ o: digits($('#cp-old', w2).value), n: digits($('#cp-new', w2).value) });
      }
    });
    if (!r) return;
    if (!await Promise.resolve(B.checkPin(r.o))) { toast('Current PIN is wrong — PIN not changed'); return; }
    if (await Promise.resolve(B.setPin(r.n))) { localStorage.setItem('rn_pinlen', String(r.n.length)); toast('PIN changed'); } else toast('Could not change the PIN');
  };
  ACT.wipeAll = async () => {
    const r = await dialog({
      title: 'Delete all data?', danger: true, ok: 'Delete everything',
      html: `<p>All patients on this phone will be erased. This cannot be undone.</p><input class="inp" id="wipe-c" placeholder="Type DELETE to confirm" autocomplete="off">`,
      onMount: (w, d) => { d.validate = w2 => ($('#wipe-c', w2).value.trim().toUpperCase() === 'DELETE') || ($('#wipe-c', w2).classList.add('err'), false); }
    });
    if (!r) return;
    S = newState(); save(true); hist.length = 0; view = { name: 'home' }; render(); toast('All data deleted');
  };

  // ----- Backup / restore -----
  async function askPassword(title, confirmTwice) {
    return dialog({
      title, ok: 'Continue',
      html: `<p class="small">${confirmTwice ? 'Choose a password for this backup file. You will need it to restore — it cannot be recovered.' : 'Enter the password used when the backup was made.'}</p>
        <div class="field"><input class="inp" id="bk-pw" type="password" autocomplete="off" placeholder="Password (at least 6 characters)"></div>
        ${confirmTwice ? '<div class="field"><input class="inp" id="bk-pw2" type="password" autocomplete="off" placeholder="Password again"></div>' : ''}<div class="hint err" id="bk-err"></div>`,
      onMount: (w, d) => {
        d.validate = w2 => {
          const a = $('#bk-pw', w2).value, e = $('#bk-err', w2);
          if (a.length < 6) { e.textContent = 'At least 6 characters.'; return false; }
          if (confirmTwice && a !== $('#bk-pw2', w2).value) { e.textContent = 'The passwords do not match.'; return false; }
          return true;
        };
        d.collect = w2 => $('#bk-pw', w2).value;
        setTimeout(() => $('#bk-pw', w).focus(), 100);
      }
    });
  }
  async function backupNow() {
    const pw = await askPassword('Back up', true);
    if (!pw) return;
    ui.noLockUntil = Date.now() + 180000;
    const stamp = today();
    B.exportBackup(JSON.stringify(S), pw, `RoundNotes-backup-${stamp}.rnbak`);
  }
  ACT.backupNow = () => backupNow();
  window.onExportDone = (status, msg) => {
    ui.noLockUntil = 0;
    if (status === 'ok') { if (S) { S.settings.lastBackup = today(); save(); } toast('Backup saved'); if (view.name === 'settings') renderSettings(); }
    else if (status === 'cancel') toast('Backup cancelled');
    else toast('Backup failed: ' + esc(msg || 'unknown error'), 3500);
  };
  ACT.restoreBackup = async () => {
    const pw = await askPassword('Restore backup', false);
    if (!pw) return;
    ui.noLockUntil = Date.now() + 180000;
    B.importBackup(pw);
  };
  window.onImportDone = async (status, json) => {
    ui.noLockUntil = 0;
    if (status === 'cancel') return;
    if (status === 'notbackup') { toast('That file is not a RoundNotes backup', 3000); return; }
    if (status === 'badpassword') { toast('Wrong password, or the file is damaged', 3000); return; }
    let data;
    try { data = normalize(JSON.parse(json)); } catch (e) { toast('The backup could not be read', 3000); return; }
    const n = data.patients.length;
    if (!S || !S.patients.length) {
      S = data; save(true); hist.length = 0; view = { name: 'home' }; render(); toast(`Restored ${n} patient${n === 1 ? '' : 's'}`); return;
    }
    const r = await dialog({
      title: 'Restore backup', ok: 'Replace', cancel: 'Merge',
      html: `<p>The backup has <b>${n}</b> patient${n === 1 ? '' : 's'}. This phone has <b>${S.patients.length}</b>.</p><p class="small"><b>Replace</b>: use the backup only. <b>Merge</b>: add patients from the backup that are not on this phone.</p>`
    });
    if (r === true) { S = data; }
    else {
      const ids = new Set(S.patients.map(p => p.id));
      const add = data.patients.filter(p => !ids.has(p.id));
      S.patients.push(...add);
      CUSTOM_KEYS.forEach(k => { ((data.settings.custom || {})[k] || []).forEach(x => { if (!S.settings.custom[k].includes(x)) S.settings.custom[k].push(x); }); });
      const lids = new Set(S.logbook.map(e => e.id));
      S.logbook.push(...data.logbook.filter(e => !lids.has(e.id)));
    }
    save(true); hist.length = 0; view = { name: 'home' }; render(); toast('Backup restored');
  };


  // ===================== Logbook =====================
  // A de-identified record of what the student did: patients seen, procedures, cases presented, teaching.
  // Never stores the name or hospital number; entries stay after the patient is discharged or deleted.
  const LOG_TYPES = [['patient', 'Patient seen'], ['proc', 'Procedure'], ['present', 'Case presented'], ['teach', 'Teaching']];
  const LOG_ROLES = {
    patient: [['clerk', 'Clerked (history & exam)'], ['follow', 'Followed on rounds']],
    proc: [['obs', 'Observed'], ['assist', 'Assisted'], ['sup', 'Did it, supervised'], ['ind', 'Did it alone']],
    present: [['round', 'On rounds'], ['meeting', 'Case meeting']],
    teach: [['attend', 'Attended'], ['gave', 'Gave it']]
  };
  const logTypeName = t => (LOG_TYPES.find(x => x[0] === t) || [t, t])[1];
  const logRoleName = (t, r) => ((LOG_ROLES[t] || []).find(x => x[0] === r) || ['', ''])[1];
  PROCEDURES.forEach(([a, f]) => addGl(a, f));
  function logForm(e, p, type) {
    const d = e || { type: type || 'patient', date: today(), title: p ? p.mainDx || '' : '', spec: p ? p.specialty : (ui.spec !== 'All' ? ui.spec : S.settings.defSpec), age: p ? p.age : '', sex: p ? p.sex : '', role: '', sup: p && p.attending ? p.attending.slice(0, 20) : '', note: '', pid: p ? p.id : '' };
    openSheet({ full: true, title: e ? 'Edit logbook entry' : 'Add to logbook', ctx: { id: e ? e.id : null, type: d.type, title: d.title || '', pid: d.pid || '', age: d.age, sex: d.sex },
      body: `${p ? `<div class="hint mb">From <b>${esc(pName(p))}</b> — only the diagnosis, specialty, age and sex are logged, never the name or hospital number.</div>` : ''}
        <div class="field"><label>What</label>${segHTML('logtype', LOG_TYPES, d.type, 'wrap')}</div>
        <div class="field"><label>Date</label><input class="inp" type="date" id="lg-date" max="${today()}" value="${esc(d.date)}"></div>
        <div class="field" id="lg-title-wrap"></div>
        <div class="field"><label>Specialty</label>${segHTML('logspec', SPECIALTIES.map(s => [s.key, s.short]), d.spec || S.settings.defSpec, 'wrap specs')}</div>
        <div class="field" id="lg-role-wrap"></div>
        <div class="field"><label>Supervisor <span class="muted tiny">· optional, initials</span></label><input class="inp" id="lg-sup" maxlength="20" autocomplete="off" placeholder="e.g. Dr K.A." value="${esc(d.sup || '')}"></div>
        <div class="field"><label>Note <span class="muted tiny">· optional — no patient names</span></label><textarea class="inp" id="lg-note" rows="2">${esc(d.note || '')}</textarea></div>`,
      foot: `${e ? '<button class="btn ghost danger-text" data-act="logDel">Delete</button>' : '<button class="btn sec" data-act="closeSheet">Cancel</button>'}<button class="btn" data-act="logSave">Save</button>`,
      onMount: w => drawLogType(w, d.type, d.role) });
  }
  function drawLogType(w, type, role) {
    const s = topSheet(), t = s.ctx.title;
    const tw = $('#lg-title-wrap', w);
    if (type === 'teach') tw.innerHTML = `<label>Topic</label><input class="inp" id="lg-topic" maxlength="100" autocomplete="off" placeholder="e.g. Bedside teaching: hyperkalemia" value="${esc(t)}">`;
    else tw.innerHTML = `<label>${type === 'proc' ? 'Procedure' : 'Diagnosis'}</label><button class="pickbtn" data-act="logPick" id="lg-title">${t ? esc(t) : '<span class="ph">Choose from list…</span>'}</button>`;
    const roles = LOG_ROLES[type];
    $('#lg-role-wrap', w).innerHTML = `<label>${type === 'proc' ? 'My part' : 'How'}</label>${segHTML('logrole', roles, roles.some(r => r[0] === role) ? role : roles[0][0], 'wrap')}`;
  }
  SEG_HOOK.logtype = (v, seg) => {
    const s = topSheet(), w = seg.closest('.sheet'), dx = t => t === 'patient' || t === 'present';
    // A diagnosis carries over between "Patient seen" and "Case presented", but not to a procedure or a topic.
    if (!(dx(v) && dx(s.ctx.type))) s.ctx.title = '';
    s.ctx.type = v;
    drawLogType(w, v, '');
  };
  ACT.logPick = () => {
    const s = topSheet(), type = segVal(s.el, 'logtype');
    s.ctx.type = type;
    const set = v => { s.ctx.title = v[0] || ''; $('#lg-title', s.el).innerHTML = s.ctx.title ? esc(s.ctx.title) : '<span class="ph">Choose from list…</span>'; };
    if (type === 'proc') {
      const custom = S.settings.custom.proc || [];
      const groups = [...(custom.length ? [{ name: 'My items', items: custom.map(x => [x, '']) }] : []), { name: 'Procedures', items: sortItems(PROCEDURES) }];
      openPicker({ title: 'Procedure', groups, selected: s.ctx.title ? [s.ctx.title] : [], customKey: 'proc', onDone: set });
    } else {
      const spec = segVal(s.el, 'logspec') || S.settings.defSpec;
      openPicker({ title: `Diagnosis · ${specShort(spec)}`, groups: dxGroups(spec), selected: s.ctx.title ? [s.ctx.title] : [], customKey: 'dx', onDone: set });
    }
  };
  ACT.logSave = () => {
    const s = topSheet(), w = s.el, type = segVal(w, 'logtype');
    const title = type === 'teach' ? ($('#lg-topic', w).value || '').trim() : s.ctx.title;
    if (!title) { toast(type === 'proc' ? 'Choose the procedure' : type === 'teach' ? 'Write the topic' : 'Choose the diagnosis'); return; }
    const data = { type, date: $('#lg-date', w).value || today(), title, icd: type === 'teach' || type === 'proc' ? '' : icdOf(title), spec: segVal(w, 'logspec') || '',
      role: segVal(w, 'logrole') || '', sup: $('#lg-sup', w).value.trim(), note: $('#lg-note', w).value.trim() };
    if (type === 'patient' || type === 'present') { data.age = s.ctx.age != null ? s.ctx.age : ''; data.sex = s.ctx.sex || ''; } else { data.age = ''; data.sex = ''; }
    if (s.ctx.id) Object.assign(S.logbook.find(x => x.id === s.ctx.id), data);
    else S.logbook.push(Object.assign({ id: uid(), created: Date.now(), pid: s.ctx.pid || '' }, data));
    save(); closeSheet(); toast('Saved to your logbook');
    if (view.name === 'logbook') render(); else if (view.name === 'patient') refreshPatient();
  };
  ACT.logDel = async () => {
    const s = topSheet();
    if (!await dialog({ title: 'Delete this logbook entry?', ok: 'Delete', danger: true })) return;
    S.logbook = S.logbook.filter(x => x.id !== s.ctx.id); save(); closeSheet(); render();
  };
  ACT.logEdit = el => { const e = S.logbook.find(x => x.id === el.dataset.i); if (e) logForm(e, null); };
  ACT.logAdd = () => logForm(null, null);
  ACT.logPresented = () => { const p = getP(view.id); if (p) logForm(null, p, 'present'); };
  ACT.goLog = () => go('logbook');
  const logUi = { type: 'all', period: 'all' };
  function logFiltered() {
    const from = logUi.period === 'all' ? '' : new Date(Date.now() - Number(logUi.period) * 864e5).toISOString().slice(0, 10);
    return S.logbook.filter(e => e.date >= from).sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  }
  function logSummary(list) {
    const n = t => list.filter(e => e.type === t).length;
    const specs = {};
    list.filter(e => e.type === 'patient').forEach(e => { specs[e.spec] = (specs[e.spec] || 0) + 1; });
    const procs = {};
    list.filter(e => e.type === 'proc').forEach(e => { const r = procs[e.title] = procs[e.title] || { obs: 0, assist: 0, sup: 0, ind: 0 }; r[e.role] = (r[e.role] || 0) + 1; });
    const procLine = (name, r) => `${name}: ${[r.ind ? `${r.ind} alone` : '', r.sup ? `${r.sup} supervised` : '', r.assist ? `${r.assist} assisted` : '', r.obs ? `${r.obs} observed` : ''].filter(Boolean).join(', ')}`;
    return { counts: [['Patients', n('patient')], ['Procedures', n('proc')], ['Presented', n('present')], ['Teaching', n('teach')]],
      specs: Object.entries(specs).sort((a, b) => b[1] - a[1]), procs: Object.entries(procs).sort((a, b) => alpha(a[0], b[0])).map(([k, r]) => procLine(k, r)) };
  }
  const logLine = e => [logTypeName(e.type), e.title + (e.icd ? ` [${e.icd}]` : ''), logRoleName(e.type, e.role), [e.age !== '' && e.age != null ? e.age : '', e.sex || ''].join(''), specShort(e.spec), e.sup ? 'Supervisor ' + e.sup : ''].filter(Boolean).join(' · ');
  function renderLogbook() {
    const all = logFiltered(), list = logUi.type === 'all' ? all : all.filter(e => e.type === logUi.type), sum = logSummary(all);
    $('#app').innerHTML = topbar('Logbook', `${S.logbook.length} entr${S.logbook.length === 1 ? 'y' : 'ies'}`, backBtn, `<button class="iconbtn" data-act="logCopy" aria-label="Copy">${I.copy}</button>`) +
      `<div class="content">
        ${segHTML('logperiod', [['all', 'All time'], ['30', 'Last 30 days'], ['7', 'Last 7 days']], logUi.period)}
        <div class="log-sum mt">${sum.counts.map(([l, c]) => `<div><b>${c}</b><small>${l}</small></div>`).join('')}</div>
        ${sum.specs.length ? `<div class="section-title">Patients by specialty</div><div class="chips">${sum.specs.map(([k, c]) => `<span class="chip static on">${esc(specShort(k))} ${c}</span>`).join('')}</div>` : ''}
        ${sum.procs.length ? `<div class="section-title">Procedures</div><div class="card small">${sum.procs.map(t => `<div>${esc(t)}</div>`).join('')}</div>` : ''}
        <button class="btn block mt" data-act="logAdd">+ Add entry</button>
        <div class="chips mt">${[['all', 'All'], ...LOG_TYPES].map(([k, l]) => `<button class="chip ${logUi.type === k ? 'on' : ''}" data-act="logType" data-k="${k}">${esc(k === 'patient' ? 'Patients' : k === 'proc' ? 'Procedures' : k === 'present' ? 'Presented' : l)}</button>`).join('')}</div>
        <div class="card mt">${list.length ? list.map(e => `<div class="item log-item tap" data-act="logEdit" data-lp="logEdit" data-i="${e.id}">
            <div class="tiny muted" style="min-width:38px">${fmtDM(e.date)}</div>
            <div class="grow"><div class="lt">${esc(logTypeName(e.type))}</div><div>${esc(e.title)}${e.icd ? ` <span class="tiny muted">${esc(e.icd)}</span>` : ''}</div>
              <div class="small"><span class="role">${esc(logRoleName(e.type, e.role))}</span>${[[e.age !== '' && e.age != null ? e.age : '', e.sex || ''].join(''), specShort(e.spec), e.sup ? 'Sup. ' + e.sup : ''].filter(Boolean).map(t => ' · ' + esc(t)).join('')}</div>
              ${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ''}</div></div>`).join('')
            : `<div class="empty small">${S.logbook.length ? 'Nothing here for this filter.' : 'Log the patients you clerk, procedures you observe or do, cases you present and teaching you attend.<br><br>From a patient: open the patient → ⋮ (top right) → <b>Add to my logbook</b>.<br>No names or hospital numbers are stored.'}</div>`}</div>
        ${S.logbook.length ? `<div class="btnrow mt"><button class="btn sec" data-act="logCopy">Copy text</button><button class="btn sec" data-act="logPdf">Save PDF</button></div>
        <div class="hint">For your portfolio or supervisor. Contains no patient names or hospital numbers.</div>` : ''}
      </div>`;
  }
  SEG_HOOK.logperiod = v => { logUi.period = v; render(); };
  ACT.logType = el => { logUi.type = el.dataset.k; render(); };
  const logPeriodName = () => logUi.period === 'all' ? 'all entries' : `last ${logUi.period} days`;
  function logText() {
    const all = logFiltered(), sum = logSummary(all);
    const L = [`RoundNotes logbook · ${logPeriodName()} · printed ${fmtD(today())}`, sum.counts.map(([l, c]) => `${l} ${c}`).join(' · ')];
    if (sum.specs.length) L.push(`Patients by specialty: ${sum.specs.map(([k, c]) => `${specShort(k)} ${c}`).join(', ')}`);
    if (sum.procs.length) L.push('', 'Procedures:', ...sum.procs.map(t => '• ' + t));
    L.push('', 'Entries:');
    all.forEach(e => L.push(`${fmtD(e.date)} — ${logLine(e)}${e.note ? ` — ${e.note}` : ''}`));
    return L.join('\n');
  }
  ACT.logCopy = () => { if (!S.logbook.length) { toast('The logbook is empty'); return; } B.copy(logText()); toast('Logbook copied'); };
  ACT.logPdf = () => {
    const all = logFiltered(), sum = logSummary(all);
    const out = [{ t: `Logbook · ${logPeriodName()}`, s: 'title', k: 't' }, { t: `Printed ${fmtD(today())} · ${sum.counts.map(([l, c]) => `${l} ${c}`).join(' · ')}`, s: 'muted', k: 't' }];
    if (sum.specs.length) out.push({ t: 'Patients by specialty', s: 'head', k: 's' }, { t: sum.specs.map(([k, c]) => `${specShort(k)} ${c}`).join(' · '), s: 'body', k: 's' });
    if (sum.procs.length) { out.push({ t: 'Procedures', s: 'head', k: 'p' }); sum.procs.forEach(t => out.push({ t, s: 'body', k: 'p' })); }
    out.push({ t: 'Entries', s: 'head', k: 'e0' });
    all.forEach((e, i) => out.push({ t: `${fmtD(e.date)} — ${logLine(e)}${e.note ? ` — ${e.note}` : ''}`, s: 'body', k: 'e' + i }));
    savePdfLines(out, `Logbook_${today()}.pdf`);
  };
  // Auto-log new patients when the Settings switch is on.
  function autoLogPatient(p) {
    if (!S.settings.autoLog || !p.mainDx) return;
    S.logbook.push({ id: uid(), created: Date.now(), pid: p.id, type: 'patient', date: p.admitDate || today(), title: p.mainDx, icd: icdOf(p.mainDx), spec: p.specialty, role: 'clerk', sup: '', note: '', age: p.age, sex: p.sex });
  }

  // ===================== Barcode scanner =====================
  let scanner = null;
  async function openScanner(onResult) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Camera not available on this phone'); return; }
    ui.noLockUntil = Date.now() + 120000;
    const wrap = document.createElement('div');
    wrap.className = 'scanner';
    wrap.innerHTML = `<video playsinline muted></video><div class="frame"></div><div class="tip">Point at the barcode on the wristband or file sticker</div><div class="bar"><button class="btn sec" data-act="closeScanner">Cancel</button></div>`;
    document.body.appendChild(wrap);
    scanner = { el: wrap, stream: null, stop: false };
    const me = scanner;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (me.stop) { stream.getTracks().forEach(t => t.stop()); return; }
      me.stream = stream;
      const video = $('video', wrap);
      video.srcObject = stream;
      await video.play();
      const done = v => { if (me.stop) return; closeScanner(); onResult(String(v).trim()); };
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats && formats.length) {
            const det = new window.BarcodeDetector({ formats });
            const tick = async () => {
              if (me.stop) return;
              try { const codes = await det.detect(video); if (codes.length && codes[0].rawValue) { done(codes[0].rawValue); return; } } catch (e) { }
              setTimeout(tick, 150);
            };
            tick();
            return;
          }
        } catch (e) { }
      }
      await loadZXing();
      const Z = window.ZXing;
      const reader = new Z.MultiFormatReader();
      const hints = new Map();
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, ['CODE_128', 'CODE_39', 'CODE_93', 'EAN_13', 'EAN_8', 'ITF', 'CODABAR', 'QR_CODE', 'DATA_MATRIX', 'PDF_417'].map(f => Z.BarcodeFormat[f]).filter(x => x != null));
      reader.setHints(hints);
      const canvas = document.createElement('canvas');
      const cx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (me.stop) return;
        if (video.videoWidth) {
          const scale = Math.min(1, 960 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
          cx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const r = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas))));
            if (r && r.getText()) { done(r.getText()); return; }
          } catch (e) { }
        }
        setTimeout(tick, 180);
      };
      tick();
    } catch (e) {
      closeScanner();
      toast('Camera not available. Allow camera access, or type the number.', 3500);
    }
  }
  function loadZXing() {
    return new Promise((res, rej) => {
      if (window.ZXing) return res();
      const s = document.createElement('script'); s.src = 'zxing.min.js'; s.onload = () => res(); s.onerror = rej; document.head.appendChild(s);
    });
  }
  function closeScanner() {
    if (!scanner) return false;
    scanner.stop = true;
    if (scanner.stream) scanner.stream.getTracks().forEach(t => t.stop());
    scanner.el.remove();
    scanner = null;
    ui.noLockUntil = 0;
    return true;
  }
  ACT.closeScanner = () => closeScanner();

  // ===================== Boot =====================
  function boot() {
    applyTheme();
    if (!B.hasPin()) renderLock('setup1');
    else {
      renderLock('unlock');
      if (bioEnabled()) setTimeout(() => B.bioAuth(), 300);
    }
  }
  // Exposed for automated tests only.
  window.__rn = { get S() { return S; }, presentText: (id, o) => presentText(getP(id), o || presentOpts), patientFlags: id => patientFlags(getP(id)), cleanDose, egfr, lockNow, runRetention };
  if (B.ready) B.ready.then(boot, e => { applyTheme(); $('#app').innerHTML = `<div class="lock"><div class="bold">RoundNotes cannot start here</div><p class="small">${esc(e && e.message || String(e))}</p></div>`; });
  else boot();
})();
