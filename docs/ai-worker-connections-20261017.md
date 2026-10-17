# AI-Hintergrundläufe: Verbindungsbelegung und Sperren

## Gefundener Fehler und Korrektur

Automatische Beschaffung, Lagerwächter und Zahlungsautomatik reservierten eine
Datenbankverbindung für ihre PostgreSQL-Sitzungssperre und forderten anschließend
weitere Verbindungen für ihre Arbeit an. Mit nur einer freien/verfügbaren
Poolverbindung kann ein Lauf damit auf seine eigene Verbindung warten. Mehrere
parallele Kontoläufe können auch einen größeren Pool vollständig belegen.

Die Läufe verwenden jetzt die bereits reservierte Verbindung für ihre Abfragen
und Transaktionen. Die Warenkorb-, Rechnungs- und Abofunktionen erhalten dafür eine
geborgte Datenbankschnittstelle. Sie behalten ihre bestehenden Transaktionsgrenzen,
geben jedoch nicht die übergeordnete physische Sperrverbindung frei. Ausschließlich
der besitzende Worker entsperrt und gibt diese Verbindung zurück.

Beim Lagerwächter und Abrechnungsworker wird ein fehlgeschlagenes oder nicht
bestätigtes Entsperren jetzt als Verbindungsfehler an den Pool gemeldet. Der Pool
entfernt die Sitzung, statt eine möglicherweise weiterhin gesperrte Verbindung an
den nächsten Aufrufer zu verleihen. Ein anderer Worker, der die Sperre besitzt,
wird nicht durch einen erfolglosen Konkurrenzversuch entsperrt.

Keine Gestaltung, Preise, Berechtigungen, Lieferantenfreigaben, Abozustimmungen,
Bankmandate oder Anbieterzugänge wurden dadurch geändert. Die Änderung schaltet
keine automatische Bestellung oder Abbuchung frei. Es gab keine externe Bestellung,
Anbieterzahlung, Mailzustellung oder produktive Bereitstellung.

## Zusätzliche Vorschaugrenze

Der direkte isolierte Start wies normale Mollie-Schlüssel bereits ab, berücksichtigte
aber den separat benannten `AI_MOLLIE_API_KEY` noch nicht. Die Umgebungsprüfung
weist jetzt auch diesen Schlüssel vor dem Anwendungsstart ab, sowohl für Live- als
auch für Testzugänge. Die vorhandene Container-Umgebungsallowlist, Fetch-Sperre und
Netzisolation blieben weitere unabhängige Grenzen. Der normale Produktionsmodus
wird dadurch nicht verändert. Der Schutztest prüft zugleich, dass der Schlüsselwert
nicht in einer Fehlermeldung erscheint.

## Tests

| Prüfung | Ergebnis / Umfang |
| --- | --- |
| Neuer Ein-Verbindungs-Regressionstest gegen bisherigen Code | Fehlgeschlagen, Fehler reproduziert |
| Derselbe Test mit der Korrektur | Bestanden; genau eine physische Verbindung, zwei getrennte Warenkorbtransaktionen, Freigabe erst nach Abschluss |
| Beschaffungs-/Lagerwächter-/Abrechnungs-Unitfälle | 20 bestanden; konkurrierende Sperren, Fehlerisolation, geborgene Verbindungen und unklare Entsperrung |
| Vollständige lokale POS-/AI-Integration | Bestanden; einschließlich bestehender Provisionsrechnungen, Abos, simuliertem Zahlungs-/Mailablauf, Lagerhinweisen und Beschaffung |
| Aktuelle Root-Suite | 436 bestanden, keine Fehler und keine übersprungenen Tests; enthält die 20 fokussierten Workerfälle und 8 Vorschau-Schutzfälle |
| Operations-Suite | 20 bestanden, keine Fehler oder übersprungenen Tests |
| Tatsächlicher PostgreSQL-16-Mehrverbindungstest | [39010042846](https://github.com/akanal/Bringness-POS/actions/runs/39010042846) auf `9ca3b8f` bestanden |

`server/ai-tests/automatic-concurrency.mjs` verwendet ausschließlich eine lokale,
wegwerfbare PostgreSQL-Testdatenbank und ein zufälliges eigenes Schema. Zwei
unabhängige Pools mit jeweils maximal einer Verbindung führen echte SQL-Abfragen,
Sitzungssperren und die vorhandene `cartTransaction` aus. Die Bedarfsplanung ist
gezielt vorgegeben und fragt die tatsächlichen Testbestellungen ab; dies ist kein
neuer Test der Wetter- oder Rezeptplanung.

Geprüft sind:

- erfolgreicher echter Checkout mit Poolgröße eins;
- zweiter Worker erhält `busy`, während die andere Sitzung die Kontosperre hält;
- genau eine Tagesbestellung und unveränderte Wiederholung aus einem anderen Pool;
- während der Planung entzogene Freigabe verhindert den Checkout;
- nach echtem Commit simulierte verlorene Bestätigung meldet die bereits dauerhaft
  gespeicherte Bestellung, ohne einen weiteren Checkout anzulegen;
- alle verwendeten Kontosperren sind nach dem Lauf von einer anderen Sitzung aus
  wieder erwerbbar;
- drei beabsichtigte Checkouts ergeben genau drei Bestellungen und drei passende
  automatische Bestellaudits; der widerrufene Lauf erzeugt keine Bestellung.

Die Fehler nach Commit werden in diesem Test gezielt an der Rückgabe ausgelöst;
das ist kein realer Netzwerkabbruch und keine Lieferanten- oder Bankabnahme.
Die tatsächlichen Provideraufrufe bleiben in den bestehenden Integrationstests
simuliert. Physische Geräte, Live-Mandate und Netcup-Betrieb sind weiterhin eigene
Freigabeschritte.

## Gespeicherte Änderungen

| Commit | Änderung |
| --- | --- |
| `44c7312` | Beschaffung nutzt eine einzige reservierte Verbindung; Regression reproduziert und abgesichert |
| `9ca3b8f` | Echte PostgreSQL-16-Konkurrenz-/Checkoutprüfung in der bestehenden CI |
| `d8c7e16` | Lagerwächter leiht seine Verbindung aus und verwirft unklar entsperrte Sitzungen |
| `481ee67` | Rechnungs-/Abo-/Mandats-/Vorankündigungsfunktionen im Worker nutzen dieselbe Verbindung; sichere Sperrfreigabe |
| `d0ef780` | Rechnungssteller wie bisher vor der ersten Datenbankverbindung prüfen |
| `827d69e` | Separate AI-Mollie-Zugänge im isolierten Vorschau-Start ebenfalls abweisen |

Die vollständige POS-/AI-Integration auf `d0ef780` ist in
[Lauf 39010279500](https://github.com/akanal/Bringness-POS/actions/runs/39010279500)
bestanden. Auch Center mit Chromium/WebKit, Releaseprüfungen und isolierter
Vorschauaufbau sind für diesen Worker-Code erfolgreich. Der abschließende
gemeinsame Codecheckpoint `827d69e` ist ebenfalls vollständig bestanden:
[POS-/AI-Integration 39010375997](https://github.com/akanal/Bringness-POS/actions/runs/39010375997),
[Root-Prüfung 39010375991](https://github.com/akanal/Bringness-POS/actions/runs/39010375991)
und [POS-Releaseprüfung 39010376001](https://github.com/akanal/Bringness-POS/actions/runs/39010376001).

Der isolierte tatsächliche POS-/AI-Stack samt HTTPS-Browser, Egress-Sperre,
verschlüsselter Rücksicherung und wiederholter ursprünglicher Barverkaufs-ID ist
auch auf `827d69e` in
[Lauf 39010375984](https://github.com/akanal/Bringness-POS/actions/runs/39010375984)
vollständig bestanden. Die Änderungen
liegen ausschließlich auf `staging/preview-20261016`; Main und Produktion bleiben
unverändert.
