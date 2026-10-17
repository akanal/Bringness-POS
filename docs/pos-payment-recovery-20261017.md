# POS-Zahlungswiederanlauf — 17.10.2026 UTC

Entwicklungsbranch: `staging/preview-20261016`. Ausgangspunkt `e38a954`.
Keine produktive Bereitstellung, keine echte Zahlung und keine Provideraktivierung.
Diese Änderungen sind technische Sicherheitsreparaturen ohne neues Layout oder Tarifänderungen.

## Behobene Fehler

| Ablauf | Ursache | Fertiggestellte Änderung |
| --- | --- | --- |
| Online-Barverkauf | Verlorene HTTP-Antwort konnte beim erneuten Senden einen zweiten bezahlten Auftrag erzeugen | Dauerhafte, unternehmensgebundene Zahlungskennung; atomare Speicherung mit Auftrag, Zahlungen, Beleg und optionaler E-Mail-Queue; identische Wiederholung liefert denselben Beleg |
| Preis-/Rechteänderung während Checkout | Produktdaten und Benutzerberechtigung wurden außerhalb der Buchungstransaktion gelesen | Aktuelle Sitzung/Rolle/Betriebszuordnung und Produktdaten werden innerhalb derselben Transaktion gesperrt und geprüft |
| Browser-Neustart nach unsicherer Zahlung | Zahlungsanforderung und Kennung gingen verloren; Fehlermeldung behauptete zu sicher, nichts sei gespeichert | Unveränderte Anforderung wird vor Versand lokal gespeichert, ohne Zugangstoken; Wiederanlauf auch bei leerem Warenkorb; neue ungesendete Warenkorbänderungen bleiben erhalten |
| Alte Verkaufsroute | `/api/v1/orders` konnte die neueren Checkout-Prüfungen umgehen | Alter schreibender Zahlungsweg antwortet mit 410 und Aktualisierungshinweis; keine alte ungeschützte Verbuchung |
| Tischabrechnung | Wiederholung konnte inzwischen neu eingegangene Bestellungen abrechnen | Feste Bestell-ID-Liste und bestätigter Gesamtbetrag; unternehmensgebundene Wiederholkennung; Wiederholung liefert ursprüngliche Belege und lässt spätere Bestellungen offen |
| Teilweise vorhandene Finanzdaten | Offene Bestellung mit bestehender Zahlung/Beleg konnte erneut verbucht werden | Tischabrechnung blockiert widersprüchliche Finanzdaten zur manuellen Prüfung; keine zweite Zahlung oder zweiter Beleg |
| Kartenbestätigung im Browser | Ein bloßes Bestätigungsflag konnte die Tischabrechnung als bezahlt markieren | Unverifizierte Kartenverbuchung wird konsistent abgewiesen; manuelle Browserbestätigung ersetzt keinen serverseitigen Terminalnachweis |
| Bereits bezahlter Tisch nach Neuladen | Leere Bestellliste konnte den Wiederanlaufknopf deaktivieren; Wiederholung behauptete einen freien Tisch trotz späterer Bestellungen | Vorhandener lokaler Wiederanlauf bleibt ausführbar; Anzeige unterscheidet ursprüngliche Zahlung und tatsächlichen aktuellen Tischzustand |

## Datenbank und API

- Additive Tabellen: `pos_checkout_requests` und `pos_table_settlements`.
- Beide speichern Unternehmenskennung, UUID-Zahlungskennung, SHA-256-Fingerabdruck,
  unveränderliche Antwort und Zeitstempel. Das normale Checkout-Ledger referenziert
  außerdem den eindeutig zugehörigen Auftrag.
- Transaktionsgebundene Advisory Locks serialisieren gleichzeitige Anforderungen.
  Die Tabellen erzwingen die Eindeutigkeit zusätzlich dauerhaft.
- Abweichender Inhalt mit derselben bereits gebuchten Kennung ergibt 409.
  Preis-/Verfügbarkeitsänderungen verhindern nicht die Wiederholung einer bereits
  erfolgreich gespeicherten identischen Zahlung.
- `/orders/checkout` benötigt jetzt `requestKey` als UUID. Der geschützte POS-Client
  sendet diese automatisch. Alte Clients werden sicher abgewiesen und müssen
  aktualisiert werden.
- `/tables/settle` benötigt `requestKey`, `tableId`, `orderIds`,
  `expectedTotalCents` und `paymentMethod: "cash"`.
- Der Browser speichert je Betrieb bzw. Tisch ausschließlich die ausstehende
  Anforderung; kein Sitzungs-/Anbietertoken wird ergänzt.
- Sichere lokale Speicherung ist Voraussetzung für das Absenden. Bei fehlender
  vollständiger Bestätigung bleibt die Wiederanlaufanforderung erhalten.
- Ein nachweislich abgewiesener, korrigierbarer Betrag/Bestellstand verwendet bei
  erneuter Bestätigung dieselbe Kennung. Eine Korrektur kann deshalb keinen
  weiteren bereits verbuchten Vorgang mit neuer Kennung erzeugen.
- Neue Verkäufe werden erst nach erfolgreicher eindeutiger Bestätigung aus dem
  Wiederanlaufspeicher entfernt. Bei unklarem Zustand nicht erneut Bargeld kassieren.
- Fiskalstatus bleibt ehrlich `pending`; keine Cloud-/Hardware-TSE wird vorgetäuscht.

## Prüfnachweise

Lokal bestanden:

- 421 Root-Tests, null Fehler und null übersprungene Tests.
- 37 Desktop-Tests und 15 Operations-/Workflowtests.
- `checkout-recovery.mjs`: echter Loopback-HTTP-Abbruch nach Server-Commit,
  identische Wiederholung trotz verändertem/inaktivem Produkt, Kennungskonflikt,
  Sitzung/Passwort-/Rollen-/Mandantenentzug und vollständiges Rollback bei
  fehlgeschlagener Speicherung der Wiederholkennung.
- `checkout-ui.mjs`: Browserzustand über Neuladen, Abgleich mit leerem Warenkorb,
  Doppelaufrufsperre, Erhalt neuer Warenkorbartikel, Speicherfehler,
  Kartenprüfung, Korrektur mit unveränderter Kennung und unvollständige Antworten.
- `table-settlement.mjs`: verlorene Antwort, ursprüngliche Belege wiederfinden,
  spätere Bestellungen offen halten, feste Bestell-/Betragssicht, gesperrte Rollen,
  widersprüchliche Teilzahlungen und atomarer Rollback.
- `settlement-ui.mjs`: tatsächlicher POS-Abrechnungsdialog bleibt bei leerem Tisch
  mit ausstehender Zahlung ausführbar; keine falsche Freimeldung bei Wiederholung.
- Bestehende Beleg-E-Mail-, POS-Anmelde- und vollständige POS/AI-Integration.

Die neuen HTTP-Suiten laufen zusätzlich gegen PostgreSQL 16 mit fünf gleichzeitigen
identischen Anforderungen. Nur eine legt die Zahlung an, vier erhalten die
ursprüngliche Antwort. Die Tests verwenden pro Lauf ein isoliertes Schema und
weisen externe Datenbankhosts ab. Simulierte Anbieter bleiben simuliert.

Zusätzlich führen Chromium und WebKit vier neue echte Browserfälle aus:
Barverkauf mit verlorener Antwort und Neuladen, Tischzahlung mit Neuladen,
Speicherfehler und gesperrte unverifizierte Kartenzahlung. Die Browserfälle
prüfen die produktiven Clientmodule gegen einen kontrollierten HTTP-Vertrag;
die separaten HTTP-/Datenbanksuiten prüfen die tatsächlichen Serverhandler.
Sie ersetzen keine Kundengerät- oder reale Netcup-Abnahme.

## Bereitstellungsgrenze

Vor einer späteren Freigabe müssen additive Migrationen, Serverhandler,
Clientmodule und HTML-Skripteinbindung gemeinsam bereitgestellt werden. Ein alter
Client darf nicht auf einen ungeschützten Ersatzpfad zurückfallen. Bestehende
Aufträge, Preise, Lizenzen, Belege und Zahlungen werden nicht migriert oder gelöscht.

Unverändert extern offen: reale Mollie-/Terminal- und TSE-Abnahme,
Hardware-TSE/SDK, Windows-Organisationszertifikat, isolierter Netcup-Stagingzugang,
Drucker-/Scanner-/Kundengerätetests und noch nicht abschließend freigegebene
Modulvertriebsbedingungen. Keine dieser Voraussetzungen wird durch erfolgreiche
simulierte Tests als erledigt bezeichnet.

## Gespeicherte Entwicklungscommits

| Commit | Inhalt |
| --- | --- |
| `45c4816` | Dauerhafte Checkout-Kennung, atomare Antwort und aktuelle Rechte-/Preissperren |
| `f0fab66` | Browser-Wiederanlauf für unklare Barverkäufe |
| `2aa6a25` | Alten ungeschützten Checkout sperren und PostgreSQL-Recovery in CI prüfen |
| `1bef384` | Tischabrechnung mit fester Bestell-/Betragssicht und dauerhafter Wiederholung |
| `7e02cfe` | Tischzahlungs-Wiederanlauf im vorhandenen POS-Dialog |
| `5ede444` | Gleichzeitige Zahlungen, HTTP-Ausfall und DOM-Wiederanlauf in CI |
| `4e761e3` | Echte Chromium-/WebKit-Prüfungen für Zahlungswiederanlauf |

## GitHub-Prüfstand

Codecheckpoint `4e761e3743525906314bb6aecc3296e2daf76aff`:

- [Root-Prüfung 39006584984](https://github.com/akanal/Bringness-POS/actions/runs/39006584984): erfolgreich.
- [POS-Release-Regression 39006584950](https://github.com/akanal/Bringness-POS/actions/runs/39006584950): erfolgreich.
- [Center und Zahlungsbrowser 39006584970](https://github.com/akanal/Bringness-POS/actions/runs/39006584970): Chromium und WebKit erfolgreich; alle vier neuen Zahlungsfälle je Engine sowie vorhandene Center-/PostgreSQL-Prüfungen bestanden.
- [Vollständige POS/AI-Integration 39006585088](https://github.com/akanal/Bringness-POS/actions/runs/39006585088): vollständig erfolgreich, einschließlich PostgreSQL-16-Wiederanlauf und fünf gleichzeitiger Anforderungen für normale Verkäufe und Tischzahlungen, bestehender Offline-/Steuerberater-, Personal-, Gast-, Billing- und simulierter Fiskalprüfungen.

Der abschließende Dokumentationscommit ergänzt nur diesen Prüfbericht.
