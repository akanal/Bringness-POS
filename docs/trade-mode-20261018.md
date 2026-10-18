# Händleroption – erster Funktionsblock, 18.10.2026

## Umgesetzt

Unter Mehr → Händler: eigener kostenloser Verkaufsbereich in der bestehenden Kasse. Kein zusätzliches Abo und keine Änderung an vorhandenen Modulpreisen. Rückkehr zur Grundkasse über Kasse. Normale Artikelpreise und bestehender Warenkorb werden nicht umgeschrieben.

Betriebsbezogene Bruttopreise und bis zu 20 Mengenstaffeln pro Artikel, Menge bis 999.999 Stück pro Position. Verwaltung nur mit bestehender Sitzung und Verwaltungs-PIN. Keine automatisch erfundenen Großhandelspreise. Ohne passende Staffel ist der Verkauf nicht möglich. Der Server berechnet jeden Preis erneut; ein abweichender Zahlbetrag wird vor Buchung abgelehnt.

Empfänger mit Firma/Name, Straße, PLZ, Ort, Land und optionaler USt-IdNr. Zahlung nur als ausdrücklich bestätigter, tatsächlich erhaltener Barbetrag über den vorhandenen atomaren Checkout. Keine unbestätigte Kartenbuchung und kein automatischer Rechnungskredit. Unklare Antworten behalten dieselbe Zahlungskennung und denselben Inhalt über einen Browserneustart. Die Bestätigung wird vor lokaler Bereinigung auf Kennung, Betrag, Betrieb und Beleg geprüft.

DIN-A4-PDF mit archiviertem Verkäufer und Empfänger, fortlaufender bestehender Beleg-/Rechnungsnummer, Rechnungs-/Lieferdatum, Mengen, Brutto-Einzelpreisen, Positionssummen, Steueraufschlüsselung, Zahlungsangabe und QR zum zugehörigen digitalen Beleg. Archiv im Händlerbereich. Händlerrechnungen nur für Owner/Admin/Manager desselben Unternehmens. Änderungen am Profil und Händlerpreisen verändern den gespeicherten Verkauf nicht. Es wird keine zweite Buchung oder neue Rechnung durch erneuten Download erzeugt.

Vor einem Händlerverkauf sind im bestehenden Rechnungsprofil vollständige Firmendaten und eine USt-IdNr. erforderlich. Alternative Verwendung einer Steuernummer wird in diesem Block nicht neu eingeführt. Fiskalstatus bleibt ehrlich sichtbar; A4-Ausgabe ist keine neue TSE-Freigabe. Nur online; keine Erweiterung der Windows-Offline-Snapshots um Händlerpreise in diesem Block.

## Prüfung

- 507 bestehende Unit-Tests lokal bestanden.
- Echte Datenbankintegration: Staffelgrenzen/-validierung, PIN, Rollen und Mandanten, große Mengen, falscher Betrag, unvollständige Adresse/Verkäuferdaten, Kartenverweigerung ohne Buchung, exakter Replay, unveränderlicher Empfänger, Rechnungsarchiv.
- Echtes PDF erzeugt und mit PDF.js geprüft: A4-Abmessungen, Empfänger, Rechnungsbezeichnung, Summe, ehrlicher Fiskalhinweis.
- Tatsächlicher Browserclient mit JSDOM: Mengenstaffelberechnung, HTML-Escaping, ausdrückliche Barbestätigung, verlorene Antwort, gleicher Request nach Browserneustart, beschädigter Speicher.
- Bestehende Checkout-Recovery und Checkout-UI lokal bestanden; Zahlungs-/Beleg-Regressionen bestanden (ein vorhandener optionaler Test übersprungen).
- Kein echter Verkauf, keine externe Zahlung und keine Testmail ausgelöst.

## Weitere Bildvorlagen: noch keine Fertigstellungsbehauptung

Die acht Fotos zeigen zusätzliche Wünsche: Rabatt in EUR/Prozent, Pfand/Leergut, Bon parken, Kundenverwaltung, Lieferscheine, Buchhaltung/Bestellerfassung und detaillierte Berichte (Kassensturz, Journal, Warengruppen, Storno, Gutschein, Steuerexporte). Dieser erste Block implementiert Händlerpreise, Großmengen und A4-Rechnung. Die übrigen Abläufe benötigen einen eigenen Abgleich und dürfen nicht anhand sichtbarer Menüpunkte als vollständig bezeichnet werden. Verifizierte Terminalanbindung und produktive Fiskalisierung bleiben externe Integrationspunkte.
