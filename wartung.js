'use strict';
/* Carbon-Gurke Setup – Wartung
   Aufgaben aus dem Wartungsplan (W01–W17), Fälligkeit nach km / Motorstunden / Zeit,
   Protokoll mit Messwerten für die HUK und Belegen (Google Drive über das Apps Script).
   Nutzt die globalen Helfer aus app.js. */

const WER_PRIVAT = 'Privat (selbst)';
const WER_OPTIONEN = ['Multicycle Weiterstadt', "Michel's Bike Shop", WER_PRIVAT, 'Andere'];
const WERKSTAETTEN = ['Multicycle Weiterstadt', "Michel's Bike Shop", 'Andere'];
const werStandard = a => (a && !a.werkstatt ? WER_PRIVAT : 'Multicycle Weiterstadt');
const werNormal = w => (w === 'Gregor' ? WER_PRIVAT : w); // Einträge vor v1.2.2
const BELEG_TYPEN = ['Rechnung', 'Bosch-Diagnoseprotokoll', 'Serviceheft (Foto)', 'Foto', 'Sonstiges'];
const FREIE_ARTEN = ['Reparatur', 'Teiletausch', 'Sturz / Unfall', 'Sonstiges'];
const BELEG_MAX_BYTES = 10 * 1024 * 1024;

const MESSWERTE = [
  { k: 'kette_pct', l: 'Kettenlängung', u: '%', btn: 0.05, grenze: { op: '>=', v: 0.8 }, hint: 'Tausch ab 0,8 % (SRAM T-Type)' },
  { k: 'belag_vorn_mm', l: 'Bremsbelag vorne', u: 'mm', btn: 0.1, grenze: { op: '<=', v: 3 }, hint: 'Belag + Trägerplatte · Tausch bei ≤ 3 mm (SRAM)' },
  { k: 'belag_hinten_mm', l: 'Bremsbelag hinten', u: 'mm', btn: 0.1, grenze: { op: '<=', v: 3 }, hint: 'Belag + Trägerplatte · Tausch bei ≤ 3 mm (SRAM)' },
  { k: 'scheibe_vorn_mm', l: 'Bremsscheibe vorne', u: 'mm', btn: 0.05, hint: 'min. 1,7 mm (2,0-mm-Scheibe) bzw. 1,55 mm (1,85-mm-Scheibe)' },
  { k: 'scheibe_hinten_mm', l: 'Bremsscheibe hinten', u: 'mm', btn: 0.05, hint: 'min. 1,7 mm (2,0-mm-Scheibe) bzw. 1,55 mm (1,85-mm-Scheibe)' },
];
const MESS_MAP = new Map(MESSWERTE.map(m => [m.k, m]));
const MESS_BREMSE = ['belag_vorn_mm', 'belag_hinten_mm'];
const MESS_SCHEIBE = ['scheibe_vorn_mm', 'scheibe_hinten_mm'];
const MESS_ALLE = MESSWERTE.map(m => m.k);

/* Quelle: claude/E-MTB_Wartungsplan.md (Stand 21.10.2026), Abschnitt 4, 5 und 8 – W18 ergänzt */
const AUFGABEN = [
  { id: 'W01', t: 'Erstinspektion', km: 200, monate: 2, einmalig: true, wer: 'Werkstatt', quelle: 'Cube', mess: MESS_ALLE, werkstatt: true, hinweis: 'Pflicht für die Garantie · Serviceheft stempeln · Bosch-Diagnoseprotokoll anfordern' },
  { id: 'W02', t: 'Inspektion inkl. Bosch-System', km: 2000, monate: 12, basisAuch: ['W01'], wer: 'Werkstatt', quelle: 'Cube, Bosch', mess: MESS_ALLE, werkstatt: true, hinweis: 'Serviceheft stempeln · Bosch-Diagnoseprotokoll anfordern' },
  { id: 'W03', t: 'Kette reinigen und schmieren', km: 200, wer: 'Gregor', quelle: 'Cube', hinweis: 'zusätzlich nach jeder Fahrt im Nassen oder im Sand' },
  { id: 'W04', t: 'Bremsbeläge kontrollieren', km: 400, wer: 'Gregor', quelle: 'Cube', mess: MESS_BREMSE },
  { id: 'W05', t: 'Kettenverschleiß messen', km: 500, wer: 'Gregor (ab Kettenlehre), sonst Werkstatt', quelle: 'Grenzwert SRAM · Intervall eigener Vorschlag', mess: ['kette_pct'], hinweis: 'Tausch über die Werkstatt mit Rechnung und Messwert (HUK)' },
  { id: 'W06', t: 'Service Gabel und Dämpfer', std: 125, monate: 12, wer: 'Werkstatt', quelle: 'Fox', werkstatt: true, hinweis: 'Motorstunden als Näherung für Fahrstunden (eigene Annahme)' },
  { id: 'W07', t: 'Bremsbeläge prüfen (≤ 3 mm)', monate: 1, wer: 'Gregor prüft · Tausch Werkstatt (HUK)', quelle: 'SRAM', mess: MESS_BREMSE, hinweis: 'bei Nässe und Schlamm öfter' },
  { id: 'W08', t: 'Bremsscheiben-Dicke messen', mitInspektion: true, wer: 'Werkstatt', quelle: 'SRAM', mess: MESS_SCHEIBE },
  { id: 'W09', t: 'Bremsen entlüften', monate: 24, wer: 'Multicycle in Jahr 1–2, danach Gregor', quelle: 'SRAM', werkstatt: true },
  { id: 'W10', t: 'Akku-Kontakte reinigen, leicht fetten', monate: 3, wer: 'Gregor', quelle: 'Bosch · Intervall eigener Vorschlag' },
  { id: 'W11', t: 'Flow+ läuft aus', fix: { feld: 'flowplus_datum', monate: 12 }, einmalig: true, vorlaufTage: 30, wer: 'Gregor', quelle: 'Bosch', hinweis: 'danach 39,99 €/Jahr oder 4,99 €/Monat, keine automatische Verlängerung' },
  { id: 'W12', t: 'Lenker und Vorbau tauschen', fix: { feld: 'uebergabe_datum', monate: 120 }, einmalig: true, vorlaufTage: 60, wer: 'Werkstatt', quelle: 'Cube', werkstatt: true, hinweis: 'sofort nach Sturz oder Unfall' },
  { id: 'W13', t: 'Batterie im AXS-Pod tauschen', ohneIntervall: true, wer: 'Gregor', quelle: 'SRAM', hinweis: 'wenn die AXS-App sie als schwach meldet' },
  { id: 'W14', t: 'Dichtmilch nachfüllen', wochen: 24, nurTubeless: true, wer: 'Gregor', quelle: 'Continental', hinweis: 'je nach Bedingungen alle 4–24 Wochen' },
  { id: 'W15', t: 'Akku-Ladestand prüfen (Lagerung)', fix: { feld: 'eingelagert_seit', monate: 6 }, einmalig: true, nurEingelagert: true, wer: 'Gregor', quelle: 'Bosch', hinweis: 'Ziel 30–60 %, Lagerung ideal 10–20 °C' },
  { id: 'W16', t: 'Rad im Lager bewegen', wochen: 3, nurEingelagert: true, start: 'eingelagert_seit', wer: 'Gregor', quelle: 'Cube', hinweis: 'alle 2–3 Wochen anheben, Räder und Kurbel rückwärts drehen' },
  { id: 'W17', t: 'HUK-Verschleißschutz endet – prüfen, ggf. kündigen', fix: { feld: 'rechnung_datum', monate: 36 }, einmalig: true, vorlaufTage: 61, wer: 'Gregor', quelle: 'HUK VFS A.3.2.2, B.2', hinweis: 'Kündigung spätestens 1 Monat vor Ende des Versicherungsjahres' },
  { id: 'W18', t: 'Dropper-Sattelstütze ausbauen, Mechanik reinigen und schmieren', monate: 12, wer: 'Werkstatt (mit der Inspektion)', quelle: 'ENDURO (allgemein) · Intervall eigener Vorschlag, CUBE-Angabe fehlt', werkstatt: true, hinweis: 'nach jeder Fahrt das Standrohr abwischen · Herstellerangabe in der Komponentenanleitung bei der Übergabe prüfen' },
];
const AUFGABE_MAP = new Map(AUFGABEN.map(a => [a.id, a]));

const TERMIN_FELDER = [
  { k: 'uebergabe_datum', l: 'Übergabe des Rads', hint: 'Start für Erstinspektion und alle Zeit-Intervalle' },
  { k: 'rechnung_datum', l: 'Rechnungsdatum', hint: 'Ende des HUK-Verschleißschutzes = + 3 Jahre' },
  { k: 'flowplus_datum', l: 'Flow+ aktiviert am', hint: 'läuft nach 12 Monaten aus' },
  { k: 'eingelagert_seit', l: 'Eingelagert seit', hint: 'leer = Rad in Benutzung' },
];
const TERMIN_LABEL = Object.fromEntries(TERMIN_FELDER.map(f => [f.k, f.l]));

const STATUS_TEXT = { ueberfaellig: 'überfällig', bald: 'bald fällig', unbekannt: 'Daten fehlen', ok: 'ok', info: 'Info', erledigt: 'erledigt', inaktiv: 'inaktiv' };
const STATUS_ORDNUNG = ['ueberfaellig', 'bald', 'unbekannt', 'ok', 'info', 'erledigt', 'inaktiv'];

/* ---------- Datum & Stand ---------- */
function heuteIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseTag(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function plusMonate(s, n) {
  const d = parseTag(s);
  if (!d) return null;
  const tag = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(tag, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}
function plusTage(s, n) {
  const d = parseTag(s);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return d;
}
const tageBis = d => Math.round((d - parseTag(heuteIso())) / 86400000);
const fmtTag = s => { const d = parseTag(s); return d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'; };
const fmtD = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtEur = n => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const wartungen = () => Object.values(store.records)
  .filter(r => r.typ === 'wartung' && !r.geloescht)
  .sort((a, b) => String(b.data.datum || '').localeCompare(String(a.data.datum || '')) || b.created.localeCompare(a.created));

function aktuellerStand() {
  const s = (store.records.stand && store.records.stand.data) || {};
  let km = parseNum(s.km), h = parseNum(s.motorstunden);
  for (const w of wartungen()) {
    if (w.data.km != null && (km === null || w.data.km > km)) km = w.data.km;
    if (w.data.motorstunden != null && (h === null || w.data.motorstunden > h)) h = w.data.motorstunden;
  }
  return { km, h, zeit: s.zeit || null, quelle: s.quelle || null, gemeldetKm: parseNum(s.km) };
}
function letzterEintrag(ids, nach) {
  return wartungen().find(w => ids.includes(w.data.aufgabe) && (!nach || String(w.data.datum || '') >= nach)) || null;
}

/* ---------- Fälligkeit ---------- */
function intervallText(a) {
  if (a.ohneIntervall) return 'ohne festes Intervall';
  if (a.mitInspektion) return 'bei jeder Inspektion';
  if (a.fix) return `${TERMIN_LABEL[a.fix.feld]} + ${a.fix.monate % 12 === 0 ? `${a.fix.monate / 12} ${a.fix.monate === 12 ? 'Jahr' : 'Jahre'}` : `${a.fix.monate} Monate`}`;
  if (a.monate === 1 && !a.km && !a.std) return 'jeden Monat';
  const t = [];
  if (a.km) t.push(`${fmtNum(a.km)} km`);
  if (a.std) t.push(`${fmtNum(a.std)} Fahrstunden`);
  if (a.monate) t.push(a.monate === 1 ? '1 Monat' : a.monate % 12 === 0 && a.monate > 12 ? `${a.monate / 12} Jahre` : `${a.monate} Monate`);
  if (a.wochen) t.push(`${a.wochen} Wochen`);
  return `${a.einmalig ? 'einmalig nach ' : 'alle '}${t.join(' oder ')}${t.length > 1 ? ' (was zuerst eintritt)' : ''}`;
}

function faelligkeit(a, ctx) {
  const t = ctx.termine;
  const res = { a, status: 'ok', text: '', zuletzt: null, rest: Infinity };
  if (a.nurTubeless && !ctx.tubeless) return { ...res, status: 'inaktiv', text: 'nur bei tubeless (laut aktivem Setup)' };
  if (a.nurEingelagert && !t.eingelagert_seit) return { ...res, status: 'inaktiv', text: 'nur während der Einlagerung' };
  const seit = a.nurEingelagert ? t.eingelagert_seit : null;
  const letzter = letzterEintrag([a.id, ...(a.basisAuch || [])], seit);
  res.zuletzt = letzterEintrag([a.id], seit);
  if (a.ohneIntervall) return { ...res, status: 'info', text: a.hinweis };
  if (a.mitInspektion) return { ...res, status: 'info', text: 'wird bei jeder Inspektion mitgemessen' };
  if (a.einmalig && res.zuletzt) return { ...res, status: 'erledigt', text: `erledigt am ${fmtTag(res.zuletzt.data.datum)}` };

  let restKm = null, restH = null, restTage = null, faelligAm = null;
  const fehlt = [];
  if (a.fix) {
    const basis = t[a.fix.feld];
    if (!basis) fehlt.push(TERMIN_LABEL[a.fix.feld]);
    else { faelligAm = plusMonate(basis, a.fix.monate); restTage = tageBis(faelligAm); }
  } else {
    const startDatum = letzter ? letzter.data.datum : t[a.start || 'uebergabe_datum'];
    if (a.km) {
      const startKm = letzter ? letzter.data.km : 0;
      if (startKm === null || startKm === undefined) fehlt.push('km im letzten Eintrag');
      else if (ctx.km === null) fehlt.push('aktueller km-Stand');
      else restKm = startKm + a.km - ctx.km;
    }
    if (a.std) {
      const startH = letzter ? letzter.data.motorstunden : 0;
      if (startH === null || startH === undefined) fehlt.push('Motorstunden im letzten Eintrag');
      else if (ctx.h === null) fehlt.push('Motorstunden');
      else restH = startH + a.std - ctx.h;
    }
    if (a.monate || a.wochen) {
      if (!startDatum) fehlt.push(TERMIN_LABEL[a.start || 'uebergabe_datum']);
      else { faelligAm = a.monate ? plusMonate(startDatum, a.monate) : plusTage(startDatum, a.wochen * 7); restTage = tageBis(faelligAm); }
    }
  }
  const intervallTage = (a.monate || 0) * 30 + (a.wochen || 0) * 7;
  const vorlauf = a.vorlaufTage ?? Math.min(14, Math.max(3, Math.round(intervallTage * 0.2)));
  const kmWarn = a.km ? Math.max(20, a.km * 0.1) : 0;
  const werte = [restKm, restH, restTage].filter(v => v !== null);
  const teile = [];
  if (restKm !== null) teile.push(restKm < 0 ? `${fmtNum(-restKm)} km drüber` : `in ${fmtNum(restKm)} km`);
  if (restH !== null) teile.push(restH < 0 ? `${fmtNum(round2(-restH))} h drüber` : `in ${fmtNum(round2(restH))} h`);
  if (restTage !== null) teile.push(restTage < 0 ? `seit ${-restTage} ${-restTage === 1 ? 'Tag' : 'Tagen'} (${fmtD(faelligAm)})` : restTage === 0 ? 'heute' : `in ${restTage} ${restTage === 1 ? 'Tag' : 'Tagen'} (${fmtD(faelligAm)})`);
  if (!werte.length) return { ...res, status: 'unbekannt', text: `fehlt: ${fehlt.join(', ')}` };
  const ueber = werte.some(v => v < 0);
  const bald = (restKm !== null && restKm <= kmWarn) || (restH !== null && restH <= 10) || (restTage !== null && restTage <= vorlauf);
  // Sortierschlüssel: kleinster relativer Rest
  const rel = [];
  if (restKm !== null) rel.push(restKm / a.km);
  if (restH !== null) rel.push(restH / a.std);
  if (restTage !== null) rel.push(restTage / Math.max(1, intervallTage || 365));
  return { ...res, status: ueber ? 'ueberfaellig' : bald ? 'bald' : 'ok', text: teile.join(' · ') + (fehlt.length ? ` · fehlt: ${fehlt.join(', ')}` : ''), rest: Math.min(...rel) };
}

function wartungCtx() {
  const s = aktuellerStand();
  const akt = aktivesSetup();
  return { km: s.km, h: s.h, termine: profil(), tubeless: !!(akt && akt.data.reifen && akt.data.reifen.system === 'Tubeless') };
}
function aufgabenStatus() {
  const ctx = wartungCtx();
  return AUFGABEN.map(a => faelligkeit(a, ctx))
    .sort((x, y) => STATUS_ORDNUNG.indexOf(x.status) - STATUS_ORDNUNG.indexOf(y.status) || x.rest - y.rest);
}

/* ---------- Anzeige ---------- */
function messText(m) {
  const teile = [];
  for (const def of MESSWERTE) {
    const v = m && m[def.k];
    if (v === null || v === undefined || v === '') continue;
    teile.push(`${def.l} ${fmtNum(v)} ${def.u}`);
  }
  return teile.join(' · ');
}
const sichereUrl = u => /^https:\/\/(drive|docs)\.google\.com\//.test(String(u || '')) ? u : null;
function belegLinks(belege) {
  if (!belege || !belege.length) return '';
  return `<ul class="belege">${belege.map(b => {
    const url = sichereUrl(b.url);
    const inhalt = `<span class="b-typ">${esc(b.typ || 'Beleg')}</span> ${esc(b.name || '')}`;
    return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${inhalt}</a>` : inhalt}</li>`;
  }).join('')}</ul>`;
}
function aufgabeTitel(d) {
  const a = AUFGABE_MAP.get(d.aufgabe);
  return d.titel || (a ? a.t : (d.aufgabe || '').replace(/^frei:/, '')) || 'Eintrag';
}
function wer(d) { return d.wer === 'Andere' ? (d.wer_frei || 'andere') : (werNormal(d.wer) || '–'); }

function taskKarte(st) {
  const a = st.a;
  const z = st.zuletzt;
  return `<article class="task st-${st.status}">
    <div class="task-h"><span class="tid">${a.id}</span><strong>${esc(a.t)}</strong><span class="pill st-${st.status}">${STATUS_TEXT[st.status]}</span></div>
    ${st.text ? `<div class="task-f">${esc(st.text)}</div>` : ''}
    <div class="small muted">${esc(intervallText(a))} · ${esc(a.wer)} · Quelle: ${esc(a.quelle)}</div>
    ${a.hinweis && st.status !== 'info' ? `<div class="small muted">${esc(a.hinweis)}</div>` : ''}
    ${z ? `<div class="small">zuletzt: ${esc(fmtTag(z.data.datum))}${z.data.km != null ? ` · ${esc(fmtNum(z.data.km))} km` : ''} · ${esc(wer(z.data))}</div>` : ''}
    ${st.status === 'inaktiv' ? '' : `<div class="actions sm"><button class="btn sm${['ueberfaellig', 'bald'].includes(st.status) ? ' primary' : ''}" data-wact="erledigt" data-aufgabe="${a.id}">Erledigt eintragen</button></div>`}
  </article>`;
}
function protokollEintrag(r) {
  const d = r.data;
  const a = AUFGABE_MAP.get(d.aufgabe);
  const meta = [wer(d)];
  if (d.km != null) meta.push(`${fmtNum(d.km)} km`);
  if (d.motorstunden != null) meta.push(`${fmtNum(d.motorstunden)} h`);
  if (d.kosten_eur != null) meta.push(fmtEur(d.kosten_eur));
  const mt = messText(d.messwerte);
  return `<article class="tl-item wlog">
    <div class="tl-dot"></div>
    <div class="tl-body">
      <div class="tl-h"><span class="tl-date">${esc(fmtTag(d.datum))}</span><span class="badge">${esc(a ? a.id : (d.aufgabe || '').replace(/^frei:/, ''))}</span>
        ${d.serviceheft ? '<span class="badge ok">Serviceheft</span>' : ''}${d.huk ? '<span class="badge warn">HUK</span>' : ''}${d.verschleissgrenze ? '<span class="badge warn">Verschleißgrenze</span>' : ''}</div>
      <h3>${esc(aufgabeTitel(d))}</h3>
      <div class="small muted">${esc(meta.join(' · '))}</div>
      ${mt ? `<div class="small">${esc(mt)}</div>` : ''}
      ${d.notiz ? `<p class="small">${esc(d.notiz)}</p>` : ''}
      ${belegLinks(d.belege)}
      <div class="actions sm"><button class="btn sm" data-wact="bearbeiten" data-id="${r.id}">Bearbeiten</button></div>
    </div>
  </article>`;
}

function viewWartung() {
  const s = aktuellerStand();
  const p = profil();
  const liste = aufgabenStatus();
  const dringend = liste.filter(x => ['ueberfaellig', 'bald', 'unbekannt'].includes(x.status));
  const ok = liste.filter(x => x.status === 'ok');
  const rest = liste.filter(x => ['info', 'erledigt', 'inaktiv'].includes(x.status));
  const log = wartungen();
  const quelle = s.zeit ? `${esc(s.quelle || 'manuell')} · ${esc(fmtDate(s.zeit))}` : 'noch nicht eingetragen';
  return `<h2 class="pagetitle">Wartung</h2>
  <section class="card">
    <header class="card-h"><h3>Stand</h3><span class="sub">${quelle}</span></header>
    <div class="tiles">
      <div class="tile"><div class="tile-l">Kilometerstand</div><div class="tile-v">${s.km !== null ? `${esc(fmtNum(s.km))} km` : '–'}</div></div>
      <div class="tile"><div class="tile-l">Motorstunden</div><div class="tile-v">${s.h !== null ? `${esc(fmtNum(s.h))} h` : '–'}</div></div>
    </div>
    <div id="stand-form" class="form" hidden>
      <div class="frow"><div class="flabel"><label>Kilometerstand</label></div>${stepper('km', s.gemeldetKm ?? s.km, { u: 'km', btn: 10, min: 0 }, '')}</div>
      <div class="frow"><div class="flabel"><label>Motorstunden</label></div>${stepper('motorstunden', s.h, { u: 'h', btn: 1, min: 0 }, '')}<span class="hint">aus Kiox oder Flow App · später automatisch aus Home Assistant</span></div>
      <div class="actions sm"><button class="btn sm primary" data-wact="stand-speichern">Stand speichern</button></div>
    </div>
    <div class="actions sm">
      <button class="btn sm" data-wact="stand-form">Stand eintragen</button>
      <button class="btn sm primary" data-wact="neu">+ Eintrag</button>
      <button class="btn sm" data-wact="bericht">Bericht / Drucken</button>
    </div>
    ${p.uebergabe_datum ? '' : '<p class="warnbox small">Übergabedatum fehlt – ohne Startdatum lassen sich die Zeit-Intervalle nicht berechnen. <button class="btn sm" data-view-go="mehr">Unter „Mehr → Termine“ eintragen</button></p>'}
  </section>
  ${dringend.length ? `<h3 class="sectitle">Jetzt dran</h3><div class="tasks">${dringend.map(taskKarte).join('')}</div>` : '<p class="okbox">Nichts fällig – alles im grünen Bereich.</p>'}
  ${ok.length ? `<h3 class="sectitle">Demnächst</h3><div class="tasks">${ok.map(taskKarte).join('')}</div>` : ''}
  ${rest.length ? `<details class="card fsec"><summary><span><strong>Ohne Intervall, erledigt, inaktiv</strong><span class="sub">${rest.length} Aufgaben</span></span></summary><div class="tasks pad">${rest.map(taskKarte).join('')}</div></details>` : ''}
  <h3 class="sectitle">Protokoll</h3>
  ${log.length ? `<div class="timeline">${log.map(protokollEintrag).join('')}</div>` : '<p class="muted small">Noch keine Einträge. Werkstatt-Arbeiten mit Rechnung und Serviceheft-Foto hier ablegen, Eigenarbeit ebenfalls.</p>'}`;
}

function wartungTeaser() {
  const liste = aufgabenStatus();
  const dran = liste.filter(x => ['ueberfaellig', 'bald'].includes(x.status));
  const naechste = liste.find(x => x.status === 'ok');
  if (!dran.length && !naechste) return '';
  return `<section class="card wteaser">
    <header class="card-h"><h3>Wartung</h3><button class="btn sm ghost" data-view-go="wartung">Alle Aufgaben</button></header>
    ${dran.length ? `<ul class="plain-list">${dran.slice(0, 3).map(x => `<li><span class="pill st-${x.status}">${STATUS_TEXT[x.status]}</span> <strong>${esc(x.a.t)}</strong> <span class="small muted">${esc(x.text)}</span></li>`).join('')}</ul>`
      : `<p class="small">Nichts fällig. Als Nächstes: <strong>${esc(naechste.a.t)}</strong> <span class="muted">${esc(naechste.text)}</span></p>`}
  </section>`;
}

/* ---------- Bericht ---------- */
function viewBericht() {
  const f = ui.bericht || (ui.bericht = { von: '', bis: '', nurHuk: false, nurWerkstatt: false });
  const liste = wartungen().filter(r => {
    const d = r.data;
    if (f.von && String(d.datum || '') < f.von) return false;
    if (f.bis && String(d.datum || '') > f.bis) return false;
    if (f.nurHuk && !d.huk) return false;
    if (f.nurWerkstatt && !WERKSTAETTEN.includes(d.wer)) return false;
    return true;
  }).reverse();
  const summe = liste.reduce((s, r) => s + (Number(r.data.kosten_eur) || 0), 0);
  return `<div class="bericht">
    <div class="no-print">
      <h2 class="pagetitle">Bericht</h2>
      <section class="card">
        <div class="row2">
          <div><label class="lbl" for="b-von">von</label><input type="date" id="b-von" value="${esc(f.von)}"></div>
          <div><label class="lbl" for="b-bis">bis</label><input type="date" id="b-bis" value="${esc(f.bis)}"></div>
        </div>
        <label class="check"><input type="checkbox" id="b-huk" ${f.nurHuk ? 'checked' : ''}> nur HUK-relevante Einträge</label>
        <label class="check"><input type="checkbox" id="b-werkstatt" ${f.nurWerkstatt ? 'checked' : ''}> nur Werkstatt</label>
        <div class="actions sm">
          <button class="btn sm primary" data-wact="drucken">Drucken / als PDF speichern</button>
          <button class="btn sm ghost" data-view-go="wartung">Zurück</button>
        </div>
      </section>
    </div>
    <section class="print-sheet">
      <h1>Wartungsprotokoll – Cube Stereo Hybrid ONE44 HPC TM 800</h1>
      <p class="small">Stand ${esc(fmtD(new Date()))}${f.von || f.bis ? ` · Zeitraum ${esc(f.von ? fmtTag(f.von) : 'Anfang')} bis ${esc(f.bis ? fmtTag(f.bis) : 'heute')}` : ''}${f.nurHuk ? ' · nur HUK-relevant' : ''}${f.nurWerkstatt ? ' · nur Werkstatt' : ''} · ${liste.length} Einträge</p>
      ${liste.length ? `<table class="ptable">
        <thead><tr><th>Datum</th><th>Arbeit</th><th>Ausgeführt von</th><th>km</th><th>Messwerte</th><th>Kosten</th><th>Belege</th></tr></thead>
        <tbody>${liste.map(r => {
          const d = r.data;
          const flags = [d.serviceheft ? 'Serviceheft gestempelt' : '', d.huk ? 'HUK-relevant' : '', d.verschleissgrenze ? 'Verschleißgrenze erreicht' : ''].filter(Boolean).join(', ');
          return `<tr>
            <td>${esc(fmtTag(d.datum))}</td>
            <td><strong>${esc(aufgabeTitel(d))}</strong>${flags ? `<div class="small">${esc(flags)}</div>` : ''}${d.notiz ? `<div class="small">${esc(d.notiz)}</div>` : ''}</td>
            <td>${esc(wer(d))}</td>
            <td>${d.km != null ? esc(fmtNum(d.km)) : '–'}</td>
            <td class="small">${esc(messText(d.messwerte)) || '–'}</td>
            <td>${d.kosten_eur != null ? esc(fmtEur(d.kosten_eur)) : '–'}</td>
            <td class="small">${(d.belege || []).map(b => sichereUrl(b.url) ? `<a href="${esc(b.url)}">${esc(b.typ || 'Beleg')}</a>` : esc(b.typ || 'Beleg')).join('<br>') || '–'}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="5">Summe</td><td>${esc(fmtEur(summe))}</td><td></td></tr></tfoot>
      </table>` : '<p>Keine Einträge im gewählten Zeitraum.</p>'}
    </section>
  </div>`;
}

/* ---------- Lesbare Form für das Sheet & KI ---------- */
function lesbarWartung(rec) {
  const d = rec.data || {};
  const a = AUFGABE_MAP.get(d.aufgabe);
  const out = {
    Wartungsdatum: d.datum ? fmtTag(d.datum) : '',
    Aufgabe: a ? `${a.id} ${a.t}` : (d.aufgabe || '').replace(/^frei:/, ''),
    Arbeit: aufgabeTitel(d),
    'Ausgeführt von': wer(d),
    'km-Stand': d.km ?? '',
    Motorstunden: d.motorstunden ?? '',
    'Kosten (€)': d.kosten_eur ?? '',
    Serviceheft: d.serviceheft ? 'ja' : '',
    'HUK-relevant': d.huk ? 'ja' : '',
    'Verschleißgrenze erreicht': d.verschleissgrenze ? 'ja' : '',
  };
  for (const m of MESSWERTE) out[`${m.l} (${m.u})`] = d.messwerte && d.messwerte[m.k] != null ? d.messwerte[m.k] : '';
  out.Belege = (d.belege || []).map(b => `${b.typ || 'Beleg'}: ${b.url || b.name || ''}`).join('\n');
  out.Notiz = d.notiz || '';
  return out;
}
function wartungKiText() {
  const liste = aufgabenStatus();
  const L = [];
  const w06 = liste.find(x => x.a.id === 'W06');
  if (w06) L.push(`- Service Gabel/Dämpfer (W06): ${w06.zuletzt ? `zuletzt ${fmtTag(w06.zuletzt.data.datum)}` : 'noch nie dokumentiert'} · ${STATUS_TEXT[w06.status]}${w06.text ? ` (${w06.text})` : ''}`);
  for (const x of liste.filter(y => y.status === 'ueberfaellig' && y.a.id !== 'W06')) L.push(`- überfällig: ${x.a.t} (${x.text})`);
  const s = aktuellerStand();
  if (s.km !== null) L.push(`- Kilometerstand ${fmtNum(s.km)} km${s.h !== null ? `, ${fmtNum(s.h)} Motorstunden` : ''}`);
  return L.length ? `WARTUNG\n${L.join('\n')}` : '';
}

/* ---------- Editor ---------- */
function wartungDefaults(aufgabe) {
  const a = AUFGABE_MAP.get(aufgabe);
  const s = aktuellerStand();
  return {
    aufgabe: aufgabe || 'frei:Reparatur', titel: '', datum: heuteIso(), km: s.km, motorstunden: s.h,
    wer: werStandard(a), wer_frei: null, kosten_eur: null,
    serviceheft: false, huk: false, verschleissgrenze: false, messwerte: {}, notiz: null, belege: [],
  };
}
function openWartungEditor(opts) {
  const rec = opts.id ? store.records[opts.id] : null;
  ui.wedit = {
    id: rec ? rec.id : uid('w'), neu: !rec, dirty: false, neueBelege: [], uploads: 0, grenzeBerührt: false,
    data: rec ? clone(rec.data) : wartungDefaults(opts.aufgabe),
  };
  ui.view = 'wartung-edit';
  render();
  zeichneWartungEditor();
  window.scrollTo(0, 0);
}
function aufgabenOptionen(sel) {
  const opt = (v, t) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`;
  return `<optgroup label="Wartungsplan">${AUFGABEN.map(a => opt(a.id, `${a.id} · ${a.t}`)).join('')}</optgroup>
    <optgroup label="Freier Eintrag">${FREIE_ARTEN.map(f => opt(`frei:${f}`, f)).join('')}</optgroup>`;
}
function zeichneWartungEditor() {
  const e = ui.wedit;
  const d = e.data;
  const a = AUFGABE_MAP.get(d.aufgabe);
  const messKeys = a && a.mess ? a.mess : [];
  const andereMess = MESS_ALLE.filter(k => !messKeys.includes(k));
  const messRow = k => {
    const m = MESS_MAP.get(k);
    return `<div class="frow"><div class="flabel"><label>${esc(m.l)}</label></div>${stepper(`messwerte.${k}`, d.messwerte ? d.messwerte[k] : null, { u: m.u, btn: m.btn, min: 0 }, '')}<span class="hint">${esc(m.hint)}</span><div class="warn" data-warn-for="messwerte.${k}"></div></div>`;
  };
  const boolRow = (k, l, hint) => `<div class="frow frow-bool"><div class="flabel"><label>${esc(l)}</label></div><label class="switch"><input type="checkbox" data-path="${k}" data-kind="bool" ${d[k] ? 'checked' : ''}><span class="track"></span><span>${d[k] ? 'ja' : 'nein'}</span></label>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;
  $('#view').innerHTML = `<div class="weditor">
    <h2 class="pagetitle">${e.neu ? 'Wartung eintragen' : 'Eintrag bearbeiten'}</h2>
    <section class="card">
      <div class="form">
        <div class="frow frow-wide"><div class="flabel"><label for="w-aufgabe">Aufgabe</label></div><select id="w-aufgabe" data-path="aufgabe" data-kind="text">${aufgabenOptionen(d.aufgabe)}</select>
          ${a ? `<span class="hint">${esc(intervallText(a))} · ${esc(a.wer)}${a.hinweis ? ` · ${esc(a.hinweis)}` : ''}</span>` : ''}</div>
        <div class="frow frow-wide"><div class="flabel"><label>Bezeichnung</label></div><input type="text" data-path="titel" data-kind="text" value="${esc(d.titel || '')}" placeholder="${esc(a ? a.t : 'z. B. Schaltauge getauscht')}"></div>
        <div class="frow"><div class="flabel"><label>Datum</label></div><input type="date" data-path="datum" data-kind="date" value="${esc(d.datum || '')}" required></div>
        <div class="frow"><div class="flabel"><label>Kilometerstand</label></div>${stepper('km', d.km, { u: 'km', btn: 10, min: 0 }, '')}</div>
        <div class="frow"><div class="flabel"><label>Motorstunden</label></div>${stepper('motorstunden', d.motorstunden, { u: 'h', btn: 1, min: 0 }, '')}</div>
        <div class="frow"><div class="flabel"><label>Ausgeführt von</label></div><select data-path="wer" data-kind="text" id="w-wer">${WER_OPTIONEN.map(o => `<option ${o === werNormal(d.wer) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
        <div class="frow frow-wide" id="w-wer-frei" ${d.wer === 'Andere' ? '' : 'hidden'}><div class="flabel"><label>Wer genau</label></div><input type="text" data-path="wer_frei" data-kind="text" value="${esc(d.wer_frei || '')}" placeholder="Werkstatt oder Person"></div>
        <div class="frow"><div class="flabel"><label>Kosten</label></div>${stepper('kosten_eur', d.kosten_eur, { u: '€', btn: 5, min: 0 }, '')}</div>
      </div>
    </section>
    <section class="card">
      <header class="card-h"><h3>Nachweise</h3><span class="sub">Garantie und HUK-Verschleißschutz</span></header>
      <div class="form">
        ${boolRow('serviceheft', 'Serviceheft gestempelt', 'Werkstatt-Arbeiten immer eintragen lassen')}
        ${boolRow('huk', 'HUK-relevant (Verschleiß)', 'Rechnung mit Messwert und „Verschleißgrenze erreicht“ nötig')}
        ${boolRow('verschleissgrenze', 'Verschleißgrenze erreicht', 'muss so auf der Rechnung stehen')}
      </div>
    </section>
    <details class="card fsec" ${messKeys.length || (d.messwerte && Object.values(d.messwerte).some(v => v != null)) ? 'open' : ''}>
      <summary><span><strong>Messwerte</strong><span class="sub">Kette, Beläge, Scheiben</span></span></summary>
      <div class="form">${(messKeys.length ? messKeys : MESS_ALLE).map(messRow).join('')}
        ${messKeys.length && andereMess.length ? `<details class="mehr-mess"><summary class="small">weitere Messwerte</summary>${andereMess.map(messRow).join('')}</details>` : ''}
      </div>
    </details>
    <section class="card">
      <header class="card-h"><h3>Belege</h3><span class="sub">Rechnung, Bosch-Diagnoseprotokoll, Fotos · Google Drive</span></header>
      <div id="belege-liste"></div>
      <div class="upload-row">
        <select id="w-belegtyp" aria-label="Art des Belegs">${BELEG_TYPEN.map(t => `<option>${esc(t)}</option>`).join('')}</select>
        <label class="btn sm">Datei wählen / Foto<input type="file" id="w-datei" accept="image/*,application/pdf" multiple hidden></label>
      </div>
      <p class="small muted">PDF oder Foto, bis 10 MB. Fotos werden vor dem Hochladen verkleinert. Die Dateien liegen nur in deinem Google Drive.</p>
    </section>
    <section class="card">
      <div class="form"><div class="frow frow-wide"><div class="flabel"><label>Notiz</label></div><textarea data-path="notiz" data-kind="text" rows="3" placeholder="z. B. Werkstatt hat Kette gemessen, nächster Tausch in ca. 500 km">${esc(d.notiz || '')}</textarea></div></div>
    </section>
    ${e.neu ? '' : `<div class="actions"><button class="btn ghost danger" data-wact="loeschen">Eintrag löschen</button></div>`}
    <div class="savebar">
      <button class="btn ghost" data-wact="abbrechen">Abbrechen</button>
      <button class="btn primary" data-wact="speichern">Speichern</button>
    </div>
  </div>`;
  zeichneBelege();
  pruefeMesswerte();
}
function zeichneBelege() {
  const el = $('#belege-liste');
  if (!el || !ui.wedit) return;
  const b = ui.wedit.data.belege || [];
  el.innerHTML = (b.length ? `<ul class="belege edit">${b.map((x, i) => {
    const url = sichereUrl(x.url);
    return `<li><span class="b-typ">${esc(x.typ || 'Beleg')}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(x.name || 'Datei')}</a>` : esc(x.name || 'Datei')}
      <button class="btn sm ghost danger" data-wact="beleg-weg" data-idx="${i}" aria-label="Beleg entfernen">Entfernen</button></li>`;
  }).join('')}</ul>` : '<p class="small muted">Noch keine Belege.</p>')
    + (ui.wedit.uploads ? `<p class="small"><span class="spin"></span> ${ui.wedit.uploads} Datei${ui.wedit.uploads === 1 ? '' : 'en'} wird hochgeladen …</p>` : '');
}
function pruefeMesswerte() {
  const root = $('.weditor');
  if (!root) return;
  const d = readForm(root);
  let erreicht = false;
  for (const m of MESSWERTE) {
    const v = d.messwerte ? d.messwerte[m.k] : null;
    const el = root.querySelector(`[data-warn-for="messwerte.${m.k}"]`);
    let t = '';
    if (v !== null && v !== undefined && m.grenze && (m.grenze.op === '>=' ? v >= m.grenze.v : v <= m.grenze.v)) { t = 'Grenzwert erreicht – Tausch fällig'; erreicht = true; }
    if (el) { el.textContent = t; el.classList.toggle('on', !!t); }
  }
  const cb = root.querySelector('[data-path="verschleissgrenze"]');
  if (erreicht && cb && !cb.checked && !ui.wedit.grenzeBerührt) {
    cb.checked = true;
    cb.parentElement.querySelector('span:last-child').textContent = 'ja';
  }
}
function leseWartungForm() {
  const root = $('.weditor');
  const d = readForm(root);
  const alt = ui.wedit.data;
  const out = { ...alt, ...d, messwerte: { ...(d.messwerte || {}) }, belege: alt.belege || [] };
  for (const k of Object.keys(out.messwerte)) if (out.messwerte[k] === null) delete out.messwerte[k];
  return out;
}

async function belegVorbereiten(file) {
  const typ = file.type || '';
  if (typ === 'application/pdf') return { blob: file, mime: typ, ext: 'pdf' };
  if (!typ.startsWith('image/')) throw new Error(`${file.name}: nur PDF oder Bild`);
  try {
    const bmp = await createImageBitmap(file);
    const f = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((ok, err) => c.toBlob(b => b ? ok(b) : err(new Error('Bild konnte nicht umgewandelt werden')), 'image/jpeg', 0.85));
    return { blob, mime: 'image/jpeg', ext: 'jpg' };
  } catch {
    return { blob: file, mime: typ, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() };
  }
}
function blobZuBase64(blob) {
  return new Promise((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => err(new Error('Datei konnte nicht gelesen werden'));
    r.readAsDataURL(blob);
  });
}
async function belegeHochladen(files, typ) {
  if (!backendOk() || !navigator.onLine) { toast('Belege hochladen geht nur mit Verbindung zum Backend.', 'err'); return; }
  for (const file of files) {
    ui.wedit.uploads++; zeichneBelege();
    try {
      const vorb = await belegVorbereiten(file);
      if (vorb.blob.size > BELEG_MAX_BYTES) throw new Error(`${file.name}: größer als 10 MB`);
      const d = leseWartungForm();
      const a = AUFGABE_MAP.get(d.aufgabe);
      const name = `${d.datum || heuteIso()}_${a ? a.id : 'frei'}_${typ}_${(file.name || 'beleg').replace(/\.[^.]+$/, '')}`.replace(/[^\wäöüÄÖÜß.-]+/g, '-').slice(0, 90) + '.' + vorb.ext;
      const j = await apiPost({ action: 'beleg', wartung_id: ui.wedit.id, typ, name, mime: vorb.mime, daten: await blobZuBase64(vorb.blob) }, 180000);
      if (!ui.wedit) return;
      ui.wedit.data.belege = [...(ui.wedit.data.belege || []), j.beleg];
      ui.wedit.neueBelege.push(j.beleg.id);
      ui.wedit.dirty = true;
    } catch (e) {
      const msg = /Unbekannte Aktion/.test(e.message) ? 'Apps Script ist noch auf dem alten Stand – bitte Code.gs aktualisieren (README).' : e.message;
      toast(`Upload fehlgeschlagen: ${msg}`, 'err');
    } finally {
      if (ui.wedit) { ui.wedit.uploads--; zeichneBelege(); }
    }
  }
}
async function belegLoeschenRemote(id) {
  if (!backendOk() || !navigator.onLine || !id) return false;
  try { await apiPost({ action: 'beleg_loeschen', id }); return true; } catch { return false; }
}

function speichereWartung() {
  const e = ui.wedit;
  if (e.uploads) { toast('Bitte warten, bis der Upload fertig ist.', 'err'); return; }
  const d = leseWartungForm();
  if (!d.datum) { toast('Bitte ein Datum eintragen.', 'err'); return; }
  if (!d.aufgabe) { toast('Bitte eine Aufgabe wählen.', 'err'); return; }
  if (d.wer !== 'Andere') d.wer_frei = null;
  const rec = store.records[e.id] || { id: e.id, typ: 'wartung', created: nowIso(), data: {} };
  rec.data = d;
  rec.geloescht = false;
  putRecord(rec);
  ui.wedit = null;
  ui.view = 'wartung';
  render();
  window.scrollTo(0, 0);
  const a = AUFGABE_MAP.get(d.aufgabe);
  toast(`Gespeichert${a ? ` · ${a.id}` : ''}`);
}
async function wartungAbbrechen(ziel) {
  const e = ui.wedit;
  if (e && e.dirty && !confirm('Eingaben verwerfen?')) return false;
  if (e && e.neueBelege.length) {
    for (const id of e.neueBelege) await belegLoeschenRemote(id);
  }
  ui.wedit = null;
  ui.view = ziel || 'wartung';
  render();
  window.scrollTo(0, 0);
  return true;
}

/* ---------- Events ---------- */
document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-wact]');
  if (!btn) return;
  const act = btn.dataset.wact;
  switch (act) {
    case 'stand-form': { const f = $('#stand-form'); f.hidden = !f.hidden; break; }
    case 'stand-speichern': {
      const root = $('#stand-form');
      const km = parseNum(root.querySelector('[data-path="km"]').value);
      const h = parseNum(root.querySelector('[data-path="motorstunden"]').value);
      if (km === null) { toast('Bitte den Kilometerstand eintragen.', 'err'); return; }
      const rec = store.records.stand || { id: 'stand', typ: 'stand', created: nowIso(), data: {} };
      rec.data = { km, motorstunden: h, zeit: nowIso(), quelle: 'manuell' };
      putRecord(rec);
      render();
      toast('Stand gespeichert');
      break;
    }
    case 'neu': openWartungEditor({}); break;
    case 'erledigt': openWartungEditor({ aufgabe: btn.dataset.aufgabe }); break;
    case 'bearbeiten': openWartungEditor({ id: btn.dataset.id }); break;
    case 'bericht': ui.view = 'bericht'; render(); window.scrollTo(0, 0); break;
    case 'drucken': window.print(); break;
    case 'abbrechen': await wartungAbbrechen('wartung'); break;
    case 'speichern': speichereWartung(); break;
    case 'loeschen': {
      if (!confirm('Diesen Eintrag löschen? Die Belege bleiben im Drive-Ordner erhalten.')) return;
      const rec = store.records[ui.wedit.id];
      if (rec) { rec.geloescht = true; putRecord(rec); }
      ui.wedit = null; ui.view = 'wartung'; render();
      break;
    }
    case 'beleg-weg': {
      const i = Number(btn.dataset.idx);
      const b = ui.wedit.data.belege[i];
      if (!b || !confirm(`Beleg „${b.name}“ entfernen und aus Google Drive löschen?`)) return;
      const ok = await belegLoeschenRemote(b.id);
      ui.wedit.data.belege = ui.wedit.data.belege.filter((_, j) => j !== i);
      ui.wedit.neueBelege = ui.wedit.neueBelege.filter(x => x !== b.id);
      ui.wedit.dirty = true;
      zeichneBelege();
      if (!ok) toast('Verknüpfung entfernt – die Datei liegt noch im Drive-Ordner.', 'err');
      break;
    }
  }
});

document.addEventListener('input', ev => {
  if (!ui.wedit || !ev.target.closest('.weditor')) return;
  ui.wedit.dirty = true;
  if (String(ev.target.dataset.path || '').startsWith('messwerte.')) pruefeMesswerte();
});

document.addEventListener('change', async ev => {
  const el = ev.target;
  if (el.id === 'b-von' || el.id === 'b-bis' || el.id === 'b-huk' || el.id === 'b-werkstatt') {
    ui.bericht = { von: $('#b-von').value, bis: $('#b-bis').value, nurHuk: $('#b-huk').checked, nurWerkstatt: $('#b-werkstatt').checked };
    render();
    return;
  }
  if (!ui.wedit || !el.closest('.weditor')) return;
  ui.wedit.dirty = true;
  if (el.type === 'checkbox') {
    const lab = el.parentElement.querySelector('span:last-child');
    if (lab) lab.textContent = el.checked ? 'ja' : 'nein';
    if (el.dataset.path === 'verschleissgrenze') ui.wedit.grenzeBerührt = true;
  }
  if (el.id === 'w-wer') { const f = $('#w-wer-frei'); if (f) f.hidden = el.value !== 'Andere'; }
  if (el.id === 'w-aufgabe') {
    const d = leseWartungForm();
    const a = AUFGABE_MAP.get(d.aufgabe);
    if (a && !ui.wedit.neu) { ui.wedit.data = d; zeichneWartungEditor(); return; }
    ui.wedit.data = { ...d, wer: a ? werStandard(a) : d.wer };
    zeichneWartungEditor();
    return;
  }
  if (el.id === 'w-datei' && el.files && el.files.length) {
    const files = Array.from(el.files);
    el.value = '';
    await belegeHochladen(files, $('#w-belegtyp').value);
  }
});
