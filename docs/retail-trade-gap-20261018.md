# Bildabgleich und Trennung Normalbetrieb / Händler

Stand: 18.10.2026. Alle acht lokalen Originalbilder erneut angesehen: 01-91800, 02-91798, 03-91799, 04-91797, 05-91796, 06-91795, 07-91794, 08-91793. Codebasis: GitHub main 19051bc, darauf dieser Entwicklungsbranch. Bilder sind Funktionsreferenzen; kein Kopieren des alten Designs. Sichtbare fremde Menüs beweisen keine tatsächliche Funktion des Referenzsystems.

## Verbindliche Trennung

Normale Grundkasse bleibt ohne Händleroption nutzbar. Händler ist kostenlos und pro Betrieb standardmäßig ausgeschaltet; Inhaber/Admin aktiviert in Einstellungen mit Verwaltungs-PIN. Danach erscheint Händler unter Mehr. Kein Abonnement/keine Zahlung. Rabatte und geparkte Bons bleiben unabhängig. Pfand/Leergut wird für beide Betriebsarten benötigt, im Handel zusätzlich große Mengen/Kästen. Pfand ist noch nicht umgesetzt.

## Differenzliste

„Vorhanden“ beschreibt gefundenen Code, nicht einen neuen authentifizierten Produktionstest. Livebasis bleibt bis Freigabe unverändert. „Neu geprüft“ unten betrifft ausschließlich den Händlerschalter und die automatisierten Regressionen.

| Bild / Funktion | Normale Kasse | Händler | Fehlende Ergänzung / nächster Fix |
|---|---|---|---|
| 01/03 Artikelgruppen, Artikelwahl | vorhanden: pos/app.js Kategorien/Produkte | vorhandener eigener Katalog | keine bekannte Basislücke |
| 01/03 Menge, Plus/Minus, Entfernen/Abbruch | vorhanden, numpad.js und Warenkorb | vorhanden, große Mengen | Eingaben bleiben auf gültige Grenzen beschränkt |
| 01/03 EAN suchen/scannen | separates bezahltes EAN-Modul | keine eigene Scanbedienung | Händler-Scan explizit an denselben Modulschutz anbinden, falls ergänzt |
| 01/08 Prozent-/EUR-Rabatt | vorhanden online, sale-tools.js | vorhanden online | Windows-Offline-Rabatte fehlen |
| 01/03/08 Bon parken | vorhanden online, versionierter unbezahlter Entwurf | vorhanden online | Windows-Offline-Parken fehlt |
| 01/03 Pfand und Leergut | fehlt, auch für Getränkekiosk nötig | fehlt, zusätzlich Kästen/Großmengen | Artikel/Gebinde-Pfand und revisionsfähige Rücknahme/Verrechnung für beide |
| 01/03/08 Kunde | keine POS-Kundenstammdaten | Empfänger nur je Verkauf gespeichert | Kunden anlegen/suchen/wiederverwenden, Adresssnapshots bewahren |
| 03 Diverse/freie Artikel | fehlen im geschützten Checkout | fehlen | servervalidierte freie Positionen/Preis/Steuer, Berechtigung und Audit |
| 02/04 Rechnungswesen/Archiv | Belege und PDFs vorhanden | A4-Rechnung und Archiv vorhanden | Kundenbezogene Übersicht/Verknüpfung ergänzen |
| 02/04 Auftrag erstellen/bearbeiten | geparkter Bon als begrenzter Entwurf | ebenso | eigener Auftrag mit Historie/Status und späterer Erfüllung fehlt |
| 02/04 Bestellung/Mindestmenge/Bestellhistorie | AI hat getrennte Beschaffung mit Mindestmengen/-werten | Händlerstaffeln vorhanden | kein gleichwertiges POS-Auftragswesen; AI-Einkauf nicht als Kundenauftrag ausgeben |
| 05 Programm/Funktionen/Artikel/Umsatzsteuer | Teilweise: geschützte Einstellungen, Artikel-/Steuerdaten | gemeinsame Basis und separate Bruttopreise | kein vollständiger neuer Funktionseditor |
| 05 Personalverwaltung / 06 Bedienerabrechnung | separates Personalmodul, Dienstzeitenberichte | unabhängig von Händler | Verkaufsumsätze je Bediener als eigener Bericht fehlen |
| 05 Zahlungen / 08 Bar, EC/Visa/Mastercard/PayPal/Rechnung | Bargeld und geschützte Providerpfade vorhanden | bisher ausdrücklich nur Barverkauf | keine ungeprüfte Kartenbuchung; Terminal-/Providerbestätigung, Rechnungskredit separat entwickeln |
| 05 EAN-Einstellungen | vorhanden als Zusatzmodul | keine eigene EAN-Zuordnung nötig | Rechte/Abomodell unverändert |
| 05 Stornogründe / 06 Stornobericht | Teilstorno/Tischabläufe sind kein vollständiger Verkaufsrefund | fehlt | bezahlte Verkäufe mit Teil-/Vollerstattung, Originalbezug, Grund und Audit |
| 05 Presse/VMP | fehlt | fehlt | Anbieterspezifikation und Integration |
| 05 Datensicherung/Sicherungskopie | Server-Backupautomation und Offline-Persistenz vorhanden | gemeinsame Infrastruktur | kein vollständiger kundenbedienter Backup-/Restore-Manager; Wiederherstellbarkeit getrennt prüfen |
| 05 Geräte-Manager/Sonderwaagen | Teilweise Scanner/Druck über vorhandene Ausgabe | keine Spezialwaagen | dokumentierte Geräteadapter und reale Hardwaretests fehlen |
| 05 Bon/Rechnung/A4-Dokumente, 08 Bon drucken/A4 | Bon-PDF/QR vorhanden | A4-Rechnung mit Originalbeleg/QR vorhanden | kein allgemeiner A4-Vorlageneditor |
| 05 Gutscheinverwaltung / 06 Gutscheinjournal | fehlt | fehlt | Ausgabe/Einlösung/Restguthaben und unveränderliches Journal |
| 05 Terminplaner | Personaldienstplanung separat vorhanden | kein allgemeiner Kundenkalender | keinen vollständigen Terminplaner behaupten |
| 05 Label-Manager | kein Etikettendrucksystem | fehlt | Layout, Drucker und Etikettenausgabe |
| 06 Kassensturz/Kassenjournal/Z-Abschlag | fehlt als vollständiger Ablauf; Schichtmenü nur Beschreibung | gemeinsame Kasse | Öffnung/Anfangsbestand, Einlagen/Entnahmen, Zählung/Differenz, gesperrter Abschluss |
| 06 Export Buchungsdaten / Fiskalprüfung / GDPdU / DSFinV-K / TSE | CSV/Steuerberater und interner Prüfexport vorhanden | einschließlich Händlerbelegen/Rabatten | offizieller DSFinV-K/TSE-Export offen; accountant-access meldet officialDsfinvk:false |
| 06 Warenbestand | Bringness AI getrennt vorhanden | keine gleichwertige vollständige POS-Warenwirtschaft | POS-Bestands-/Gebindeflüsse und Reports vervollständigen |
| 06 Umsatz/Monat/Verkaufsstatistik/Artikel, 07 Warengruppen | Beleglisten und Zeitraum-Summen als Teilbasis | Rechnungsarchiv als Teilbasis | eigene Monats-, Artikel-, Warengruppen-, Steuer- und Bedienerauswertungen fehlen |
| 06 Leergutbericht | fehlt | fehlt | gemeinsam mit Pfand entwickeln |
| 06 Programmierprotokoll | Teilweise technische Auditspuren | dito | umfassendes geschäftliches Änderungsjournal noch nicht nachgewiesen |
| 08 Gegeben/Rückgeld/Tastatur | vorhanden, numpad.js | exakte Barsumme statt eigener Wechselgeldansicht | Foto-Geldschein/-Münz-Schnelltasten fehlen |
| 08 Bemerkung | Notizen in bestehenden Bestellabläufen teilweise vorhanden | kein eigenes allgemeines Rechnungsnotizfeld | genaue Zuordnung/Belegsnapshot ergänzen |
| 08 Kundenlieferschein | fehlt im POS; AI liest eingehende Lieferantenbelege | fehlt ausgehend | eigenständiger Kundenlieferschein mit Nummer, Empfänger und Positionssnapshot; keine Zahlung vortäuschen |

## In diesem Block umgesetzt

- Dauerhafter Betriebsschalter `restaurants.pos_trade_enabled`, Default false; bestehende Daten werden erhalten.
- Authentifizierter, mandantengebundener GET und nur Inhaber/Admin+gültiger, sitzungsgebundener PIN-Entsperrung erlaubter PUT `/api/v1/trade/settings`.
- Navigation lädt den Betriebsstatus neu; veraltete Antworten eines vorher gewählten Betriebs werden verworfen, Fehler zeigen Händler nicht versehentlich an.
- Direktaufruf bei ausgeschalteter Option erklärt die Aktivierung. Eine lokal unterbrochene Zahlung bleibt abgleichbar. Bestehende Händlerbelege bleiben über Belege abrufbar.
- Checkout kontrolliert die Aktivierung unter der bereits vorhandenen Betriebssperre. Ein identischer bereits verbuchter Request wird vor dem neuen Schalter geprüft und kann auch nach Deaktivierung ohne Zweitbuchung wiederholt werden.

## Testbericht

| Prüfung | Ergebnis | Ursache / nächster Fix |
|---|---|---|
| Vollständige Unit-Suite | bestanden: 510/510 | keine Fehler |
| Trade-Integration inkl. PDF | bestanden lokal (PGlite) | Default aus, PIN, falscher PIN, Manager-Abweisung, Mandantentrennung, Ein/Aus, Verkaufsblock, Replay nach Aus und Belegerhalt geprüft |
| Händler-UI bestehender Verkaufsablauf | bestanden | Mengenstaffeln, Rabatt, unklare Antwort/Neustart, identischer Retry und beschädigter Speicher |
| Händlerschalter-UI | bestanden | Default unsichtbar, Ein/Aus, fehlende PIN-Freigabe, Fehleranzeige und verspätete Antwort nach Betriebswechsel |
| Produktion mit Inhaberlogin | nicht ausgeführt | keine Liveschaltung in diesem Block; Freigabe erforderlich |
| Reale Geräte / weitere Foto-Funktionen | nicht vollständig geprüft/implementiert | offene Zeilen oben bleiben offen |

Priorität danach: Kundenstammdaten + ausgehende Lieferscheine; anschließend Pfand/Leergut für beide Ansichten; dann Kassenbuch/Abschluss und zugehörige Berichte. Keine produktive TSE-Aktivierung oder echte Zahlung ausgelöst.
