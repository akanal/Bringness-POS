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
