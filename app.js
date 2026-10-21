'use strict';
/* Carbon-Gurke Setup – Logbuch für Fahrwerk, Reifen, Cockpit und Bosch-Fahrmodi
   Daten: lokal (offline) + Google Apps Script (Sheet). KI: Claude über das Apps Script. */

const APP_VERSION = '1.0.1';
const LS = { records: 'cgs.records.v1', queue: 'cgs.queue.v1', settings: 'cgs.settings.v1', meta: 'cgs.meta.v1' };

/* =========================================================
   Schema – einzige Quelle für Formular, Anzeige, Verlauf, KI
   ========================================================= */
const ANLAESSE = ['Übergabe', 'Anpassung', 'KI-Vorschlag', 'Werkstatt', 'Saisonwechsel', 'Test'];

const SECTIONS = [
  { key: 'gabel', titel: 'Gabel (vorne)', kurz: 'Gabel', untertitel: 'Fox 36 Float Performance GRIP · 150 mm', felder: [
    { k: 'druck_psi', l: 'Luftdruck', u: 'psi', t: 'num', btn: 5, top: true },
    { k: 'sag_mm', l: 'Sag gemessen', u: 'mm', t: 'num', btn: 1, sag: 'gabel', hint: 'wird in % umgerechnet (Federweg aus dem Profil)' },
    { k: 'sag_pct', l: 'Sag', u: '%', t: 'num', btn: 1, ziel: 'sag_ziel_gabel', top: true },
    { k: 'rebound_klicks', l: 'Rebound', u: 'Klicks', t: 'num', btn: 1, hint: 'von ganz zu gezählt (im Uhrzeigersinn ganz rein = 0)', top: true },
    { k: 'hebel', l: 'Druckstufen-Hebel', t: 'select', opt: ['Open', 'Medium', 'Firm'], top: true },
    { k: 'druckstufe_klicks', l: 'Druckstufe', u: 'Klicks', t: 'num', btn: 1, hint: 'nur falls an deiner Gabel einstellbar – am Rad prüfen' },
    { k: 'token', l: 'Volume Spacer (Token)', u: 'Stk.', t: 'num', btn: 1, top: true },
  ]},
  { key: 'daempfer', titel: 'Dämpfer (hinten)', kurz: 'Dämpfer', untertitel: 'Fox Float X Performance', felder: [
    { k: 'druck_psi', l: 'Luftdruck', u: 'psi', t: 'num', btn: 5, top: true },
    { k: 'sag_mm', l: 'Sag gemessen', u: 'mm', t: 'num', btn: 1, sag: 'daempfer', hint: 'am Dämpferschaft (O-Ring) – Hub im Profil eintragen' },
    { k: 'sag_pct', l: 'Sag', u: '%', t: 'num', btn: 1, ziel: 'sag_ziel_daempfer', top: true },
    { k: 'rebound_klicks', l: 'Rebound', u: 'Klicks', t: 'num', btn: 1, hint: 'von ganz zu gezählt', top: true },
    { k: 'hebel', l: 'Hebel', t: 'select', opt: ['Open', 'Firm'], top: true },
    { k: 'spacer', l: 'Volume Spacer', u: 'Stk.', t: 'num', btn: 1, top: true },
  ]},
  { key: 'reifen', titel: 'Reifen', kurz: 'Reifen', untertitel: 'Continental Kryptotal 2.4 · Newmen Beskar 30', felder: [
    { k: 'vorne_bar', l: 'Druck vorne', u: 'bar', t: 'num', btn: 0.1, top: true },
    { k: 'hinten_bar', l: 'Druck hinten', u: 'bar', t: 'num', btn: 0.1, top: true },
    { k: 'system', l: 'System', t: 'select', opt: ['Schlauch', 'Tubeless'], top: true },
    { k: 'modell_vorne', l: 'Reifen vorne', t: 'text', ph: 'z. B. Kryptotal Fr 2.4', ki: false },
    { k: 'modell_hinten', l: 'Reifen hinten', t: 'text', ph: 'z. B. Kryptotal Re 2.4', ki: false },
  ]},
  { key: 'cockpit', titel: 'Cockpit & Sitzposition', kurz: 'Cockpit', untertitel: 'Sattel, Lenker, Bremshebel', felder: [
    { k: 'sattelhoehe_mm', l: 'Sattelhöhe', u: 'mm', t: 'num', btn: 1, hint: 'Tretlagermitte bis Satteloberkante · Startwert 775 mm', top: true },
    { k: 'sattelneigung_grad', l: 'Sattelneigung', u: '°', t: 'num', btn: 0.5, top: true },
    { k: 'sattel_position', l: 'Sattel auf der Schiene', t: 'text', ph: 'z. B. Mitte, 5 mm zurück', ki: false },
    { k: 'lenker_spacer_mm', l: 'Spacer unter dem Vorbau', u: 'mm', t: 'num', btn: 5, top: true },
    { k: 'lenker_rotation', l: 'Lenker-Rotation', t: 'text', ph: 'z. B. Markierung 0', ki: false },
    { k: 'bremshebel_griffweite', l: 'Griffweite Bremshebel', t: 'text', ph: 'z. B. 2 Umdrehungen rein', ki: false, top: true },
    { k: 'bremshebel_winkel_grad', l: 'Bremshebel-Winkel', u: '°', t: 'num', btn: 5 },
  ]},
  { key: 'kontext', titel: 'Kontext', kurz: 'Kontext', untertitel: 'Gewicht, Strecke, Bedingungen', diff: false, felder: [
    { k: 'gewicht_kg', l: 'Gewicht mit Ausrüstung', u: 'kg', t: 'num', btn: 1, ki: false },
    { k: 'strecke', l: 'Strecke / Tour', t: 'text', ph: 'z. B. Hausrunde Kolmbach', ki: false },
    { k: 'untergrund', l: 'Bedingungen', t: 'select', opt: ['trocken', 'feucht', 'nass', 'Schlamm', 'Schnee/Eis'], ki: false },
    { k: 'temperatur_c', l: 'Temperatur', u: '°C', t: 'num', btn: 1, ki: false },
  ]},
];

const BOSCH_MODI = ['Eco', 'Eco+', 'Tour', 'Tour+', 'Auto', 'Sport', 'Turbo', 'Sprint', 'eMTB', 'eMTB+', 'Race'];
const MODI_600 = ['Race', 'Turbo', 'eMTB+', 'Auto'];
const MODI_DT = ['eMTB+', 'Race'];
const MODI_BOOST_STANDARD = ['eMTB', 'eMTB+', 'Race'];
const UNITS = ['Stufe', '%'];

const BOSCH_GLOBAL = [
  { k: 'upgrade_20', l: 'Performance Upgrade 2.0 installiert', t: 'select', opt: ['ja', 'nein'], ki: false },
  { k: 'drehmoment_limit_nm', l: 'Drehmoment-Limit des Herstellers', u: 'Nm', t: 'num', btn: 5, hint: 'Cube kann das Maximum begrenzen – in der Flow App ablesen', ki: false },
  { k: 'software', l: 'Software-Stand', t: 'text', ph: 'aus der Flow App', ki: false },
];

const BOSCH_FELDER = [
  { k: 'verfuegbar', l: 'An meinem Rad verfügbar', t: 'bool', ki: false, diffLabel: 'verfügbar' },
  { k: 'kiox_pos', l: 'Platz auf dem Kiox', t: 'select', opt: ['1', '2', '3', '4', '5'], kind: 'int', ki: false },
  { k: 'unterstuetzung', l: 'Unterstützung', t: 'unit' },
  { k: 'dynamik', l: 'Dynamik', t: 'unit' },
  { k: 'max_drehmoment_nm', l: 'Max. Drehmoment', u: 'Nm', t: 'num', btn: 5 },
  { k: 'max_geschwindigkeit_kmh', l: 'Max. Geschwindigkeit', u: 'km/h', t: 'num', btn: 1, hint: 'Pedelec: Unterstützung höchstens bis 25 km/h' },
  { k: 'extended_boost', l: 'Extended Boost', t: 'unit' },
  { k: 'drivetrain_tensioner', l: 'Drivetrain Tensioner', t: 'select', opt: ['aus', 'an'], nur: MODI_DT },
  { k: 'drivetrain_stufe', l: 'Drivetrain Tensioner Stufe', t: 'num', btn: 1, nur: MODI_DT, hint: 'nur falls die App Stufen zeigt' },
  { k: 'notiz', l: 'Notiz zum Modus', t: 'text', ki: false },
];

const PROFIL_FELDER = [
  { k: 'groesse_cm', l: 'Körpergröße', u: 'cm', d: 186, btn: 1 },
  { k: 'gewicht_kg', l: 'Körpergewicht', u: 'kg', d: 95, btn: 1 },
  { k: 'gabel_federweg_mm', l: 'Gabel-Federweg', u: 'mm', d: 150, btn: 5 },
  { k: 'gabel_max_psi', l: 'Gabel max. Druck (Aufkleber)', u: 'psi', d: null, btn: 5 },
  { k: 'daempfer_hub_mm', l: 'Dämpfer-Hub (für Sag-Rechner)', u: 'mm', d: null, btn: 1 },
  { k: 'daempfer_max_psi', l: 'Dämpfer max. Druck', u: 'psi', d: 350, btn: 5 },
  { k: 'sag_ziel_gabel', l: 'Sag-Ziel Gabel', u: '%', d: 20, btn: 1 },
  { k: 'sag_ziel_daempfer', l: 'Sag-Ziel Dämpfer', u: '%', d: 30, btn: 1 },
];

const CHIPS = [
  'Gabel zu hart / unsensibel', 'Gabel taucht beim Bremsen weg', 'Gabel schlägt durch', 'Gabel kickt / federt zu schnell zurück',
  'Heck zu hart / bockt', 'Heck wippt / sackt durch', 'Heck schlägt durch', 'Heck kickt',
  'Zu wenig Grip vorne', 'Zu wenig Grip hinten', 'Reifen walkt / schwammig',
  'Motor zu ruppig am Trail', 'Zu wenig Unterstützung bergauf', 'Akku leert sich zu schnell', 'Sitzposition unbequem',
];

/* Feld-Registry */
const FIELDS = [];
(function buildRegistry() {
  for (const s of SECTIONS) for (const f of s.felder) {
    FIELDS.push({ ...f, path: `${s.key}.${f.k}`, section: s.key, label: `${s.kurz} · ${f.l}`, diff: s.diff !== false });
  }
  for (const f of BOSCH_GLOBAL) FIELDS.push({ ...f, path: `bosch.global.${f.k}`, section: 'bosch', label: `Bosch · ${f.l}`, diff: true });
  for (const m of BOSCH_MODI) for (const f of BOSCH_FELDER) {
    if (f.nur && !f.nur.includes(m)) continue;
    FIELDS.push({ ...f, path: `bosch.modi.${m}.${f.k}`, section: 'bosch', modus: m, label: `${m} · ${f.diffLabel || f.l}`, diff: true });
  }
})();
const FIELD_MAP = new Map(FIELDS.map(f => [f.path, f]));

/* =========================================================
   Hilfsfunktionen
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowIso = () => new Date().toISOString();
const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clone = o => JSON.parse(JSON.stringify(o ?? null));

function parseNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, '').replace('−', '-').replace(',', '.').replace(/^\+/, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const round2 = n => Math.round(n * 100) / 100;
const fmtNum = n => (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const fmtInput = n => (n === null || n === undefined || n === '') ? '' : String(round2(Number(n))).replace('.', ',');
function fmtDate(iso, mitZeit = true) {
  if (!iso) return '–';
  const d = new Date(iso);
  const opt = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (mitZeit) Object.assign(opt, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('de-DE', opt);
}
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], obj);
}
function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = val;
}
function isEmpty(f, v) {
  if (v === null || v === undefined || v === '') return true;
  if (f.t === 'unit') return v.wert === null || v.wert === undefined || v.wert === '';
  if (f.t === 'bool') return v !== true;
  return false;
}
function display(f, v) {
  if (isEmpty(f, v)) return '–';
  switch (f.t) {
    case 'num': return `${fmtNum(v)}${f.u ? ' ' + f.u : ''}`;
    case 'unit': {
      const e = v.einheit || UNITS[0];
      if (e === 'Stufe') return `Stufe ${v.wert > 0 ? '+' : ''}${fmtNum(v.wert)}`;
      return `${fmtNum(v.wert)} %`;
    }
    case 'bool': return v ? 'ja' : 'nein';
    case 'select': return f.k === 'kiox_pos' ? `Platz ${v}` : String(v);
    default: return String(v);
  }
}
function profilWert(k) { return profil()[k]; }

/* =========================================================
   Speicher & Sync
   ========================================================= */
const store = { records: {}, queue: [], settings: { url: '', token: '' }, meta: { lastSync: null, lastError: null } };
const ui = { view: 'aktiv', syncing: false, editor: null, ki: { text: '', untergrund: '', strecke: '', laden: false, ergebnis: null, fehler: null, feedbackId: null } };

function loadStore() {
  try { store.records = JSON.parse(localStorage.getItem(LS.records)) || {}; } catch { store.records = {}; }
  try { store.queue = JSON.parse(localStorage.getItem(LS.queue)) || []; } catch { store.queue = []; }
  try { store.settings = { url: '', token: '', ...(JSON.parse(localStorage.getItem(LS.settings)) || {}) }; } catch { /* Standard */ }
  try { store.meta = { lastSync: null, lastError: null, ...(JSON.parse(localStorage.getItem(LS.meta)) || {}) }; } catch { /* Standard */ }
}
function persist() {
  try {
    localStorage.setItem(LS.records, JSON.stringify(store.records));
    localStorage.setItem(LS.queue, JSON.stringify(store.queue));
    localStorage.setItem(LS.settings, JSON.stringify(store.settings));
    localStorage.setItem(LS.meta, JSON.stringify(store.meta));
  } catch (e) { toast('Lokaler Speicher voll oder gesperrt: ' + e.message, 'err'); }
}
function putRecord(rec) {
  rec.updated = nowIso();
  if (!rec.created) rec.created = rec.updated;
  store.records[rec.id] = rec;
  if (!store.queue.includes(rec.id)) store.queue.push(rec.id);
  persist();
  updateStatus();
  scheduleSync(400);
}

const setups = () => Object.values(store.records).filter(r => r.typ === 'setup' && !r.geloescht).sort((a, b) => b.created.localeCompare(a.created));
const feedbacks = () => Object.values(store.records).filter(r => r.typ === 'feedback' && !r.geloescht).sort((a, b) => b.created.localeCompare(a.created));
function aktivesSetup() {
  const s = setups();
  if (!s.length) return null;
  return [...s].sort((a, b) => (b.data.aktiviert_am || b.created).localeCompare(a.data.aktiviert_am || a.created))[0];
}
function profil() {
  const p = {};
  for (const f of PROFIL_FELDER) p[f.k] = f.d;
  const rec = store.records.profil;
  if (rec && rec.data) for (const [k, v] of Object.entries(rec.data)) if (v !== null && v !== undefined && v !== '') p[k] = v;
  return p;
}

const backendOk = () => !!(store.settings.url && store.settings.token);

async function fetchJson(url, opts = {}, ms = 25000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ac.signal, redirect: 'follow' });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { throw new Error('Antwort ist kein JSON – stimmt die Web-App-URL (endet auf /exec) und ist die Bereitstellung für „Jeder“ freigegeben?'); }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Zeitüberschreitung – keine Antwort vom Backend');
    throw e;
  } finally { clearTimeout(timer); }
}
async function apiGet(action) {
  const u = new URL(store.settings.url);
  u.searchParams.set('action', action);
  u.searchParams.set('token', store.settings.token);
  const j = await fetchJson(u.toString());
  if (!j.ok) throw new Error(j.fehler || 'Unbekannter Fehler');
  return j;
}
async function apiPost(payload, ms) {
  // text/plain (Standard bei String-Body) → kein CORS-Preflight, Apps Script liest e.postData.contents
  const j = await fetchJson(store.settings.url, { method: 'POST', body: JSON.stringify({ ...payload, token: store.settings.token }) }, ms);
  if (!j.ok) throw new Error(j.fehler || 'Unbekannter Fehler');
  return j;
}

let syncTimer = null;
function scheduleSync(ms = 1000) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms); }

async function sync() {
  if (!backendOk() || ui.syncing || !navigator.onLine) { updateStatus(); return; }
  ui.syncing = true; updateStatus();
  try {
    if (store.queue.length) {
      const ids = [...store.queue];
      const recs = ids.map(id => store.records[id]).filter(Boolean).map(r => ({ ...r, lesbar: r.typ === 'setup' ? lesbar(r) : r.typ === 'feedback' ? lesbarFeedback(r) : null }));
      const sent = new Map(recs.map(r => [r.id, r.updated]));
      await apiPost({ action: 'upsert', records: recs });
      store.queue = store.queue.filter(id => !sent.has(id) || (store.records[id] && store.records[id].updated !== sent.get(id)));
    }
    const j = await apiGet('alle');
    for (const r of j.records || []) {
      if (store.queue.includes(r.id)) continue;
      const lokal = store.records[r.id];
      if (!lokal || (r.updated || '') > (lokal.updated || '')) {
        store.records[r.id] = { id: r.id, typ: r.typ, created: r.created, updated: r.updated, geloescht: !!r.geloescht, data: r.data };
      }
    }
    store.meta.lastSync = nowIso();
    store.meta.lastError = null;
  } catch (e) {
    store.meta.lastError = e.message;
  } finally {
    ui.syncing = false;
    persist();
    updateStatus();
    if (ui.view === 'aktiv' || ui.view === 'verlauf' || ui.view === 'mehr') render();
  }
}

function updateStatus() {
  const el = $('#sync');
  if (!el) return;
  let cls = 'idle', txt;
  const n = store.queue.length;
  if (!backendOk()) { txt = 'nur lokal'; cls = 'off'; }
  else if (ui.syncing) { txt = 'synchronisiere …'; cls = 'busy'; }
  else if (!navigator.onLine) { txt = n ? `offline · ${n} ausstehend` : 'offline'; cls = 'off'; }
  else if (store.meta.lastError) { txt = 'Sync-Fehler'; cls = 'err'; }
  else if (n) { txt = `${n} ausstehend`; cls = 'busy'; }
  else { txt = 'synchron'; cls = 'ok'; }
  el.className = `sync ${cls}`;
  el.querySelector('span').textContent = txt;
  el.title = store.meta.lastError ? `Letzter Fehler: ${store.meta.lastError}` : (store.meta.lastSync ? `Letzter Abgleich: ${fmtDate(store.meta.lastSync)}` : '');
}

/* =========================================================
   Setup-Logik: Diff, Kiox, lesbare Form, Warnungen
   ========================================================= */
function kioxListe(data) {
  const modi = (data && data.bosch && data.bosch.modi) || {};
  return BOSCH_MODI.filter(m => modi[m] && modi[m].kiox_pos).map(m => ({ m, pos: Number(modi[m].kiox_pos) })).sort((a, b) => a.pos - b.pos);
}
const kioxText = data => kioxListe(data).map(x => x.m).join(' · ');

function diff(alt, neu) {
  const out = [];
  for (const f of FIELDS) {
    if (!f.diff) continue;
    const a = alt ? getPath(alt, f.path) : undefined;
    const b = getPath(neu, f.path);
    const da = display(f, a), db = display(f, b);
    if (da !== db) out.push({ f, von: da, nach: db });
  }
  const ka = alt ? kioxText(alt) : '', kb = kioxText(neu);
  if (ka !== kb) out.push({ f: { label: 'Kiox-Reihenfolge' }, von: ka || '–', nach: kb || '–' });
  return out;
}
function vorgaenger(rec) {
  const liste = setups().filter(s => s.created < rec.created);
  return liste.length ? liste[0] : null;
}
function autoName(d) {
  if (!d.length) return 'Unverändert';
  const teile = d.slice(0, 2).map(x => `${x.f.label.replace(' · ', ' ')} ${x.nach}`);
  return teile.join(', ') + (d.length > 2 ? ` (+${d.length - 2})` : '');
}
function modusRelevant(data, m) {
  const md = data && data.bosch && data.bosch.modi && data.bosch.modi[m];
  return !!(md && (md.verfuegbar || md.kiox_pos));
}
function lesbar(rec) {
  const d = rec.data || {};
  const out = { Name: d.name || '', Anlass: d.anlass || '', Notiz: d.notiz || '', 'Kiox-Favoriten': kioxText(d) };
  for (const f of FIELDS) {
    if (f.t === 'bool') continue;
    if (f.modus && !modusRelevant(d, f.modus)) continue;
    const v = getPath(d, f.path);
    out[f.label] = isEmpty(f, v) ? '' : display(f, v);
  }
  return out;
}
function lesbarFeedback(rec) {
  const d = rec.data || {};
  const ki = d.ki || {};
  return {
    Rückmeldung: d.text || '', Bedingungen: d.untergrund || '', Strecke: d.strecke || '',
    Diagnose: ki.diagnose || '', Änderungen: (ki.aenderungen || []).map(a => `${(FIELD_MAP.get(a.pfad) || { label: a.pfad }).label} → ${a.nach}${a.einheit ? ' ' + a.einheit : ''}`).join('; '),
    Status: d.status || '',
  };
}

function warnungen(data) {
  const p = profil();
  const w = {};
  const g = getPath(data, 'gabel.druck_psi'), dm = getPath(data, 'daempfer.druck_psi');
  if (dm != null && p.daempfer_max_psi && dm > p.daempfer_max_psi) w['daempfer.druck_psi'] = `über dem Maximaldruck (${fmtNum(p.daempfer_max_psi)} psi)`;
  if (g != null && p.gabel_max_psi && g > p.gabel_max_psi) w['gabel.druck_psi'] = `über dem Maximaldruck (${fmtNum(p.gabel_max_psi)} psi)`;
  for (const [teil, ziel] of [['gabel', p.sag_ziel_gabel], ['daempfer', p.sag_ziel_daempfer]]) {
    const s = getPath(data, `${teil}.sag_pct`);
    if (s != null && ziel && Math.abs(s - ziel) > 5) w[`${teil}.sag_pct`] = `deutlich neben dem Ziel (${fmtNum(ziel)} %)`;
  }
  for (const k of ['vorne_bar', 'hinten_bar']) {
    const v = getPath(data, `reifen.${k}`);
    if (v != null && v > 4) w[`reifen.${k}`] = 'Einheit prüfen – Wert in bar, nicht psi';
  }
  const limit = getPath(data, 'bosch.global.drehmoment_limit_nm');
  const plaetze = {};
  for (const m of BOSCH_MODI) {
    const nm = getPath(data, `bosch.modi.${m}.max_drehmoment_nm`);
    if (nm != null && nm > 120) w[`bosch.modi.${m}.max_drehmoment_nm`] = 'über 120 Nm (Maximum mit Upgrade 2.0)';
    else if (nm != null && limit && nm > limit) w[`bosch.modi.${m}.max_drehmoment_nm`] = `über dem Hersteller-Limit (${fmtNum(limit)} Nm)`;
    const kmh = getPath(data, `bosch.modi.${m}.max_geschwindigkeit_kmh`);
    if (kmh != null && kmh > 25) w[`bosch.modi.${m}.max_geschwindigkeit_kmh`] = 'Pedelec: Unterstützung höchstens bis 25 km/h';
    const u = getPath(data, `bosch.modi.${m}.unterstuetzung`);
    if (u && u.einheit === '%' && u.wert > 600) w[`bosch.modi.${m}.unterstuetzung`] = 'über 600 % (Maximum mit Upgrade 2.0)';
    const pos = getPath(data, `bosch.modi.${m}.kiox_pos`);
    if (pos) (plaetze[pos] = plaetze[pos] || []).push(m);
  }
  for (const liste of Object.values(plaetze)) if (liste.length > 1) for (const m of liste) w[`bosch.modi.${m}.kiox_pos`] = `Platz doppelt vergeben (${liste.join(', ')})`;
  return w;
}

/* =========================================================
   KI
   ========================================================= */
function feldTypText(f, data) {
  if (f.t === 'num') return `Zahl in ${f.u}`;
  if (f.t === 'unit') { const e = (getPath(data, f.path) || {}).einheit || 'Stufe'; return `Zahl, Einheit ${UNITS.join(' oder ')} (aktuell ${e})`; }
  if (f.t === 'select') return `einer von: ${f.opt.join(', ')}`;
  return '';
}
function kiNachricht(fb) {
  const s = aktivesSetup();
  const d = s.data;
  const p = profil();
  const L = [];
  L.push('FAHRERPROFIL');
  L.push(`- Körpergröße ${p.groesse_cm ?? 'unbekannt'} cm, Körpergewicht ${p.gewicht_kg ?? 'unbekannt'} kg${getPath(d, 'kontext.gewicht_kg') ? `, mit Ausrüstung ${fmtNum(getPath(d, 'kontext.gewicht_kg'))} kg` : ''}`);
  L.push(`- Gabel-Federweg ${p.gabel_federweg_mm ?? 'unbekannt'} mm · Dämpfer-Hub ${p.daempfer_hub_mm ?? 'unbekannt'} mm`);
  L.push(`- Sag-Ziel Gabel ${p.sag_ziel_gabel ?? 20} %, Dämpfer ${p.sag_ziel_daempfer ?? 30} %`);
  L.push(`- Maximaldruck Dämpfer ${p.daempfer_max_psi ?? 'unbekannt'} psi · Gabel ${p.gabel_max_psi ?? 'unbekannt (steht auf dem Aufkleber am Gabelholm)'}${p.gabel_max_psi ? ' psi' : ''}`);
  L.push('');
  L.push(`AKTIVES SETUP: „${d.name || 'ohne Namen'}“ (${d.anlass || '–'}), aktiv seit ${fmtDate(d.aktiviert_am || s.created)}`);
  for (const f of FIELDS) {
    if (f.t === 'bool' || f.k === 'kiox_pos') continue;
    const v = getPath(d, f.path);
    if (isEmpty(f, v)) continue;
    L.push(`- ${f.path} = ${display(f, v)}   [${f.label}]`);
  }
  L.push(`- Kiox-Favoriten in Reihenfolge: ${kioxText(d) || 'nicht eingetragen'}`);
  if (d.notiz) L.push(`- Notiz: ${d.notiz}`);
  L.push('');
  const irgendeinModus = BOSCH_MODI.some(m => modusRelevant(d, m));
  L.push('ERLAUBTE PFADE FÜR ÄNDERUNGEN (Pfad · Bedeutung · Typ):');
  for (const f of FIELDS) {
    if (f.ki === false || f.t === 'text' || f.t === 'bool') continue;
    if (f.modus && irgendeinModus && !modusRelevant(d, f.modus)) continue;
    L.push(`- ${f.path} · ${f.label} · ${feldTypText(f, d)}`);
  }
  L.push('');
  L.push('VERLAUF (neueste zuerst):');
  const ereignisse = [
    ...setups().slice(0, 6).map(r => ({ zeit: r.created, text: `${fmtDate(r.created)} Setup „${r.data.name || ''}“ (${r.data.anlass || '–'}): ${diff(vorgaenger(r) && vorgaenger(r).data, r.data).map(x => `${x.f.label} ${x.von} → ${x.nach}`).join('; ') || 'Basis-Setup'}` })),
    ...feedbacks().filter(r => r.id !== fb.id).slice(0, 4).map(r => ({ zeit: r.created, text: `${fmtDate(r.created)} Rückmeldung: „${r.data.text}“${r.data.ki ? ` → KI: ${r.data.ki.diagnose} (Status: ${r.data.status})` : ''}` })),
  ].sort((a, b) => b.zeit.localeCompare(a.zeit)).slice(0, 8);
  if (!ereignisse.length) L.push('- (noch kein Verlauf)');
  for (const e of ereignisse) L.push(`- ${e.text}`);
  L.push('');
  L.push(`RÜCKMELDUNG DES FAHRERS (${fmtDate(fb.created)})`);
  if (fb.data.untergrund || fb.data.strecke) L.push(`Bedingungen: ${fb.data.untergrund || '–'} · Strecke: ${fb.data.strecke || '–'}`);
  L.push(fb.data.text);
  return L.join('\n');
}

function wendeAn(data, aenderungen) {
  const res = [];
  for (const a of aenderungen || []) {
    const f = FIELD_MAP.get(String(a.pfad || '').trim());
    const fail = grund => res.push({ ...a, ok: false, grund, f });
    if (!f || f.ki === false || f.t === 'text' || f.t === 'bool') { fail('Feld nicht automatisch übernehmbar'); continue; }
    const von = display(f, getPath(data, f.path));
    if (f.t === 'num') {
      const v = parseNum(a.nach);
      if (v === null) { fail('Wert ist keine Zahl'); continue; }
      setPath(data, f.path, v);
    } else if (f.t === 'unit') {
      const v = parseNum(a.nach);
      if (v === null) { fail('Wert ist keine Zahl'); continue; }
      setPath(data, `${f.path}.wert`, v);
      const e = a.einheit && UNITS.find(u => u.toLowerCase() === String(a.einheit).trim().toLowerCase().replace('prozent', '%').replace('stufen', 'stufe'));
      if (e) setPath(data, `${f.path}.einheit`, e);
      else if (!getPath(data, `${f.path}.einheit`)) setPath(data, `${f.path}.einheit`, UNITS[0]);
    } else if (f.t === 'select') {
      const o = f.opt.find(x => x.toLowerCase() === String(a.nach).trim().toLowerCase());
      if (!o) { fail(`erlaubt: ${f.opt.join(', ')}`); continue; }
      setPath(data, f.path, o);
    }
    if (f.modus) setPath(data, `bosch.modi.${f.modus}.verfuegbar`, true);
    res.push({ ...a, ok: true, f, von, neu: display(f, getPath(data, f.path)) });
  }
  return res;
}

async function kiAnfrage() {
  const s = aktivesSetup();
  const text = ui.ki.text.trim();
  if (!s) { toast('Erst ein Setup anlegen.', 'err'); return; }
  if (!text) { toast('Schreib kurz, was dir auffällt.', 'err'); return; }
  let fb = ui.ki.feedbackId && store.records[ui.ki.feedbackId];
  if (!fb) fb = { id: uid('f'), typ: 'feedback', created: nowIso(), data: {} };
  fb.data = { ...fb.data, setup_id: s.id, text, untergrund: ui.ki.untergrund || null, strecke: ui.ki.strecke || null };

  if (!backendOk() || !navigator.onLine) {
    fb.data.status = 'ohne KI';
    putRecord(fb);
    ui.ki = { text: '', untergrund: '', strecke: '', laden: false, ergebnis: null, fehler: null, feedbackId: null };
    toast(backendOk() ? 'Offline – Rückmeldung gespeichert. Den Tipp holst du später im Verlauf.' : 'Rückmeldung gespeichert. Für KI-Tipps erst das Backend unter „Mehr“ einrichten.');
    render();
    return;
  }
  ui.ki.laden = true; ui.ki.fehler = null; ui.ki.ergebnis = null; render();
  try {
    const j = await apiPost({ action: 'ki', nachricht: kiNachricht(fb) }, 120000);
    fb.data.ki = { ...j.tipp, modell: j.modell || null, zeit: nowIso() };
    fb.data.status = 'offen';
    putRecord(fb);
    ui.ki.feedbackId = fb.id;
    ui.ki.ergebnis = fb.id;
  } catch (e) {
    fb.data.status = 'ohne KI';
    fb.data.fehler = e.message;
    putRecord(fb);
    ui.ki.feedbackId = fb.id;
    ui.ki.fehler = e.message;
  } finally {
    ui.ki.laden = false;
    render();
    const ziel = $('.result') || $('.errbox');
    if (ziel) ziel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* =========================================================
   Rendering
   ========================================================= */
function render() {
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.view === ui.view || (ui.view === 'editor' && b.dataset.view === 'aktiv')));
  document.body.classList.toggle('editing', ui.view === 'editor');
  const v = $('#view');
  if (ui.view === 'editor') return; // Editor rendert sich selbst, damit Eingaben nicht verloren gehen
  if (ui.view === 'aktiv') v.innerHTML = viewAktiv();
  else if (ui.view === 'ki') v.innerHTML = viewKi();
  else if (ui.view === 'verlauf') v.innerHTML = viewVerlauf();
  else if (ui.view === 'mehr') v.innerHTML = viewMehr();
  updateStatus();
}

function kachel(f, v) {
  return `<div class="tile"><div class="tile-l">${esc(f.l)}</div><div class="tile-v">${esc(display(f, v))}</div></div>`;
}
function sectionKarte(s, data) {
  const kacheln = s.felder.filter(f => f.top || !isEmpty(f, getPath(data, `${s.key}.${f.k}`)))
    .map(f => ({ f, v: getPath(data, `${s.key}.${f.k}`) }))
    .filter(x => !isEmpty(x.f, x.v));
  return `<section class="card">
    <header class="card-h"><h3>${esc(s.titel)}</h3><span class="sub">${esc(s.untertitel)}</span></header>
    ${kacheln.length ? `<div class="tiles">${kacheln.map(x => kachel(x.f, x.v)).join('')}</div>` : '<p class="muted small">Noch nichts eingetragen.</p>'}
  </section>`;
}
function modusKurz(m, md) {
  const teile = [];
  for (const f of BOSCH_FELDER) {
    if (['verfuegbar', 'kiox_pos', 'notiz', 'drivetrain_stufe'].includes(f.k)) continue;
    if (f.nur && !f.nur.includes(m)) continue;
    const v = md[f.k];
    if (isEmpty(f, v)) continue;
    const kurz = { unterstuetzung: 'Unterst.', dynamik: 'Dyn.', max_drehmoment_nm: '', max_geschwindigkeit_kmh: 'bis', extended_boost: 'Boost', drivetrain_tensioner: 'DT' }[f.k];
    teile.push(`${kurz ? kurz + ' ' : ''}${display(f, v)}`);
  }
  return teile.join(' · ');
}
function boschKarte(data) {
  const modi = (data.bosch && data.bosch.modi) || {};
  const liste = kioxListe(data);
  const weitere = BOSCH_MODI.filter(m => modi[m] && modi[m].verfuegbar && !modi[m].kiox_pos);
  const g = (data.bosch && data.bosch.global) || {};
  const globalInfo = BOSCH_GLOBAL.filter(f => !isEmpty(f, g[f.k])).map(f => `${f.l}: ${display(f, g[f.k])}`);
  const zeile = (m, pos) => `<li><span class="pos">${pos ?? '·'}</span><span class="mode">${esc(m)}</span><span class="mode-d">${esc(modusKurz(m, modi[m] || {})) || '<span class="muted">keine Werte</span>'}</span></li>`;
  return `<section class="card span2">
    <header class="card-h"><h3>Bosch Performance Line CX</h3><span class="sub">Fahrmodi · Kiox 400C</span></header>
    ${liste.length ? `<div class="eyebrow">Auf dem Kiox</div><ol class="modes">${liste.map(x => zeile(x.m, x.pos)).join('')}</ol>` : '<p class="muted small">Noch keine Kiox-Favoriten eingetragen.</p>'}
    ${weitere.length ? `<div class="eyebrow">Weitere Modi</div><ol class="modes">${weitere.map(m => zeile(m, null)).join('')}</ol>` : ''}
    ${globalInfo.length ? `<p class="small muted">${esc(globalInfo.join(' · '))}</p>` : ''}
  </section>`;
}
function viewAktiv() {
  const s = aktivesSetup();
  if (!s) {
    return `<section class="card hero empty">
      <div class="eyebrow">Noch kein Setup</div>
      <h2>Trag zuerst die Übergabe-Werte ein</h2>
      <p class="muted">Luftdruck, Sag und Klicks, die Multicycle bei der Übergabe eingestellt hat, dazu Reifendruck, Sattelhöhe und deine Bosch-Modi. Das ist deine Basis für alle Änderungen.</p>
      <div class="actions"><button class="btn primary" data-act="neu" data-anlass="Übergabe">Basis-Setup anlegen</button></div>
      ${backendOk() ? '' : '<p class="small muted">Tipp: Unter „Mehr“ das Backend verbinden, dann landen die Daten auch im Google Sheet und in Home Assistant.</p>'}
    </section>`;
  }
  const d = s.data;
  const kontext = SECTIONS.find(x => x.key === 'kontext');
  const hatKontext = kontext.felder.some(f => !isEmpty(f, getPath(d, `kontext.${f.k}`)));
  return `<section class="card hero">
      <div class="eyebrow">Aktives Setup</div>
      <h2>${esc(d.name || 'ohne Namen')}</h2>
      <div class="meta">seit ${esc(fmtDate(d.aktiviert_am || s.created))}${d.anlass ? ` · ${esc(d.anlass)}` : ''}</div>
      ${d.notiz ? `<p class="note">${esc(d.notiz)}</p>` : ''}
      <div class="actions">
        <button class="btn primary" data-act="neu">Anpassen</button>
        <button class="btn" data-view-go="ki">KI-Tipp holen</button>
      </div>
    </section>
    <div class="grid">
      ${SECTIONS.filter(x => x.key !== 'kontext').map(x => sectionKarte(x, d)).join('')}
      ${boschKarte(d)}
      ${hatKontext ? sectionKarte(kontext, d) : ''}
    </div>`;
}

function viewKi() {
  const s = aktivesSetup();
  const k = ui.ki;
  const erg = k.ergebnis && store.records[k.ergebnis];
  const ohneBackend = !backendOk();
  return `<section class="card">
      <div class="eyebrow">KI-Tipp</div>
      <h2>Wie fährt sich's?</h2>
      <p class="muted small">Beschreib, was dir aufgefallen ist. Claude bekommt dein aktives Setup und den Verlauf und schlägt <strong>eine</strong> Änderung vor – du entscheidest, ob du sie übernimmst.</p>
      ${!s ? '<p class="warnbox">Erst ein Setup anlegen – ohne Ausgangswerte kann Claude nichts Sinnvolles vorschlagen.</p>' : ''}
      <div class="chips">${CHIPS.map(c => `<button type="button" class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <label class="lbl" for="ki-text">Deine Rückmeldung</label>
      <textarea id="ki-text" rows="4" placeholder="z. B. Gabel vorne zu hart, bockt auf Wurzeln, Federweg wird nicht genutzt">${esc(k.text)}</textarea>
      <div class="row2">
        <div><label class="lbl" for="ki-untergrund">Bedingungen</label>
          <select id="ki-untergrund"><option value="">–</option>${['trocken', 'feucht', 'nass', 'Schlamm', 'Schnee/Eis'].map(o => `<option ${k.untergrund === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div><label class="lbl" for="ki-strecke">Strecke</label><input id="ki-strecke" type="text" value="${esc(k.strecke)}" placeholder="optional"></div>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="ki" ${!s || k.laden ? 'disabled' : ''}>${k.laden ? '<span class="spin"></span> Claude denkt nach …' : (ohneBackend || !navigator.onLine ? 'Rückmeldung speichern' : 'KI-Tipp holen')}</button>
      </div>
      ${ohneBackend ? '<p class="small muted">Ohne Backend wird nur die Rückmeldung gespeichert. Einrichten unter „Mehr“.</p>' : ''}
      ${k.fehler ? `<p class="errbox">KI-Anfrage fehlgeschlagen: ${esc(k.fehler)}<br><span class="small">Die Rückmeldung ist gespeichert – du kannst es im Verlauf erneut versuchen.</span></p>` : ''}
    </section>
    ${erg ? ergebnisKarte(erg) : ''}`;
}

function ergebnisKarte(fb) {
  const ki = fb.data.ki || {};
  const s = aktivesSetup();
  const probe = wendeAn(clone(s ? s.data : {}), ki.aenderungen);
  const uebernehmbar = probe.some(x => x.ok);
  const status = fb.data.status;
  return `<section class="card result">
    <div class="eyebrow">Vorschlag von Claude${ki.modell ? ` · ${esc(ki.modell)}` : ''}</div>
    ${ki.warnung ? `<p class="errbox"><strong>Achtung:</strong> ${esc(ki.warnung)}</p>` : ''}
    <p class="lead">${esc(ki.diagnose || '')}</p>
    ${probe.length ? `<h3>Änderung</h3><ul class="changes">${probe.map(x => `<li class="${x.ok ? '' : 'nok'}">
        <div class="ch-h"><strong>${esc(x.f ? x.f.label : x.pfad)}</strong>${x.ok ? `<span class="ch-v">${esc(x.von)} → <b>${esc(x.neu)}</b></span>` : `<span class="ch-v">→ ${esc(x.nach)}</span>`}</div>
        <div class="small">${esc(x.begruendung || '')}</div>
        ${x.ok ? '' : `<div class="small warntext">Nicht automatisch übernehmbar: ${esc(x.grund)}</div>`}
      </li>`).join('')}</ul>` : '<p class="muted">Keine konkrete Änderung – siehe Rückfragen.</p>'}
    ${ki.test ? `<h3>So testest du</h3><p>${esc(ki.test)}</p>` : ''}
    ${(ki.rueckfragen || []).length ? `<h3>Rückfragen</h3><ul class="qs">${ki.rueckfragen.map(q => `<li>${esc(q)}</li>`).join('')}</ul><p class="small muted">Antwort über „Neue Rückmeldung“ schreiben – Claude sieht den Verlauf.</p>` : ''}
    ${status === 'offen' ? `<div class="actions">
      ${uebernehmbar ? `<button class="btn primary" data-act="uebernehmen" data-id="${fb.id}">Übernehmen &amp; prüfen</button>` : ''}
      <button class="btn" data-act="verwerfen" data-id="${fb.id}">Verwerfen</button>
      <button class="btn ghost" data-act="ki-neu">Neue Rückmeldung</button>
    </div>` : `<p class="small muted">Status: ${esc(status)}</p><div class="actions"><button class="btn ghost" data-act="ki-neu">Neue Rückmeldung</button></div>`}
  </section>`;
}

function viewVerlauf() {
  const ss = setups();
  const fbs = feedbacks();
  if (!ss.length && !fbs.length) return '<section class="card"><h2>Verlauf</h2><p class="muted">Noch keine Einträge.</p></section>';
  const aktiv = aktivesSetup();
  const items = [...ss.map(r => ({ typ: 's', r })), ...fbs.map(r => ({ typ: 'f', r }))].sort((a, b) => b.r.created.localeCompare(a.r.created));
  return `<h2 class="pagetitle">Verlauf</h2><div class="timeline">${items.map(it => it.typ === 's' ? verlaufSetup(it.r, aktiv) : verlaufFeedback(it.r)).join('')}</div>`;
}
function verlaufSetup(r, aktiv) {
  const vor = vorgaenger(r);
  const d = diff(vor ? vor.data : null, r.data);
  const istAktiv = aktiv && aktiv.id === r.id;
  const zeigen = vor ? d : [];
  return `<article class="tl-item setup${istAktiv ? ' is-active' : ''}">
    <div class="tl-dot"></div>
    <div class="tl-body">
      <div class="tl-h"><span class="tl-date">${esc(fmtDate(r.created))}</span>${istAktiv ? '<span class="badge ok">aktiv</span>' : ''}${r.data.anlass ? `<span class="badge">${esc(r.data.anlass)}</span>` : ''}</div>
      <h3>${esc(r.data.name || 'ohne Namen')}</h3>
      ${r.data.notiz ? `<p class="small">${esc(r.data.notiz)}</p>` : ''}
      ${vor ? (zeigen.length ? `<ul class="diff">${zeigen.slice(0, 12).map(x => `<li><span>${esc(x.f.label)}</span><span>${esc(x.von)} → <b>${esc(x.nach)}</b></span></li>`).join('')}${zeigen.length > 12 ? `<li class="muted">… ${zeigen.length - 12} weitere</li>` : ''}</ul>` : '<p class="small muted">Keine Werte geändert.</p>') : `<p class="small muted">Basis-Setup · ${d.length} Werte</p>`}
      <div class="actions sm">
        ${istAktiv ? '' : `<button class="btn sm" data-act="aktivieren" data-id="${r.id}">Aktivieren</button>`}
        <button class="btn sm" data-act="als-basis" data-id="${r.id}">Als Basis bearbeiten</button>
        <button class="btn sm ghost danger" data-act="loeschen" data-id="${r.id}">Löschen</button>
      </div>
    </div>
  </article>`;
}
function verlaufFeedback(r) {
  const d = r.data;
  const ki = d.ki;
  return `<article class="tl-item feedback">
    <div class="tl-dot"></div>
    <div class="tl-body">
      <div class="tl-h"><span class="tl-date">${esc(fmtDate(r.created))}</span><span class="badge ${d.status === 'übernommen' ? 'ok' : d.status === 'ohne KI' ? 'warn' : ''}">${esc(d.status || '')}</span></div>
      <p class="quote">„${esc(d.text)}“</p>
      ${ki ? `<p class="small"><strong>Claude:</strong> ${esc(ki.diagnose || '')}</p>
        ${(ki.aenderungen || []).length ? `<ul class="diff">${ki.aenderungen.map(a => `<li><span>${esc((FIELD_MAP.get(a.pfad) || { label: a.pfad }).label)}</span><span>→ <b>${esc(a.nach)}${a.einheit ? ' ' + esc(a.einheit) : ''}</b></span></li>`).join('')}</ul>` : ''}` : (d.fehler ? `<p class="small warntext">${esc(d.fehler)}</p>` : '')}
      <div class="actions sm">
        ${d.status === 'ohne KI' ? `<button class="btn sm" data-act="ki-nachholen" data-id="${r.id}">KI-Tipp holen</button>` : ''}
        ${d.status === 'offen' ? `<button class="btn sm" data-act="ki-zeigen" data-id="${r.id}">Vorschlag ansehen</button>` : ''}
        <button class="btn sm ghost danger" data-act="loeschen" data-id="${r.id}">Löschen</button>
      </div>
    </div>
  </article>`;
}

function viewMehr() {
  const p = profil();
  const n = store.queue.length;
  return `<h2 class="pagetitle">Mehr</h2>
  <section class="card">
    <header class="card-h"><h3>Backend (Google Apps Script)</h3><span class="sub">Speicher im Google Sheet, KI-Tipps, Home Assistant</span></header>
    <label class="lbl" for="set-url">Web-App-URL</label>
    <input id="set-url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(store.settings.url)}" autocomplete="off">
    <label class="lbl" for="set-token">Token</label>
    <input id="set-token" type="password" placeholder="APP_TOKEN aus dem Apps Script" value="${esc(store.settings.token)}" autocomplete="off">
    <div class="actions">
      <button class="btn primary" data-act="settings-save">Speichern &amp; testen</button>
      <button class="btn" data-act="sync-now" ${backendOk() ? '' : 'disabled'}>Jetzt abgleichen</button>
    </div>
    <p class="small muted">${backendOk() ? `Letzter Abgleich: ${esc(fmtDate(store.meta.lastSync))} · ${n} ausstehend` : 'Nicht verbunden – alles bleibt nur auf diesem Gerät.'}</p>
    ${store.meta.lastError ? `<p class="errbox small">${esc(store.meta.lastError)}</p>` : ''}
  </section>
  <section class="card">
    <header class="card-h"><h3>Profil</h3><span class="sub">Grundlage für Sag-Rechner, Warnungen und KI</span></header>
    <div class="form" id="profil-form">
      ${PROFIL_FELDER.map(f => `<div class="frow"><div class="flabel"><label>${esc(f.l)}</label></div>
        ${stepper(`profil.${f.k}`, p[f.k], { u: f.u, btn: f.btn }, '')}</div>`).join('')}
    </div>
    <div class="actions"><button class="btn primary" data-act="profil-save">Profil speichern</button></div>
  </section>
  <section class="card">
    <header class="card-h"><h3>Daten</h3><span class="sub">Sicherung als JSON</span></header>
    <div class="actions">
      <button class="btn" data-act="export">Exportieren</button>
      <label class="btn">Importieren<input type="file" id="import-file" accept="application/json" hidden></label>
    </div>
  </section>
  <section class="card">
    <header class="card-h"><h3>Konventionen</h3></header>
    <ul class="small plain">
      <li><strong>Klicks</strong> immer von ganz zu zählen: im Uhrzeigersinn ganz eindrehen = 0, dann gegen den Uhrzeigersinn zählen.</li>
      <li><strong>Vorne</strong> = Gabel, <strong>hinten</strong> = Dämpfer.</li>
      <li>Reifendruck in <strong>bar</strong>, Fahrwerk in <strong>psi</strong>.</li>
      <li>Jede Änderung wird als neue Version gespeichert – alte Stände bleiben erhalten.</li>
    </ul>
    <p class="small muted">Version ${APP_VERSION}</p>
  </section>`;
}

/* ---------- Editor ---------- */
function stepper(path, val, f, cls) {
  const step = f.btn || 1;
  return `<div class="stepper${cls || ''}">
    <button type="button" class="step" data-dir="-1" aria-label="weniger">−</button>
    <input type="text" inputmode="decimal" data-path="${esc(path)}" data-kind="num" data-step="${step}" value="${esc(fmtInput(val))}" placeholder="–" autocomplete="off">
    ${f.u ? `<span class="suffix">${esc(f.u)}</span>` : ''}
    <button type="button" class="step" data-dir="1" aria-label="mehr">+</button>
  </div>`;
}
function control(f, val, hl) {
  const p = f.path;
  const cls = hl && hl.has(p) ? ' changed' : '';
  switch (f.t) {
    case 'num': return stepper(p, val, f, cls);
    case 'unit': {
      const e = (val && val.einheit) || UNITS[0];
      return `<div class="unit-row">${stepper(`${p}.wert`, val ? val.wert : null, { btn: 1 }, cls)}
        <select data-path="${esc(p)}.einheit" data-kind="text" aria-label="Einheit">${UNITS.map(u => `<option ${u === e ? 'selected' : ''}>${u}</option>`).join('')}</select></div>`;
    }
    case 'select': return `<select class="${cls.trim()}" data-path="${esc(p)}" data-kind="${f.kind || 'text'}"><option value="">–</option>${f.opt.map(o => `<option value="${esc(o)}" ${String(val ?? '') === String(o) ? 'selected' : ''}>${esc(f.k === 'kiox_pos' ? 'Platz ' + o : o)}</option>`).join('')}</select>`;
    case 'bool': return `<label class="switch"><input type="checkbox" data-path="${esc(p)}" data-kind="bool" ${val ? 'checked' : ''}><span class="track"></span><span>${val ? 'ja' : 'nein'}</span></label>`;
    default: return `<input type="text" class="${cls.trim()}" data-path="${esc(p)}" data-kind="text" value="${esc(val ?? '')}" placeholder="${esc(f.ph || '')}">`;
  }
}
function frow(f, data, hl) {
  let hint = f.hint || '';
  if (f.ziel) hint = `Ziel laut Profil: ${fmtNum(profilWert(f.ziel))} %`;
  return `<div class="frow${f.t === 'bool' ? ' frow-bool' : ''}${f.t === 'text' || f.t === 'unit' ? ' frow-wide' : ''}">
    <div class="flabel"><label>${esc(f.l)}</label></div>
    ${control(f, getPath(data, f.path), hl)}
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
    <div class="warn" data-warn-for="${esc(f.path)}"></div>
  </div>`;
}
function modusInfo(m) {
  const t = [];
  if (MODI_600.includes(m)) t.push('bis 600 % Unterstützung bis 15 km/h (Upgrade 2.0)');
  if (MODI_DT.includes(m)) t.push('Drivetrain Tensioner verfügbar');
  if (MODI_BOOST_STANDARD.includes(m)) t.push('Extended Boost ab Werk mit Standardlänge');
  return t.join(' · ');
}
function editorHtml(e) {
  const d = e.data;
  const hl = e.hl || new Set();
  const sec = s => `<details class="card fsec" ${s.key === 'kontext' ? '' : 'open'}>
      <summary><span><strong>${esc(s.titel)}</strong><span class="sub">${esc(s.untertitel)}</span></span></summary>
      <div class="form">${s.felder.map(f => frow(FIELD_MAP.get(`${s.key}.${f.k}`), d, hl)).join('')}</div>
    </details>`;
  const modusBlock = m => {
    const md = getPath(d, `bosch.modi.${m}`) || {};
    const fl = FIELDS.filter(f => f.modus === m);
    const offen = md.verfuegbar || md.kiox_pos || fl.some(f => hl.has(f.path));
    return `<details class="modus${md.verfuegbar ? '' : ' off'}" ${offen ? 'open' : ''} data-modus="${esc(m)}">
      <summary><span class="mode">${esc(m)}</span><span class="mode-s">${md.kiox_pos ? `Kiox ${md.kiox_pos}` : (md.verfuegbar ? 'verfügbar' : '')}</span></summary>
      <p class="small muted">${esc(modusInfo(m))}</p>
      <div class="form">${fl.map(f => frow(f, d, hl)).join('')}</div>
    </details>`;
  };
  return `<div class="editor">
    <h2 class="pagetitle">${e.titel}</h2>
    <section class="card">
      <div class="form">
        <div class="frow frow-wide"><div class="flabel"><label for="ed-name">Name</label></div><input id="ed-name" type="text" value="${esc(e.name || '')}" placeholder="leer = automatisch aus den Änderungen"></div>
        <div class="frow"><div class="flabel"><label for="ed-anlass">Anlass</label></div><select id="ed-anlass">${ANLAESSE.map(a => `<option ${a === e.anlass ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="frow frow-wide"><div class="flabel"><label for="ed-notiz">Notiz</label></div><textarea id="ed-notiz" rows="2" placeholder="optional">${esc(e.notiz || '')}</textarea></div>
      </div>
    </section>
    ${SECTIONS.filter(s => s.key !== 'kontext').map(sec).join('')}
    <details class="card fsec" open>
      <summary><span><strong>Bosch Performance Line CX</strong><span class="sub">Fahrmodi, Kiox-Favoriten, Upgrade 2.0</span></span></summary>
      <div class="form">${BOSCH_GLOBAL.map(f => frow(FIELD_MAP.get(`bosch.global.${f.k}`), d, hl)).join('')}</div>
      <p class="kiox-live small" id="kiox-live"></p>
      <p class="small muted">Häkchen bei „verfügbar“ für jeden Modus, den dein Rad in der Flow App anbietet. Den Platz auf dem Kiox vergibst du für die Modi, die du am Display durchschaltest. Unterstützung, Dynamik und Boost trägst du so ein, wie die App sie anzeigt (Stufe oder %).</p>
      <div class="modi">${BOSCH_MODI.map(modusBlock).join('')}</div>
    </details>
    ${sec(SECTIONS.find(s => s.key === 'kontext'))}
    <div class="savebar">
      <button class="btn ghost" data-act="ed-abbrechen">Abbrechen</button>
      <button class="btn primary" data-act="ed-speichern">Speichern &amp; aktivieren</button>
    </div>
  </div>`;
}
function openEditor(opts) {
  const basis = opts.data ? clone(opts.data) : {};
  ui.editor = { titel: opts.titel || 'Neues Setup', data: basis, name: opts.name || '', anlass: opts.anlass || 'Anpassung', notiz: opts.notiz || '', hl: opts.hl || null, feedbackId: opts.feedbackId || null, dirty: false, ausgangsdaten: clone(opts.vergleich || opts.data || {}) };
  ui.view = 'editor';
  render();
  $('#view').innerHTML = editorHtml(ui.editor);
  updateWarnings();
  window.scrollTo(0, 0);
}
function readForm(root) {
  const data = {};
  $$('[data-path]', root).forEach(el => {
    const kind = el.dataset.kind;
    let v;
    if (kind === 'num') v = parseNum(el.value);
    else if (kind === 'int') v = el.value === '' ? null : parseInt(el.value, 10);
    else if (kind === 'bool') v = el.checked;
    else v = el.value.trim() === '' ? null : el.value.trim();
    setPath(data, el.dataset.path, v);
  });
  return data;
}
function autoVerfuegbar(el) {
  const det = el.closest('details.modus');
  if (!det || el.dataset.kind === 'bool') return;
  const leer = el.dataset.kind === 'num' ? parseNum(el.value) === null : !String(el.value || '').trim();
  if (leer || /\.einheit$/.test(el.dataset.path || '')) return;
  const cb = det.querySelector('input[data-kind="bool"]');
  if (cb && !cb.checked) { cb.checked = true; const lab = cb.parentElement.querySelector('span:last-child'); if (lab) lab.textContent = 'ja'; }
}
function updateWarnings() {
  const root = $('.editor');
  if (!root) return;
  const data = readForm(root);
  const w = warnungen(data);
  $$('[data-warn-for]', root).forEach(el => { const t = w[el.dataset.warnFor] || ''; el.textContent = t; el.classList.toggle('on', !!t); });
  const kl = $('#kiox-live');
  if (kl) kl.innerHTML = kioxText(data) ? `<strong>Kiox:</strong> ${esc(kioxListe(data).map(x => `${x.pos}. ${x.m}`).join(' · '))}` : '<span class="muted">Noch keine Kiox-Plätze vergeben.</span>';
  $$('details.modus', root).forEach(det => {
    const m = det.dataset.modus;
    const vf = getPath(data, `bosch.modi.${m}.verfuegbar`), pos = getPath(data, `bosch.modi.${m}.kiox_pos`);
    det.classList.toggle('off', !vf);
    det.querySelector('.mode-s').textContent = pos ? `Kiox ${pos}` : (vf ? 'verfügbar' : '');
  });
}
function speichereEditor() {
  const root = $('.editor');
  const data = readForm(root);
  // Bosch-Modi ohne jeden Eintrag nicht mitschleppen
  if (data.bosch && data.bosch.modi) {
    for (const m of BOSCH_MODI) {
      const md = data.bosch.modi[m];
      const leer = FIELDS.filter(f => f.modus === m).every(f => isEmpty(f, getPath(data, f.path)));
      if (leer) delete data.bosch.modi[m];
      else if (md && (md.kiox_pos || FIELDS.some(f => f.modus === m && f.k !== 'verfuegbar' && !isEmpty(f, getPath(data, f.path))))) md.verfuegbar = true;
    }
  }
  const w = warnungen(data);
  const harte = Object.entries(w).filter(([k]) => k.endsWith('druck_psi') || k.endsWith('kiox_pos'));
  if (harte.length && !confirm(`Bitte prüfen:\n${harte.map(([k, t]) => `• ${(FIELD_MAP.get(k) || { label: k }).label}: ${t}`).join('\n')}\n\nTrotzdem speichern?`)) return;
  const vorher = aktivesSetup();
  const d = diff(vorher ? vorher.data : null, data);
  data.name = $('#ed-name').value.trim() || (vorher ? autoName(d) : 'Basis-Setup');
  data.anlass = $('#ed-anlass').value;
  data.notiz = $('#ed-notiz').value.trim() || null;
  data.aktiviert_am = nowIso();
  const rec = { id: uid('s'), typ: 'setup', created: nowIso(), data };
  putRecord(rec);
  if (ui.editor.feedbackId && store.records[ui.editor.feedbackId]) {
    const fb = store.records[ui.editor.feedbackId];
    fb.data.status = 'übernommen';
    fb.data.neues_setup_id = rec.id;
    putRecord(fb);
    ui.ki = { text: '', untergrund: '', strecke: '', laden: false, ergebnis: null, fehler: null, feedbackId: null };
  }
  ui.editor = null;
  ui.view = 'aktiv';
  render();
  window.scrollTo(0, 0);
  toast(vorher ? `Gespeichert · ${d.length} Änderung${d.length === 1 ? '' : 'en'} · jetzt aktiv` : 'Basis-Setup gespeichert');
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, typ = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${typ}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4200);
}

/* =========================================================
   Events
   ========================================================= */
function goto(view) {
  if (ui.view === 'editor' && ui.editor && ui.editor.dirty && !confirm('Änderungen im Editor verwerfen?')) return;
  if (ui.view === 'editor') ui.editor = null;
  ui.view = view;
  render();
  window.scrollTo(0, 0);
}

document.addEventListener('click', async ev => {
  const nav = ev.target.closest('[data-view]');
  if (nav && nav.closest('.nav')) { goto(nav.dataset.view); return; }
  const go = ev.target.closest('[data-view-go]');
  if (go) { goto(go.dataset.viewGo); return; }
  if (ev.target.closest('#sync')) { if (backendOk()) sync(); else goto('mehr'); return; }

  const stepBtn = ev.target.closest('.step');
  if (stepBtn) {
    const inp = stepBtn.parentElement.querySelector('input');
    const step = parseFloat(inp.dataset.step) || 1;
    const cur = parseNum(inp.value);
    const neu = round2((cur === null ? 0 : cur) + Number(stepBtn.dataset.dir) * step);
    inp.value = fmtInput(neu);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const chip = ev.target.closest('[data-chip]');
  if (chip) {
    const ta = $('#ki-text');
    ta.value = ta.value.trim() ? `${ta.value.trim()}; ${chip.dataset.chip}` : chip.dataset.chip;
    ui.ki.text = ta.value;
    ta.focus();
    return;
  }

  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act, id = btn.dataset.id;
  switch (act) {
    case 'neu': {
      const s = aktivesSetup();
      openEditor({ titel: s ? 'Setup anpassen' : 'Basis-Setup', data: s ? s.data : {}, anlass: btn.dataset.anlass || (s ? 'Anpassung' : 'Übergabe') });
      break;
    }
    case 'als-basis': {
      const r = store.records[id];
      openEditor({ titel: 'Neue Version auf Basis', data: r.data, anlass: 'Anpassung', notiz: '' });
      break;
    }
    case 'aktivieren': {
      const r = store.records[id];
      r.data.aktiviert_am = nowIso();
      putRecord(r);
      render();
      toast(`„${r.data.name}“ ist jetzt aktiv`);
      break;
    }
    case 'loeschen': {
      const r = store.records[id];
      if (!confirm(`Diesen Eintrag löschen?\n${r.typ === 'setup' ? r.data.name : r.data.text}`)) return;
      r.geloescht = true;
      putRecord(r);
      render();
      break;
    }
    case 'ed-abbrechen': goto('aktiv'); break;
    case 'ed-speichern': speichereEditor(); break;
    case 'ki': await kiAnfrage(); break;
    case 'ki-neu': ui.ki = { text: '', untergrund: '', strecke: '', laden: false, ergebnis: null, fehler: null, feedbackId: null }; render(); $('#ki-text') && $('#ki-text').focus(); break;
    case 'ki-nachholen': {
      const r = store.records[id];
      ui.ki = { text: r.data.text, untergrund: r.data.untergrund || '', strecke: r.data.strecke || '', laden: false, ergebnis: null, fehler: null, feedbackId: r.id };
      ui.view = 'ki';
      render();
      await kiAnfrage();
      break;
    }
    case 'ki-zeigen': {
      const r = store.records[id];
      ui.ki = { text: '', untergrund: '', strecke: '', laden: false, ergebnis: r.id, fehler: null, feedbackId: null };
      goto('ki');
      break;
    }
    case 'uebernehmen': {
      const fb = store.records[id];
      const s = aktivesSetup();
      const data = clone(s.data);
      const res = wendeAn(data, fb.data.ki.aenderungen);
      const ok = res.filter(x => x.ok);
      openEditor({ titel: 'KI-Vorschlag prüfen', data, anlass: 'KI-Vorschlag', name: '', notiz: `Rückmeldung: ${fb.data.text}`, hl: new Set(ok.map(x => x.f.path)), feedbackId: fb.id, vergleich: s.data });
      ui.editor.dirty = true;
      toast('Geänderte Felder sind markiert. Erst am Rad einstellen, dann speichern.');
      break;
    }
    case 'verwerfen': {
      const fb = store.records[id];
      fb.data.status = 'verworfen';
      putRecord(fb);
      ui.ki.ergebnis = null; ui.ki.feedbackId = null;
      render();
      break;
    }
    case 'settings-save': {
      const url = $('#set-url').value.trim(), token = $('#set-token').value.trim();
      if (url && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) { toast('Die URL muss mit https://script.google.com/macros/s/ beginnen und auf /exec enden.', 'err'); return; }
      store.settings = { url, token };
      store.meta.lastError = null;
      persist();
      if (!backendOk()) { render(); toast('Gespeichert – ohne URL und Token bleibt alles lokal.'); return; }
      btn.disabled = true; btn.textContent = 'Teste …';
      try {
        const j = await apiGet('ping');
        toast(`Verbunden · Backend ${j.version} · KI ${j.ki ? 'bereit (' + j.modell + ')' : 'ohne API-Key'}`, j.ki ? '' : 'err');
        await sync();
      } catch (e) {
        store.meta.lastError = e.message; persist();
        toast(`Verbindung fehlgeschlagen: ${e.message}`, 'err');
      }
      render();
      break;
    }
    case 'sync-now': await sync(); toast(store.meta.lastError ? `Fehler: ${store.meta.lastError}` : 'Abgeglichen', store.meta.lastError ? 'err' : ''); break;
    case 'profil-save': {
      const werte = readForm($('#profil-form')).profil || {};
      const rec = store.records.profil || { id: 'profil', typ: 'profil', created: nowIso(), data: {} };
      rec.data = werte;
      putRecord(rec);
      toast('Profil gespeichert');
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify({ app: 'carbon-gurke-setup', version: APP_VERSION, exportiert: nowIso(), records: Object.values(store.records) }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carbon-gurke-setup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      break;
    }
  }
});

document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.id === 'ki-text') { ui.ki.text = el.value; return; }
  if (el.id === 'ki-strecke') { ui.ki.strecke = el.value; return; }
  const root = el.closest('.editor');
  if (!root) return;
  ui.editor.dirty = true;
  autoVerfuegbar(el);
  // Sag-Rechner: mm → %
  const p = el.dataset.path;
  if (p === 'gabel.sag_mm' || p === 'daempfer.sag_mm') {
    const teil = p.split('.')[0];
    const hub = teil === 'gabel' ? profilWert('gabel_federweg_mm') : profilWert('daempfer_hub_mm');
    const mm = parseNum(el.value);
    const ziel = $(`[data-path="${teil}.sag_pct"]`, root);
    if (hub && mm !== null && ziel) ziel.value = fmtInput(Math.round(mm / hub * 1000) / 10);
  }
  updateWarnings();
});

document.addEventListener('change', async ev => {
  const el = ev.target;
  if (el.id === 'ki-untergrund') { ui.ki.untergrund = el.value; return; }
  if (el.id === 'import-file' && el.files && el.files[0]) {
    try {
      const j = JSON.parse(await el.files[0].text());
      const recs = Array.isArray(j.records) ? j.records : [];
      let n = 0;
      for (const r of recs) {
        if (!r || !r.id || !['setup', 'feedback', 'profil'].includes(r.typ)) continue;
        const lokal = store.records[r.id];
        if (!lokal || (r.updated || '') > (lokal.updated || '')) { store.records[r.id] = r; if (!store.queue.includes(r.id)) store.queue.push(r.id); n++; }
      }
      persist(); scheduleSync(200); render();
      toast(`${n} Einträge importiert`);
    } catch (e) { toast(`Import fehlgeschlagen: ${e.message}`, 'err'); }
    el.value = '';
    return;
  }
  if (el.closest('.editor')) {
    ui.editor.dirty = true;
    autoVerfuegbar(el);
    if (el.type === 'checkbox') { const lab = el.parentElement.querySelector('span:last-child'); if (lab) lab.textContent = el.checked ? 'ja' : 'nein'; }
    updateWarnings();
  }
});

window.addEventListener('online', () => { updateStatus(); scheduleSync(300); });
window.addEventListener('offline', updateStatus);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500); });
window.addEventListener('beforeunload', ev => { if (ui.view === 'editor' && ui.editor && ui.editor.dirty) { ev.preventDefault(); ev.returnValue = ''; } });

/* =========================================================
   Start
   ========================================================= */
loadStore();
render();
if (backendOk()) scheduleSync(300);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* ohne Offline-Cache weiter */ }));
}
