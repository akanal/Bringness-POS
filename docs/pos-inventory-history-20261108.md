# POS: Zählhistorie — Zehnerblock

## Umfang

1. Nur neue Speicherungen protokollieren; keine alten Vorgänge erfinden. Aufnahmebeginn wird bei der Migration einmalig gespeichert und angezeigt.
2. Vorher-/Nachher-Werte für Stückbestand, Mindestmenge und Zielmenge mit Revisionen speichern. Ein vorhandener Altbestand ist eine bekannte Ausgangs-Momentaufnahme, keine nachgetragene Historie.
3. Tatsächlichen Zählzeitpunkt aus derselben Datenbankänderung übernehmen.
4. Internes Konto als unveränderliche Kennung und damalige Anzeigenbezeichnung aufnehmen; keine E-Mail-Adresse speichern. Nur berechtigte Betriebsverwaltung sieht diese Angaben.
5. Lesbaren Artikelverlauf direkt aus der Bestandskarte öffnen, ohne offene Eingaben zu verwerfen. Historische Artikelbezeichnung bleibt bei Umbenennung/Deaktivierung erhalten.
6. Nach Artikelname, konkretem Artikel und lokalem Datumsbereich filtern. Enddatum einschließlich des gewählten Tages. Reihenfolge durch fortlaufende interne Ereignisnummer pro Betrieb/Firma; weitere Seiten bleiben auf dem gewählten Stand.
7. Aktuelle Anmeldung, aktive Inhaber-/Adminrolle und Betrieb/Firma bei jeder Seite prüfen. Historische Firma zusätzlich speichern und filtern; eine spätere Betriebszuordnung legt keine fremde Historie offen. Keine Verbindung mit Markt- oder AI-Beständen.
8. Eigenen CSV-Export für die vollständige gefilterte Historie bereitstellen, unabhängig von der bestehenden Bestandsübersicht. CSV-Formelschutz und Originalzeitpunkt/Kontokennung. Oberhalb5000 Ereignissen Filter eingrenzen; keine unbemerkte Teildatei.
9. Zählstand, Historie und Vorgangsbestätigung atomar speichern. Identische Wiederholung erzeugt genau einen Eintrag; Konflikt oder Historienfehler verändert keinen Zählstand. Datenbanktrigger sperren normale UPDATE/DELETE/TRUNCATE der Historie. Das ist keine zertifizierte Fiskal-/Manipulationssicherheitszusage gegenüber Datenbankadministratoren.
10. Bestehende Bestands-/Entwurfs-/Wiederholungsabläufe erhalten und neue SQL-/HTTP-/DOM-/Browserfälle prüfen; über vorhandenen Netcup-Weg bereitstellen und verifizieren.

## Bedienung und Grenzen

POS → Einstellungen → Bestand und Geräteprüfung → Zählhistorie. Einträge aufklappen, um Vorher-/Nachher-Werte und internes Konto zu sehen. Suche/Datumsänderung entwertet vorherige Ergebnisse/Exporte. Speichern entwertet die geladene Historie; danach ausdrücklich neu laden. Beim Konto-/Betriebswechsel private Historie leeren; späte Antworten dürfen sie nicht wiederherstellen. Historienlesen verändert keine Entwürfe, Verkäufe oder Nachbestellungen. Während Speicherung/unklarer Antwort bleiben vorhandene Sperren wirksam.

Protokolliert werden Speicherungen über die neue POS-Bestands-API. Frühere API-Versionen oder direkte Datenbankeingriffe werden nicht rückwirkend zu Ereignissen umgedeutet. Keine Wiederherstellen-/Löschen-Schaltfläche und keine automatische Bestandskorrektur aus einer historischen Zeile.

## Arbeitsweise

Vorgabe des Eigentümers zusätzlich in AGENTS.md gespeichert: den genehmigten Zehnerblock zusammenhängend abarbeiten, vorhandene Funktionen übernehmen, kleine Fehler sofort korrigieren, bei blockierten Teilen unabhängige Arbeiten fortsetzen und tatsächliche Restprobleme zum Abschluss zusammenfassen. Keine wiederholten Routinefreigaben; Sicherheits-, Kosten- und Zugangsgrenzen bleiben erhalten.

## Verifizierte Umsetzung

PR271: Feature64a7eb6169e7f060ab385666233226fa2c2abf6b / Tree15b95094417c30eb7f44edcf709490438153578f / Merge80491c8e614b7d53176cc3c6a71c5847a4b0274d. Lokal705 allgemeine und18 Bestands-DOM-Tests sowie beide Bestands-/Historien-HTTP-/PGlite-Skripte erfolgreich. Alle sechs finalen PR-CI erfolgreich: Shop42433447977/job128587135442 mit812 Tests und tatsächlichem PostgreSQL-/HTTP-/Browser-Einstieg; POS/AI42433447916/job128587135192 einschließlich neuem Historien-SQL-Skript; Farben42433447957; isoliert42433447925; checks42433447901; release42433447909. Finale Bilder13598274376 bei390/1280px visuell geprüft.

Zusätzliche Abnahmefälle: alter Vorgang bleibt ohne nachgetragene Historie; aktualisierte Namensbezeichnungen verändern keine alten Einträge; gleiche parallele HTTP-Anfrage erzeugt genau eine Zählung/einen Historieneintrag; Zähl- und Historienzeitpunkt sind auf Datenbankebene exakt gleich. Artikeldeaktivierung entfernt keine Historie. Fremde Firmen/Betriebe und Rollen bleiben abgewiesen. Seiten/CSV sind zusätzlich an die ursprüngliche Firma gebunden; Kontextwechsel oder verlorener Zugriff löschen private Ergebnisse und brechen CSV ab. Ein Artikel mit fremdem früherem Betriebs-Zählstand wird nicht in eine neue Historie kopiert oder stillschweigend umgebucht.

Unmittelbar vor Zusammenführung authentifizierte Sicherung42211075899/job128588465868 bestätigt Database backups validated. Keine produktiven Konten, Zählstände oder Verkäufe zur Prüfung angelegt.

Netcup42433941102/job128588626664 deployt exakt80491c8e614b7d53176cc3c6a71c5847a4b0274d; vorheriger Container und Datenbanksicherung behalten. Main-POS/AI42433941080/job128588626424 und Farben42433941081/Jobs128588626367,128588626569,128588626601 erfolgreich. Live-HTTP: Health200/no-store; operations.js200/no-store/bytegleich; operations.css200/bytegleich mit neuer Asset-Version; eingebettete operations.html200/SAMEORIGIN mit Historiensteuerung und aktueller Asset-Version. Beide privaten Bestands-/Historienendpunkte ohne Anmeldung401/no-store. Keine produktiven Zählungen oder Konten zur Abnahme verwendet.

Der Live-HTML-Vergleich unterscheidet sich ausschließlich durch den vorhandenen automatisch eingefügten Scriptverweis /brand-logo.js; Historien-Markup und Versionsreferenzen entsprechen dem geprüften Dokument.
