# POS-Backend und Steuerberaterzugang

Auftrag vom 17. November 2026: vorhandenes POS-Backend und Steuerberaterzugang erweitern. Windows und Offline-Synchronisierung bleiben gesperrt, Bringness AI folgt nach POS. Das bestehende Backend läuft bereits; diese Arbeit ergänzt dessen Buchhaltungszugriff.

## Bedienung

In der Kasse: **Belege → Steuerberater & Finanzamt – Exportzentrum** öffnen, Betrieb und Zeitraum auswählen. Belegliste, Prüfpaket und Pfandjournal bleiben vorhanden. Neu sind **Belegpositionen CSV**, **Kassenabschlüsse CSV** und **Kassenabschlüsse JSON**.

Unter **Steuerberaterzugang freigeben** eine Bezeichnung und Zeitraum eingeben und den Link ausdrücklich erstellen. Die vorhandene Freigabe gilt sieben Tage (API 1–30 Tage). Nur der einmal angezeigte Link enthält das Geheimnis; in der Datenbank steht nur sein Hash. Die Freigabeliste zeigt aktive Links des gewählten Betriebs, ein Widerruf bleibt ausdrücklich möglich. Keine automatische E-Mail wird verschickt.

Der Steuerberater öffnet den vollständigen Link. Das Geheimnis verschwindet direkt aus der Adresszeile und bleibt ausschließlich im flüchtigen Seitenspeicher. Die Seite bietet die bisherigen Belegexporte sowie Positionen und gespeicherte Kassenabschlüsse. **Erneut laden** liest die Freigabe erneut; **Zugang schließen** entfernt den lokalen Inhalt und verhindert weitere Downloads aus verspäteten Antworten. Ein erneutes Öffnen benötigt den vollständigen Link. Bereits heruntergeladene Dateien können nicht nachträglich zurückgerufen werden.

## Datenumfang und Grenzen

- `GET /api/v1/accountant/cash-closings`: abgeschlossene `pos_cash_sessions` innerhalb des freigegebenen Betriebs und des inklusiven Abschlussdatums in Europe/Berlin. Offene Schichten werden nicht als Abschlüsse ausgegeben. Gespeicherte Anfangs-/Soll-/Zählbestände, Differenz, Zahlungsaufteilung und Einlagen/Entnahmen bleiben erhalten; interne Benutzerreferenzen und nicht benötigte Berichtsfelder werden nicht ausgegeben.
- Abschlussseiten: höchstens 100 Datensätze, stabile Sortierung nach Abschlusszeit/ID, PostgreSQL-Mikrosekunden und ein unveränderter Zeitstichtag in der Folgeseitenkennung. Später abgeschlossene Schichten liegen außerhalb dieses Stichtags. Das ist kein datenbankweiter historischer Snapshot.
- Positions-CSV verwendet Originalpreise, Mengen, gespeicherte Rabattzuordnung, Positionsbruttobeträge und ursprüngliche Steuersätze. Es erfindet keine Nettobuchung oder DATEV-Kontierung. CSV-Zellen sind gegen Tabellenformeln abgesichert.
- Kassen-CSV ist die Abschlussübersicht. Kassen-JSON enthält zusätzlich die gespeicherten Einzelbewegungen und Pfandkennzahlen; beide bleiben interne Bringness-Formate. Kein offizieller DSFinV-K-Export und kein vollständiger fiskalischer Z-Bericht. Die jeweiligen Beleg- und Abschlussdownloads haben getrennte, ausdrücklich gespeicherte Zeitstichtage.
- Jede geschützte Seite prüft die aktuelle Sitzung bzw. nicht widerrufene/unabgelaufene Freigabe innerhalb derselben Datenbanktransaktion. Freigabeänderungen und Exporte verwenden kompatible Zeilensperren: Ein bereits laufender berechtigter Lesevorgang darf enden, ein erfolgreich widerrufener Zugang kann keine neue Seite öffnen. Verwaltung prüft zusätzlich aktuellen Benutzerstatus, Rolle und Passwortsperre. Fremde Betriebe und abweichende Freigabeparameter werden abgewiesen.
- Konto-, Betriebs-, Zeitraumwechsel und Verlassen der Seite stoppen die Verwendung verspäteter Exportantworten. Das Pfandjournal erhält denselben optionalen Kontextschutz. Keine automatischen Finanz-, Windows-, Offline- oder AI-Änderungen.

## Technische Verifikation

- `npm test`: 740 allgemeine Tests erfolgreich, einschließlich Centformatierung/negativer Beträge und CSV-Schutz.
- `node server/ai-tests/accountant-access.mjs`: lokal PGlite erfolgreich: 205 Abschlüsse über mehrere Seiten, Berlin-Datumsgrenzen, Fremdmandant, aktuelle Sitzung, Ablauf/Widerruf, gesäuberte Berichtsdaten und keine Umsatz-/Zahlungsbuchung.
- `node server/ai-tests/accountant-ui.mjs`: echte Clientskripte mit DOM-Prüfung erfolgreich: Positionsdownload, bisherige CSV/JSON-Exporte, widersprüchliche Seiten, lokale Zugangsschließung sowie verhinderte Downloads nach Konto-/Betriebs-/Zeitraumwechsel.
- Vorhandene `offline-accountant.mjs`-Regression erfolgreich, ohne Änderungen am Windows-/Offline-Code.
- PostgreSQL-16-Prüfung einschließlich gleichzeitigem Widerruf und die nativen Chromium-/WebKit-Tests bei 390/1280px sind in bestehende CI aufgenommen. Der lokale Browserstart ist in dieser Ausführungsumgebung durch ein nicht erlaubtes Betriebssystem-Socket blockiert; keine bestandene lokale native Browserprüfung behaupten. Tatsächliche CI-/Veröffentlichungsergebnisse separat dokumentieren.

Keine produktiven Kundenkonten, Kassenabschlüsse, Belege, Zahlungen oder Freigaben wurden zur Prüfung angelegt.
