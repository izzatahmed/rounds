/*
 * RoundNotes — web edition (iPhone, iPad and any modern browser).
 * Gives the app screens the same services the Android shell gives them:
 *  - encrypted storage on the device (IndexedDB, AES-GCM). The data key is itself encrypted with a key derived
 *    from the PIN (PBKDF2-SHA256, 150 000 rounds), so the saved data cannot be read without the PIN;
 *  - password-protected backup files in the same format as the Android app (they restore on either);
 *  - PDF files made on the device and handed to the share sheet (Save to Files, Print, …);
 *  - offline use (service worker) and locking when the app goes to the background.
 * Nothing is ever sent over the network: the page's security policy forbids it (connect-src 'none').
 */
(() => {
  'use strict';
  const VERSION = '0.8.3 web';
  const DB_NAME = 'roundnotes', STORE = 'kv', ITER = 150000;
  const te = new TextEncoder(), td = new TextDecoder();
  const subtle = window.crypto && window.crypto.subtle;
  let db = null, keyRec = null, dataKey = null, rawKey = null, cache = '';
  let queue = Promise.resolve();
  const run = fn => (queue = queue.then(fn).catch(e => { console.error(e); }));

  // ---------- IndexedDB ----------
  const openDB = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = (mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    let out;
    const r = fn(st);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(t.error);
  });
  const get = k => tx('readonly', s => s.get(k));
  const put = (k, v) => tx('readwrite', s => s.put(v, k));
  const clearAll = () => tx('readwrite', s => s.clear());

  // ---------- Crypto helpers ----------
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  async function pwKey(secret, salt) {
    const base = await subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const useKey = raw => subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const aesEnc = async (key, bytes) => { const iv = rnd(12); return { iv, ct: new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) }; };
  const aesDec = async (key, iv, ct) => new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));

  // ---------- Startup ----------
  const ready = (async () => {
    if (!subtle || !window.indexedDB) throw new Error('This browser cannot store encrypted data. Use Safari (iPhone, iPad) or Chrome.');
    db = await openDB();
    keyRec = (await get('key')) || null;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  })();

  // PIN check = unwrapping the data key; on success the saved data is decrypted into memory.
  async function checkPin(pin) {
    await ready;
    if (!keyRec) return false;
    try {
      const kek = await pwKey(pin, keyRec.salt);
      const raw = await aesDec(kek, keyRec.iv, keyRec.wk);
      rawKey = raw; dataKey = await useKey(raw);
    } catch (e) { return false; }
    try {
      const d = await get('data');
      cache = d ? td.decode(await aesDec(dataKey, d.iv, d.ct)) : '';
    } catch (e) { cache = '!ERR'; }
    return true;
  }
  // First PIN creates the data key; a new PIN later re-wraps the same key (the data is not re-encrypted).
  async function setPin(pin) {
    await ready;
    try {
      await queue;
      const fresh = !rawKey;
      if (fresh) { rawKey = rnd(32); dataKey = await useKey(rawKey); cache = ''; }
      const salt = rnd(16), kek = await pwKey(pin, salt), w = await aesEnc(kek, rawKey);
      const rec = { salt, iv: w.iv, wk: w.ct, v: 1 };
      await put('key', rec);
      keyRec = rec;
      return true;
    } catch (e) { console.error(e); return false; }
  }
  let dirty = false;
  function save(s) {
    if (!dataKey) return false;
    cache = s;
    if (!dirty) {
      dirty = true;
      run(async () => { dirty = false; const w = await aesEnc(dataKey, te.encode(cache)); await put('data', { iv: w.iv, ct: w.ct, at: Date.now() }); });
    }
    return true;
  }
  function wipe() {
    dataKey = null; rawKey = null; keyRec = null; cache = '';
    run(() => clearAll());
    return true;
  }

  // ---------- Small overlay for files (share sheet needs a direct tap) ----------
  const css = `.rnw-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200}
.rnw-box{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:201;width:min(92vw,380px);background:var(--card,#fff);color:inherit;border-radius:18px;padding:20px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.rnw-box h3{margin:0 0 8px;font-size:18px}.rnw-box p{margin:0 0 14px;color:var(--muted,#555);font-size:15px;line-height:1.45}
.rnw-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.rnw-btn{border:0;border-radius:12px;padding:11px 16px;font-weight:600;background:var(--pri,#0F6B63);color:#fff;font-size:15px}
.rnw-btn.sec{background:var(--soft,#eef2f1);color:inherit}
.rnw-file{position:relative;overflow:hidden;display:inline-block}.rnw-file input{position:absolute;inset:0;opacity:0;font-size:100px}
.rnw-install{position:fixed;inset:0;z-index:300;background:#0B4F49;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;font-family:-apple-system,system-ui,sans-serif}
.rnw-install h1{font-size:26px;margin:10px 0 6px}.rnw-install ol{text-align:left;font-size:16px;line-height:1.6;max-width:340px;padding-left:22px}
.rnw-install .note{font-size:13px;opacity:.8;max-width:340px;margin-top:10px}.rnw-install a{color:#BFEDE6;margin-top:22px;font-size:14px}
.rnw-update{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--sab,0px) + 16px);z-index:150;background:#22302F;color:#fff;border-radius:14px;padding:10px 12px 10px 16px;display:flex;gap:10px;align-items:center;font-size:14px;box-shadow:0 6px 24px rgba(0,0,0,.3)}
.rnw-update button{border:0;border-radius:10px;padding:8px 12px;background:#2BB3A3;color:#fff;font-weight:600}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function overlay(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="rnw-back"></div><div class="rnw-box" role="dialog">${html}</div>`;
    document.body.appendChild(wrap);
    return { el: wrap, close: () => wrap.remove() };
  }
  // Hand a finished file to the user: the share sheet on phones (Save to Files, Print, AirDrop…), a download elsewhere.
  function deliverFile(bytes, name, mime, title, done) {
    const file = new File([bytes], name, { type: mime });
    const canShare = navigator.canShare && navigator.share && navigator.canShare({ files: [file] });
    const o = overlay(`<h3>${esc(title)}</h3><p>${esc(name)}</p><p class="small">${canShare ? 'Choose <b>Save to Files</b> to keep it, or <b>Print</b>. Keep it inside the treating team.' : 'The file will be downloaded.'}</p>
      <div class="rnw-row"><button class="rnw-btn sec" data-x="cancel">Close</button><button class="rnw-btn" data-x="go">${canShare ? 'Share or save…' : 'Download'}</button></div>`);
    o.el.addEventListener('click', e => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      if (b.dataset.x === 'cancel') { o.close(); done('cancel', ''); return; }
      if (canShare) {
        navigator.share({ files: [file], title: name }).then(() => { o.close(); done('ok', ''); })
          .catch(err => { if (err && err.name === 'AbortError') return; o.close(); download(file, name); done('ok', ''); });
      } else { download(file, name); o.close(); done('ok', ''); }
    });
  }
  function download(file, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const cb = (fn, ...a) => setTimeout(() => { if (typeof window[fn] === 'function') window[fn](...a); }, 0);

  // ---------- Backups: same file format as the Android app ("RNB1" + salt16 + iv12 + AES-GCM) ----------
  const MAGIC = te.encode('RNB1');
  async function exportBackup(json, pw, name) {
    try {
      const salt = rnd(16), key = await pwKey(pw, salt), w = await aesEnc(key, te.encode(json));
      const out = new Uint8Array(4 + 16 + 12 + w.ct.length);
      out.set(MAGIC, 0); out.set(salt, 4); out.set(w.iv, 20); out.set(w.ct, 32);
      deliverFile(out, name, 'application/octet-stream', 'Backup file ready', (s, m) => cb('onExportDone', s, m));
    } catch (e) { cb('onExportDone', 'error', String(e && e.message || e)); }
  }
  function importBackup(pw) {
    const o = overlay(`<h3>Choose the backup file</h3><p>Pick the <b>.rnbak</b> file (from Files, iCloud Drive or Downloads). Backups from the Android app work too.</p>
      <div class="rnw-row"><button class="rnw-btn sec" data-x="cancel">Cancel</button><span class="rnw-btn rnw-file">Choose file<input type="file"></span></div>`);
    o.el.addEventListener('click', e => { const b = e.target.closest('[data-x="cancel"]'); if (b) { o.close(); cb('onImportDone', 'cancel', ''); } });
    o.el.querySelector('input').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      o.close();
      if (!f) { cb('onImportDone', 'cancel', ''); return; }
      const data = new Uint8Array(await f.arrayBuffer());
      if (data.length < 48 || !MAGIC.every((v, i) => data[i] === v)) { cb('onImportDone', 'notbackup', ''); return; }
      try {
        const key = await pwKey(pw, data.slice(4, 20));
        const json = td.decode(await aesDec(key, data.slice(20, 32), data.slice(32)));
        cb('onImportDone', 'ok', json);
      } catch (err) { cb('onImportDone', 'badpassword', ''); }
    });
  }

  // ---------- PDF: the same layout as the Android app, drawn on canvas pages ----------
  function buildPdf(lines) {
    const W = 595, H = 842, M = 36, FOOT = 24, S = 2.4, CW = W - 2 * M;
    const FONT = '-apple-system, "Helvetica Neue", Helvetica, Arial, "Geeza Pro", sans-serif';
    const styles = {
      title: { size: 13, weight: 700, color: '#111' }, head: { size: 10.5, weight: 700, color: '#111' }, body: { size: 9.5, weight: 400, color: '#111' },
      muted: { size: 9.5, weight: 400, color: '#555' }, alert: { size: 9.5, weight: 700, color: '#B00000' }, task: { size: 9.5, weight: 400, color: '#111' }
    };
    const meas = document.createElement('canvas').getContext('2d');
    const setFont = (ctx, s) => { ctx.font = `${s.weight} ${s.size}px ${FONT}`; };
    const wrap = (text, s, width) => {
      setFont(meas, s);
      const out = [];
      String(text).split('\n').forEach(par => {
        let line = '';
        par.split(/(\s+)/).forEach(tok => {
          const t = line + tok;
          if (meas.measureText(t).width <= width || !line.trim()) {
            if (meas.measureText(t).width > width && !line.trim()) {   // one very long word: break it
              let chunk = '';
              for (const ch of tok) { if (meas.measureText(chunk + ch).width > width) { out.push(chunk); chunk = ch; } else chunk += ch; }
              line = chunk;
            } else line = t;
          } else { out.push(line.trimEnd()); line = tok.trimStart(); }
        });
        out.push(line.trimEnd());
      });
      return out;
    };
    // Blocks: consecutive lines sharing a group id ("k") stay on one page when they fit.
    const blocks = [];
    let cur = null, last = null;
    lines.forEach(o => {
      const s = o.s || 'body', g = o.k || '';
      if (!cur || g !== last || !g) { cur = { gap: s === 'head' ? 8 : 2, rows: [] }; blocks.push(cur); last = g; }
      if (s === 'gap') return;
      const sty = styles[s] || styles.body, indent = ['task', 'body', 'muted', 'alert'].includes(s) ? 12 : 0;
      const text = s === 'task' ? '☐ ' + (o.t || '') : (o.t || '');
      wrap(text, sty, CW - indent).forEach(t => cur.rows.push({ t, sty, indent, h: sty.size * 1.5 }));
    });
    const pages = [];
    let ctx = null, y = 0;
    const newPage = () => {
      const c = document.createElement('canvas'); c.width = Math.round(W * S); c.height = Math.round(H * S);
      ctx = c.getContext('2d'); ctx.scale(S, S); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'top';
      pages.push(c); y = M;
    };
    blocks.forEach(b => {
      const h = b.gap + b.rows.reduce((a, r) => a + r.h + 2, 0);
      const fits = ctx && y + h <= H - M - FOOT, fitsEmpty = h <= H - 2 * M - FOOT;
      if (!fits && (!ctx || fitsEmpty)) newPage(); else y += b.gap;
      b.rows.forEach(r => {
        if (y + r.h > H - M - FOOT) newPage();
        setFont(ctx, r.sty); ctx.fillStyle = r.sty.color;
        ctx.fillText(r.t, M + r.indent, y + r.sty.size * 0.2);
        y += r.h + 2;
      });
    });
    if (!ctx) newPage();
    pages.forEach((c, i) => {
      const x = c.getContext('2d'); x.setTransform(S, 0, 0, S, 0, 0); x.font = `400 7.5px ${FONT}`; x.fillStyle = '#777'; x.textBaseline = 'alphabetic';
      x.fillText('RoundNotes · confidential — for the treating team only', M, H - M / 2);
      const n = `Page ${i + 1}`; x.fillText(n, W - M - x.measureText(n).width, H - M / 2);
    });
    // Write a PDF with one JPEG image per page.
    const jpgs = pages.map(c => { const b64 = c.toDataURL('image/jpeg', 0.86).split(',')[1], bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return { u, w: c.width, h: c.height }; });
    const parts = [], offsets = [];
    let len = 0;
    const add = x => { const u = typeof x === 'string' ? te.encode(x) : x; parts.push(u); len += u.length; };
    const obj = (n, body) => { offsets[n] = len; add(`${n} 0 obj\n`); body(); add('\nendobj\n'); };
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = jpgs.length, kids = jpgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
    jpgs.forEach((j, i) => {
      const p = 3 + i * 3;
      obj(p, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
      const cs = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
      obj(p + 1, () => add(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
      obj(p + 2, () => { add(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.u.length} >>\nstream\n`); add(j.u); add('\nendstream'); });
    });
    const total = 3 + n * 3, xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    add(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(len);
    let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
    return out;
  }
  function savePdf(lines, name) {
    try {
      const bytes = buildPdf(lines);
      deliverFile(bytes, name, 'application/pdf', 'PDF ready', (s, m) => cb('onPdfDone', s, m));
      return true;
    } catch (e) { console.error(e); return false; }
  }

  function copy(t) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } ta.remove(); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(fallback); else fallback(); } catch (e) { fallback(); }
  }

  // Safe areas (notch, home bar): read the CSS env() values.
  function insets() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(p);
    const cs = getComputedStyle(p), t = parseFloat(cs.paddingTop) || 0, b = parseFloat(cs.paddingBottom) || 0;
    p.remove();
    return `${t},${b}`;
  }
  window.addEventListener('resize', () => { if (window.onInsets) { const [t, b] = insets().split(',').map(Number); window.onInsets(t, b); } });

  function bars(dark) {
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = dark ? '#0A3D39' : '#0B4F49';
  }

  // Lock when the app goes to the background, as on Android.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (window.onAppPause) window.onAppPause(); }
    else if (window.onAppResume) window.onAppResume();
  });
  window.addEventListener('pagehide', () => { if (window.onAppPause) window.onAppPause(); });

  // ---------- Install hint (Safari tab on iPhone/iPad) and updates ----------
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  function installScreen() {
    if (!ios || standalone || sessionStorage.getItem('rn_tab_ok')) return;
    const d = document.createElement('div');
    d.className = 'rnw-install';
    d.innerHTML = `<svg viewBox="0 0 108 108" width="64" height="64"><rect width="108" height="108" rx="24" fill="#0F6B63"/><path fill="#fff" d="M38,30h32a4,4 0 0 1 4,4v42a4,4 0 0 1-4,4h-32a4,4 0 0 1-4-4v-42a4,4 0 0 1 4-4z"/><path fill="#0F6B63" d="M44 46h20v4H44zM44 56h20v4H44zM44 66h12v4H44z"/></svg>
      <h1>Add RoundNotes to your Home Screen</h1>
      <ol><li>Tap the <b>Share</b> button <span aria-hidden="true">(square with an arrow)</span> in Safari.</li><li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>RoundNotes</b> from the new icon on your Home Screen.</li></ol>
      <div class="note">Patients saved in a Safari tab are kept separately from the Home Screen app, so always use the icon. RoundNotes works offline and never sends data anywhere.</div>
      <a href="#" id="rnw-tab">Continue in Safari anyway</a>`;
    document.body.appendChild(d);
    d.querySelector('#rnw-tab').addEventListener('click', e => { e.preventDefault(); sessionStorage.setItem('rn_tab_ok', '1'); d.remove(); });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              const bar = document.createElement('div'); bar.className = 'rnw-update';
              bar.innerHTML = '<span>A new version of RoundNotes is ready.</span><button>Update</button>';
              bar.querySelector('button').addEventListener('click', () => {
                if (window.onAppPause) window.onAppPause();
                navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
                setTimeout(() => (reg.waiting || w).postMessage('update'), 300);
              });
              document.body.appendChild(bar);
            }
          });
        });
      }).catch(() => { });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installScreen); else installScreen();

  window.RNWeb = {
    native: false, web: true, ready,
    load: () => cache,
    save, wipe,
    hasPin: () => !!keyRec,
    setPin, checkPin,
    bioAvail: () => false, bioAuth: () => { },
    exportBackup, importBackup,
    copy, print: () => false, savePdf,
    version: () => VERSION,
    syncReminders: () => { }, notifyState: () => 'unsupported',
    askNotify: () => cb('onNotifyResult', 'unsupported'), openAppSettings: () => { }, launchRem: () => '',
    insets, bars
  };
})();
