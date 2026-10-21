# Carbon-Gurke Setup

Logbuch für das Setup des Cube Stereo Hybrid ONE44 HPC TM 800: Fahrwerk, Reifen, Cockpit und Bosch-Fahrmodi, mit KI-Tipps von Claude.

**App:** https://morbus86.github.io/Carbon-Gurke-Setup/

## Funktionen

- **Setup als Versionen.** Jede Änderung wird als neue Version gespeichert. Der Verlauf zeigt pro Version, was sich geändert hat (z. B. „Gabel · Luftdruck 85 psi → 80 psi“). Alte Stände kannst du wieder aktivieren.
- **Felder:**
  - Gabel: Druck, Sag, Rebound, Hebel, Druckstufe, Token
  - Dämpfer: Druck, Sag, Rebound, Open/Firm, Spacer
  - Reifen: Druck vorne und hinten, Schlauch oder tubeless
  - Cockpit
  - Bosch (Performance Line CX, ohne Race – der ist der CX-R vorbehalten): je Fahrmodus Unterstützung und Dynamik (Regler −5 … +5), Drehmoment (bis 120 Nm), Leistung, Abschaltgeschwindigkeit, Extended Boost (0 … 10), Traktionskontrolle (aus/niedrig/mittel/hoch), Drivetrain Tensioner (an/aus), bei Eco+ die Aktivierungsschwelle, dazu bis zu **4 Kiox-Favoriten** in Reihenfolge
  - Kontext: Gewicht, Strecke, Bedingungen
- **Sag-Rechner:** Den gemessenen Sag gibst du in mm ein, die App rechnet ihn in % um.
- **Warnungen:** Die App warnt, wenn ein Druck über dem Maximum liegt, der Sag weit vom Ziel entfernt ist, mehr als 120 Nm oder mehr als 25 km/h eingetragen sind oder ein Kiox-Platz doppelt vergeben ist.
- **KI-Tipp:** Du schreibst z. B. „Gabel zu hart“. Claude bekommt dein aktives Setup und den Verlauf und schlägt **eine** Änderung vor. Mit „Übernehmen & prüfen“ öffnet sich der Editor, das geänderte Feld ist markiert. Erst am Rad einstellen, dann speichern.
- **Offline:** Ohne Netz wird lokal gespeichert und später synchronisiert. KI-Tipps brauchen Netz.
- **Home Assistant:** Ein REST-Sensor holt das aktive Setup mit allen Werten.
- **Wartung** (Tab „Wartung“):
  - Aufgaben **W01–W18** aus dem Wartungsplan mit Fälligkeit nach km, Motorstunden oder Zeit. Es gilt, was zuerst eintritt.
  - Einträge mit Datum, km, Motorstunden, Werkstatt, Kosten, „Serviceheft gestempelt“, „HUK-relevant“ und „Verschleißgrenze erreicht“.
  - Messwerte: Kettenlängung, Beläge, Scheiben. Die App warnt bei Grenzwerten (0,8 % bzw. ≤ 3 mm).
  - **Belege** (Rechnung, Bosch-Diagnoseprotokoll, Fotos) landen im Google-Drive-Ordner „Carbon-Gurke Belege“. Fotos werden vor dem Hochladen verkleinert.
  - **Bericht** mit Filter (Zeitraum, nur HUK, nur Werkstatt), zum Drucken oder als PDF.
  - **Stand** (km, Motorstunden) erst manuell, später automatisch aus Home Assistant.

**Konvention:** Klicks werden immer von ganz zu gezählt. Im Uhrzeigersinn ganz eindrehen ergibt 0, ab da gegen den Uhrzeigersinn zählen.

## Einrichtung

### 1. Backend (Google Apps Script)

1. Auf [script.google.com](https://script.google.com) ein neues Projekt „Carbon-Gurke Setup“ anlegen.
2. Den Inhalt von `apps-script/Code.gs` in `Code.gs` einfügen und speichern.
3. Unter **Projekteinstellungen → Skripteigenschaften** die Eigenschaft `ANTHROPIC_API_KEY` mit deinem Claude-API-Key anlegen. Das kann derselbe Key wie beim Dienstplan sein.
   - Optional: `MODEL`. Standard ist `claude-sonnet-5-5`, günstiger ist `claude-haiku-5-5`.
4. Im Editor die Funktion **`einrichten`** auswählen, ausführen und die Berechtigungen bestätigen.
   - Im Ausführungsprotokoll stehen danach die **Sheet-URL** und das **APP_TOKEN**.
5. Optional die Funktion **`testKi`** ausführen. Im Protokoll muss dann ein Vorschlag stehen.
6. **Bereitstellen → Neue Bereitstellung → Web-App:**
   - Ausführen als: **Ich**
   - Zugriff: **Jeder**
   - Danach die **Web-App-URL** (endet auf `/exec`) kopieren.

**Wenn du `Code.gs` später änderst** (z. B. nach einem Update hier im Repo):
1. Den Code komplett ersetzen und speichern.
2. Die Funktion **`einrichten`** erneut ausführen. Ab Version 1.2 fragt Google dabei einmal nach Zugriff auf **Google Drive**, das ist für die Belege nötig. Vorhandene Daten bleiben erhalten.
3. **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Version: Neue Version → Bereitstellen.** Die URL bleibt gleich.
4. Kontrolle: In der App unter **Mehr → Speichern & testen**. Die Meldung zeigt die neue Backend-Version.

**Neues Token (APP_TOKEN wechseln):**
1. **Projekteinstellungen** (Zahnrad links) → **Skripteigenschaften bearbeiten** → bei `APP_TOKEN` auf den Papierkorb → **Skripteigenschaften speichern**.
2. Im Editor die Funktion **`einrichten`** ausführen. Im Ausführungsprotokoll steht das neue APP_TOKEN. Eine neue Bereitstellung ist dafür nicht nötig.
3. Das neue Token überall eintragen, wo das alte stand:
   - App, auf jedem Gerät: **Mehr → Token** → **Speichern & testen**
   - Home Assistant: in `secrets.yaml` bei `carbon_gurke_setup_url` den Teil nach `token=` ersetzen, dann HA **komplett** neu starten

### 2. App

1. Die App öffnen und unter **Mehr** die Web-App-URL und das Token eintragen. Mit **Speichern & testen** prüfen.
2. Unter **Mehr → Profil** den **Dämpfer-Hub** eintragen (für den Sag-Rechner) sowie den **max. Gabeldruck** vom Aufkleber am Gabelholm.
   - Unter **Termine** das Übergabedatum, das Rechnungsdatum und die Flow+-Aktivierung eintragen. Daraus berechnet die App die Zeit-Intervalle.
3. Auf dem Handy **Zum Startbildschirm hinzufügen**, dann läuft die App wie eine normale App.

### 3. Home Assistant

1. In `secrets.yaml` eintragen:
   ```yaml
   carbon_gurke_setup_url: "https://script.google.com/macros/s/DEINE_ID/exec?action=aktiv&token=DEIN_APP_TOKEN"
   ```
2. `homeassistant/carbon_gurke_setup.yaml` nach `/config/packages/` kopieren.
   - Voraussetzung: `homeassistant: packages: !include_dir_named packages` in `configuration.yaml`.
   - Ohne Packages den Block `rest:` direkt übernehmen.
3. Die Konfiguration prüfen und HA **komplett** neu starten (Schnelles Neuladen reicht beim ersten Mal nicht).
4. Ergebnis:
   - `sensor.carbon_gurke_setup`: Name des aktiven Setups, alle Werte im Attribut `werte`
   - Einzelsensoren als Template-Helfer (UI, Einstellungen → Helfer): `sensor.carbon_gurke_gabel_luftdruck`, `…_gabel_rebound`, `…_dampfer_luftdruck`, `…_dampfer_rebound`, `…_reifen_vorne`, `…_reifen_hinten`, `…_kiox_favoriten`. Ohne gespeichertes Setup sind sie „nicht verfügbar“.

## Kosten

Ein KI-Tipp kostet mit Sonnet 5.5 grob 1–2 Cent. Das ist geschätzt bei etwa 4.000 Eingabe- und 600 Ausgabe-Tokens, der genaue Wert hängt vom Verlauf ab. Mit Haiku 5.5 deutlich weniger.

## Daten

- Das Repo enthält **keine** persönlichen Daten.
- Alle Einträge liegen im Google Sheet „Carbon-Gurke Setup“ in deinem Drive:
  - Blatt `Daten`: Rohdaten
  - Blatt `Setups`: lesbare Tabelle
  - Blatt `Rückmeldungen`: Rückmeldungen und KI-Tipps
  - Blatt `Wartung`: Wartungsprotokoll mit Links zu den Belegen
- Die Belege liegen im Drive-Ordner „Carbon-Gurke Belege“. Sie sind nicht freigegeben, nur du kannst sie öffnen.
- URL und Token stehen nur im Browser-Speicher deines Geräts.
- Eine Sicherung als JSON gibt es unter **Mehr → Exportieren**.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html`, `app.js`, `styles.css` | App |
| `wartung.js` | Wartung: Aufgaben, Fälligkeit, Protokoll, Belege, Bericht |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline-Fähigkeit, Installation, Icons |
| `apps-script/Code.gs` | Backend: Sheet, Claude-API, Belege in Drive, Endpunkte für HA (`aktiv`, `wartung`, `stand`) |
| `homeassistant/carbon_gurke_setup.yaml` | HA-Package (REST-Sensor; Einzelsensoren sind UI-Helfer) |

## Schnittstellen für Home Assistant

| Aufruf | Zweck |
|---|---|
| `GET …/exec?action=aktiv&token=…` | aktives Setup (REST-Sensor) |
| `GET …/exec?action=wartung&token=…` | letzter Eintrag je Aufgabe W01–W17, Stand, Termine. Die Fälligkeit rechnet HA. |
| `POST …/exec` mit `{"action":"stand","token":"…","km":123.4,"motorstunden":7}` | Kilometerstand und Motorstunden, z. B. aus der Bosch-Integration |

Die Erinnerungen in HA (Telegram mit „Erledigt“) kommen, sobald die Bosch-Integration nach der Übergabe läuft.
