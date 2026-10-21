/**
 * Carbon-Gurke Setup – Backend (Google Apps Script)
 *
 * Speichert die Einträge der PWA in einem Google Sheet, holt KI-Tipps von Claude
 * und liefert das aktive Setup für Home Assistant (REST-Sensor).
 *
 * Skripteigenschaften (Projekteinstellungen → Skripteigenschaften):
 *   APP_TOKEN          – wird von einrichten() erzeugt; in PWA und HA eintragen
 *   ANTHROPIC_API_KEY  – dein Claude-API-Key (sk-ant-…)
 *   MODEL              – optional, Standard: claude-sonnet-5-5
 *   SHEET_ID           – wird von einrichten() gesetzt
 *
 * Einmalig im Editor die Funktion einrichten() ausführen.
 */

const VERSION = '1.1.0';
const STANDARD_MODELL = 'claude-sonnet-5-5';
const PROPS = PropertiesService.getScriptProperties();
const KOPF = ['id', 'typ', 'created', 'updated', 'geloescht', 'json', 'lesbar'];

/* ============================ Einrichtung ============================ */

function einrichten() {
  let token = PROPS.getProperty('APP_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    PROPS.setProperty('APP_TOKEN', token);
  }
  let id = PROPS.getProperty('SHEET_ID');
  let ss;
  try { ss = id ? SpreadsheetApp.openById(id) : null; } catch (e) { ss = null; }
  if (!ss) {
    ss = SpreadsheetApp.create('Carbon-Gurke Setup');
    PROPS.setProperty('SHEET_ID', ss.getId());
  }
  const daten = blatt_(ss, 'Daten');
  if (daten.getLastRow() === 0) {
    daten.appendRow(KOPF);
    daten.setFrozenRows(1);
    daten.getRange(1, 1, 1, KOPF.length).setFontWeight('bold');
  }
  blatt_(ss, 'Setups');
  blatt_(ss, 'Rückmeldungen');
  const leer = ss.getSheetByName('Tabellenblatt1') || ss.getSheetByName('Sheet1');
  if (leer && ss.getSheets().length > 1) ss.deleteSheet(leer);

  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('APP_TOKEN: ' + token);
  Logger.log(PROPS.getProperty('ANTHROPIC_API_KEY') ? 'Claude-API-Key: vorhanden' : 'Claude-API-Key: FEHLT – unter Skripteigenschaften als ANTHROPIC_API_KEY eintragen');
}

/** Testet den Claude-Zugang aus dem Editor heraus. */
function testKi() {
  const r = kiTipp_('FAHRERPROFIL\n- 186 cm, 95 kg\n\nAKTIVES SETUP: „Test“\n- gabel.druck_psi = 85 psi   [Gabel · Luftdruck]\n- gabel.sag_pct = 14 %   [Gabel · Sag]\n\nERLAUBTE PFADE FÜR ÄNDERUNGEN (Pfad · Bedeutung · Typ):\n- gabel.druck_psi · Gabel · Luftdruck · Zahl in psi\n\nRÜCKMELDUNG DES FAHRERS\nGabel vorne zu hart, nutzt den Federweg nicht');
  Logger.log(JSON.stringify(r, null, 2));
}

/* ============================ HTTP ============================ */

function doGet(e) {
  return antwort_(() => {
    const p = (e && e.parameter) || {};
    pruefeToken_(p.token);
    switch (p.action) {
      case 'ping': return { version: VERSION, ki: !!PROPS.getProperty('ANTHROPIC_API_KEY'), modell: modell_() };
      case 'alle': return { records: alleRecords_() };
      case 'aktiv': return aktivFuerHa_();
      default: throw new Error('Unbekannte Aktion: ' + p.action);
    }
  });
}

function doPost(e) {
  return antwort_(() => {
    let body;
    try { body = JSON.parse(e.postData.contents); } catch (x) { throw new Error('Ungültiger Request (kein JSON)'); }
    pruefeToken_(body.token);
    switch (body.action) {
      case 'upsert': return { gespeichert: upsert_(body.records || []) };
      case 'ki': {
        if (!body.nachricht || String(body.nachricht).length > 60000) throw new Error('Nachricht fehlt oder ist zu lang');
        return kiTipp_(String(body.nachricht));
      }
      default: throw new Error('Unbekannte Aktion: ' + body.action);
    }
  });
}

function antwort_(fn) {
  let out;
  try { out = Object.assign({ ok: true }, fn()); }
  catch (err) { out = { ok: false, fehler: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function pruefeToken_(t) {
  const soll = PROPS.getProperty('APP_TOKEN');
  if (!soll) throw new Error('Backend nicht eingerichtet – einrichten() ausführen');
  if (!t || String(t) !== soll) throw new Error('Token ungültig');
}

/* ============================ Speicher ============================ */

function ss_() {
  const id = PROPS.getProperty('SHEET_ID');
  if (!id) throw new Error('Backend nicht eingerichtet – einrichten() ausführen');
  return SpreadsheetApp.openById(id);
}
function blatt_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

function lesen_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, KOPF.length).getValues();
}

function upsert_(records) {
  if (!Array.isArray(records)) throw new Error('records fehlt');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_();
    const sh = blatt_(ss, 'Daten');
    const rows = lesen_(sh);
    const index = {};
    rows.forEach((r, i) => { index[r[0]] = i; });
    let n = 0;
    const neu = [];
    for (const rec of records) {
      if (!rec || !rec.id || !/^[a-z0-9_]{3,40}$/i.test(rec.id)) continue;
      if (['setup', 'feedback', 'profil'].indexOf(rec.typ) < 0) continue;
      const zeile = [rec.id, rec.typ, rec.created || '', rec.updated || '', rec.geloescht ? 1 : 0, JSON.stringify(rec.data || {}), rec.lesbar ? JSON.stringify(rec.lesbar) : ''];
      if (index[rec.id] !== undefined) {
        const alt = rows[index[rec.id]];
        if (String(alt[3]) > String(rec.updated || '')) continue; // Server ist neuer
        rows[index[rec.id]] = zeile;
      } else {
        index[rec.id] = rows.length;
        rows.push(zeile);
        neu.push(zeile);
      }
      n++;
    }
    if (rows.length) sh.getRange(2, 1, rows.length, KOPF.length).setValues(rows);
    lesbareBlaetter_(ss, rows);
    return n;
  } finally {
    lock.releaseLock();
  }
}

function alleRecords_() {
  return lesen_(blatt_(ss_(), 'Daten')).map(r => ({
    id: r[0], typ: r[1], created: String(r[2]), updated: String(r[3]), geloescht: r[4] === 1 || r[4] === true || r[4] === '1',
    data: json_(r[5]),
  }));
}

function json_(s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }

/** Baut die Blätter „Setups“ und „Rückmeldungen“ in lesbarer Form neu auf. */
function lesbareBlaetter_(ss, rows) {
  const bauen = (name, typ) => {
    const sh = blatt_(ss, name);
    const liste = rows.filter(r => r[1] === typ && !(r[4] === 1 || r[4] === '1') && r[6])
      .sort((a, b) => String(b[2]).localeCompare(String(a[2])))
      .map(r => ({ datum: String(r[2]), werte: json_(r[6]) }));
    const spalten = ['Datum'];
    liste.forEach(x => Object.keys(x.werte).forEach(k => { if (spalten.indexOf(k) < 0) spalten.push(k); }));
    // leere Spalten weglassen
    const genutzt = spalten.filter((k, i) => i === 0 || liste.some(x => x.werte[k] !== '' && x.werte[k] !== null && x.werte[k] !== undefined));
    const tz = Session.getScriptTimeZone() || 'Europe/Berlin';
    const daten = liste.map(x => genutzt.map((k, i) => i === 0 ? Utilities.formatDate(new Date(x.datum), tz, 'dd.MM.yyyy HH:mm') : (x.werte[k] === undefined ? '' : x.werte[k])));
    sh.clearContents();
    sh.getRange(1, 1, 1, genutzt.length).setValues([genutzt]).setFontWeight('bold');
    if (daten.length) sh.getRange(2, 1, daten.length, genutzt.length).setValues(daten);
    sh.setFrozenRows(1);
    sh.setFrozenColumns(Math.min(2, genutzt.length));
  };
  bauen('Setups', 'setup');
  bauen('Rückmeldungen', 'feedback');
}

/* ============================ Home Assistant ============================ */

function aktivFuerHa_() {
  const recs = alleRecords_().filter(r => !r.geloescht);
  const setups = recs.filter(r => r.typ === 'setup');
  if (!setups.length) return { name: 'kein Setup', werte: {} };
  setups.sort((a, b) => String(b.data.aktiviert_am || b.created).localeCompare(String(a.data.aktiviert_am || a.created)));
  const s = setups[0];
  const werte = {};
  flach_(s.data, '', werte);
  ['name', 'anlass', 'notiz', 'aktiviert_am'].forEach(k => delete werte[k]);
  const modi = (s.data.bosch && s.data.bosch.modi) || {};
  const kiox = Object.keys(modi).filter(m => modi[m] && modi[m].kiox_pos).sort((a, b) => modi[a].kiox_pos - modi[b].kiox_pos);
  werte.kiox_favoriten = kiox.join(' · ');
  const fb = recs.filter(r => r.typ === 'feedback').sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
  if (fb) {
    werte.letzte_rueckmeldung = fb.data.text || '';
    werte.letzte_rueckmeldung_status = fb.data.status || '';
    werte.letzte_rueckmeldung_am = fb.created;
  }
  werte.anzahl_setups = setups.length;
  return {
    name: String(s.data.name || 'ohne Namen').slice(0, 250),
    anlass: s.data.anlass || '',
    notiz: s.data.notiz || '',
    seit: s.data.aktiviert_am || s.created,
    werte: werte,
  };
}

function schluessel_(k) {
  return String(k).toLowerCase().replace(/\+/g, '_plus').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function flach_(obj, prefix, out) {
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    const key = prefix ? prefix + '_' + schluessel_(k) : schluessel_(k);
    if (v === null || v === undefined || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      if ('wert' in v && ('einheit' in v || Object.keys(v).length === 1)) {
        if (v.wert === null || v.wert === undefined || v.wert === '') continue;
        out[key] = v.einheit === '%' ? v.wert + ' %' : 'Stufe ' + (v.wert > 0 ? '+' : '') + v.wert;
      } else {
        flach_(v, key.replace(/^bosch_modi_/, 'bosch_'), out);
      }
    } else {
      out[key] = v;
    }
  }
}

/* ============================ Claude ============================ */

function modell_() { return PROPS.getProperty('MODEL') || STANDARD_MODELL; }

const SYSTEM_PROMPT = [
  'Du bist ein erfahrener Fahrwerks- und E-MTB-Techniker. Du hilfst Gregor, sein E-MTB Schritt für Schritt abzustimmen.',
  '',
  'DAS RAD',
  '- Cube Stereo Hybrid ONE44 HPC TM 800 (2026), 29", Größe XL, Carbonrahmen.',
  '- Gabel: Fox 36 Float Performance mit GRIP-Dämpfung, 150 mm. Einstellbar: Luftdruck, Rebound (Klicks), Druckstufen-Hebel, Volume Spacer (Token). Ob es zusätzlich eine Druckstufen-Klickverstellung gibt, ist nicht bestätigt – nur nutzen, wenn im Setup ein Wert dafür steht.',
  '- Dämpfer: Fox Float X Performance, max. 350 psi. Einstellbar: Luftdruck, Rebound (Klicks), 2-Stufen-Hebel Open/Firm, Volume Spacer.',
  '- Reifen: Continental Kryptotal 2.4 auf Newmen Beskar 30 (30 mm Innenweite), derzeit mit Schlauch (Sclaverand), sofern das Setup nichts anderes sagt.',
  '- Antrieb: Bosch Performance Line CX (BDU384Y) mit Performance Upgrade 2.0, Kiox 400C, PowerTube 800 Wh. Kein Race-Modus (der ist der CX-R vorbehalten).',
  '  Upgrade 2.0: Drehmoment bis 120 Nm (Grundeinstellung 85 Nm, der Radhersteller kann begrenzen), bis 600 % Unterstützung nur bis 15 km/h und nur in Turbo, eMTB+ und Auto.',
  '  Je Fahrmodus in der eBike Flow App: Unterstützung und Dynamik als Regler −5 … +5, max. Drehmoment (Nm), ggf. max. Leistung, max. Geschwindigkeit (höchstens 25 km/h), Extended Boost 0 … 10 (0 = aus), unter „Erweitert“ Traktionskontrolle (aus/niedrig/mittel/hoch) und Drivetrain Tensioner (an/aus, Standard aus). Höchstens 4 Modi als Kiox-Favoriten.',
  '- Nutzung: Touren ab Haustür und Trails im Odenwald, kein Downhill, Flatpedale.',
  '',
  'KONVENTIONEN',
  '- Vorne = Gabel, hinten = Dämpfer. Umgangssprache wie „Dämpfer vorne“ meint die Gabel.',
  '- Klicks werden von ganz zu gezählt (im Uhrzeigersinn ganz eingedreht = 0). Mehr Klicks = weiter offen.',
  '  Rebound: mehr Klicks = schnelleres Ausfedern. Weniger Klicks = langsamer.',
  '  Druckstufe: mehr Klicks = weniger Dämpfung (weicher). Weniger Klicks = mehr Dämpfung.',
  '- Fahrwerk in psi, Reifen in bar. Sag-Ziel laut Profil (Standard Gabel 20 %, Dämpfer 30 %).',
  '',
  'DIAGNOSE-HILFE',
  '- Erst den Sag prüfen. Liegt er mehr als 3 Prozentpunkte neben dem Ziel, zuerst den Luftdruck korrigieren, dann erst Dämpfung oder Token.',
  '- Hart/unsensibel auf kleinen Schlägen: Druck zu hoch (Sag zu klein) oder Rebound zu langsam; auch prüfen, ob der Hebel auf Open steht.',
  '- Wird bei Schlagfolgen immer härter, „packt nach“: Rebound zu langsam → öffnen.',
  '- Kickt, springt, unruhig: Rebound zu schnell → schließen.',
  '- Schlägt durch bei großen Schlägen, Sag passt: Volume Spacer +1. Schlägt durch und Sag zu groß: Druck rauf.',
  '- Federweg wird nie annähernd genutzt, Sag passt: Volume Spacer −1.',
  '- Taucht beim Bremsen weg: Druck leicht rauf; Druckstufe nur, wenn sie einstellbar ist.',
  '- Heck wippt bergauf: Firm für lange Anstiege empfehlen, sonst Sag prüfen.',
  '- Zu wenig Grip: Reifendruck in 0,1-bar-Schritten senken; hinten auch ein zu schneller Rebound. Mit Schlauch steigt bei niedrigem Druck das Risiko für Durchschläge und Snakebites – nicht deutlich unter bisherige Werte gehen, Min/Max auf der Reifenflanke beachten.',
  '- Motor zu ruppig am Trail: Dynamik senken, Traktionskontrolle erhöhen oder eMTB statt Turbo. Hinterrad dreht auf losem Untergrund durch: Traktionskontrolle erhöhen. Zu wenig Schub bergauf: Unterstützung oder max. Drehmoment erhöhen. Akku leert zu schnell: Unterstützung oder Drehmoment senken.',
  '',
  'REGELN',
  '1. Schlage genau EINE Änderung vor. Zwei nur, wenn sie zwingend zusammengehören (z. B. Luftdruck erhöht und Rebound minimal schließen) – und sag dann, warum.',
  '2. Kleine Schritte: Gabel ±3–5 psi, Dämpfer ±5–10 psi, Rebound/Druckstufe ±1–2 Klicks, Reifen ±0,1 bar, Volume Spacer ±1, Bosch-Regler ±1 Stufe, Drehmoment ±5–10 Nm, Traktionskontrolle eine Stufe.',
  '3. Grenzen einhalten: Dämpfer max. 350 psi, Gabel max. laut Profil (unbekannt → nicht in die Nähe von Extremwerten), Bosch max. 120 Nm bzw. das eingetragene Hersteller-Limit, Regler −5 … +5, Extended Boost 0 … 10, max. 25 km/h.',
  '4. Nicht raten: Ist der Ausgangswert eines Feldes unbekannt (fehlt im Setup), schlage keinen Zielwert dafür vor, sondern bitte in den Rückfragen darum, ihn abzulesen.',
  '5. Ist die Ursache unklar, gib keine Änderung (leere Liste) und stelle 1–3 gezielte Rückfragen.',
  '6. Klingt es nach einem Defekt (Knacken, Ölverlust, Spiel, Luftverlust, plötzlich anderes Verhalten ohne Setup-Änderung, Bremse), nichts am Setup ändern, sondern unter „warnung“ die Werkstatt empfehlen.',
  '7. Sattelhöhe, Sattelneigung, Lenker und Bremshebel-Winkel sitzen an Klemmschrauben am Carbon/Cockpit: Gregor lässt das ohne Drehmomentschlüssel von der Werkstatt einstellen – weise darauf hin, wenn du so etwas vorschlägst.',
  '8. Nutze den Verlauf: Wiederhole keine Änderung, die laut Verlauf schon probiert wurde und nicht geholfen hat.',
  '9. Verwende ausschließlich Pfade aus der Liste „ERLAUBTE PFADE“. Im Feld „nach“ steht der neue Absolutwert (Zahl mit Punkt als Dezimaltrenner, z. B. 1.7) oder genau eine der erlaubten Optionen.',
  '10. Schreibe auf Deutsch, kurz und konkret, in der Du-Form, Zahlen im Text mit Komma. Erkläre in der Begründung in einem Satz, warum.',
  '11. Unter „test“: Wie Gregor auf einer bekannten Strecke prüft, ob es besser ist (worauf achten).',
].join('\n');

const TOOL = {
  name: 'setup_vorschlag',
  description: 'Gibt die Diagnose und die empfohlene Setup-Änderung strukturiert zurück.',
  input_schema: {
    type: 'object',
    properties: {
      diagnose: { type: 'string', description: '1–3 Sätze: wahrscheinliche Ursache.' },
      aenderungen: {
        type: 'array',
        description: 'In der Regel genau 1 Eintrag, höchstens 2. Leer, wenn erst Rückfragen nötig sind.',
        items: {
          type: 'object',
          properties: {
            pfad: { type: 'string', description: 'Pfad aus der Liste ERLAUBTE PFADE, z. B. gabel.rebound_klicks' },
            nach: { type: 'string', description: 'Neuer Absolutwert: Zahl mit Punkt (z. B. 82 oder 1.7) oder eine erlaubte Option (z. B. Firm).' },
            begruendung: { type: 'string', description: 'Ein Satz, warum.' },
          },
          required: ['pfad', 'nach', 'begruendung'],
        },
      },
      test: { type: 'string', description: 'Wie testen, worauf achten.' },
      rueckfragen: { type: 'array', items: { type: 'string' }, description: '0–3 kurze Rückfragen.' },
      warnung: { type: 'string', description: 'Nur bei Sicherheits- oder Defektverdacht, sonst weglassen.' },
    },
    required: ['diagnose', 'aenderungen', 'test', 'rueckfragen'],
  },
};

function kiTipp_(nachricht) {
  const key = PROPS.getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Kein Claude-API-Key im Apps Script hinterlegt (Skripteigenschaft ANTHROPIC_API_KEY)');
  const payload = {
    model: modell_(),
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: nachricht }],
  };
  const opts = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
  let res;
  for (let versuch = 0; versuch < 2; versuch++) {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', opts);
    const code = res.getResponseCode();
    if (code !== 429 && code !== 529 && code < 500) break;
    if (versuch === 0) Utilities.sleep(3000);
  }
  const code = res.getResponseCode();
  const j = json_(res.getContentText());
  if (code !== 200) {
    const msg = (j.error && j.error.message) || res.getContentText().slice(0, 200);
    if (code === 401) throw new Error('Claude-API-Key ungültig');
    if (code === 404) throw new Error('Modell nicht gefunden (' + modell_() + ') – Skripteigenschaft MODEL prüfen');
    if (code === 429) throw new Error('Claude-Limit erreicht – kurz warten');
    if (code === 529) throw new Error('Claude ist gerade überlastet – später erneut versuchen');
    throw new Error('Claude-Fehler ' + code + ': ' + msg);
  }
  const block = (j.content || []).find(b => b.type === 'tool_use');
  if (!block) throw new Error('Claude hat keinen strukturierten Vorschlag geliefert');
  const t = block.input || {};
  t.aenderungen = (t.aenderungen || []).slice(0, 2).map(a => ({ pfad: String(a.pfad || ''), nach: String(a.nach == null ? '' : a.nach), begruendung: a.begruendung || '' }));
  t.rueckfragen = (t.rueckfragen || []).slice(0, 3);
  return { tipp: t, modell: j.model || modell_(), tokens: j.usage || null };
}
