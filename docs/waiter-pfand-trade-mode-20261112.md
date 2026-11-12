# Pfand und gespeicherte Händler-Rabattart — 12.11.2026

## Ergebnis
Die Kellner-App berücksichtigt vorhandene Pfandregeln je Artikel und Gebinde. Pfand erscheint am Artikel und gesondert im Warenkorb. Servergesamtbetrag, getrennte Finanzposition und Pfand-Ledger werden in derselben Transaktion gespeichert. Mengenänderungen ändern das ursprünglich gespeicherte Pfand gemeinsam mit der Artikelmenge. Pfand lässt sich nicht unabhängig davon über die Kellner-Mengenkorrektur entfernen.

Die Händleroption hat in den geschützten Betriebseinstellungen eine Wahl zwischen Mengenstaffeln und Prozentrabatt auf den Warenwert. Der Standard bleibt Mengenstaffeln. Die Wahl wird pro Betrieb in PostgreSQL gespeichert und bleibt bei Verkauf, Reload und Neustart bestehen. Umstellen dürfen Betreiber/Admin mit bestehender sitzungsgebundener Verwaltungs-PIN; veraltete Änderungen überschreiben keinen neueren Stand.

Im Prozentmodus gilt der ausdrücklich gespeicherte Händlergrundpreis ab Menge1. Mengenstaffeln bleiben gespeichert, werden dabei aber nicht zusätzlich angewendet. Der Prozentsatz wird pro Verkauf gewählt; die Rabattart bleibt gespeichert. Pfand ist immer vom Rabatt ausgeschlossen. Normaler Einzelhandel bleibt unverändert.

Beispiel: 5 Artikel zum Händlergrundpreis10€ ergeben50€ Warenwert.10% ergeben45€ plus2,50€ Pfand =47,50€. Im Mengenmodus gilt stattdessen die hinterlegte Staffel, z.B.5×8€ plus2,50€ Pfand =42,50€.

Unbestätigte Bestellungen/Zahlungen behalten ursprüngliche Kennung, Betrag und Originalanfrage nach Verbindungsverlust oder späterer Konfigurationsänderung. Neue Verkäufe mit veralteter Rabattart müssen den aktuellen Betrag erneut prüfen. Keine echten Produktionsbestellungen/Zahlungen zur Abnahme angelegt.

## Ursache und Änderung
waiter/order-v2 berechnete und speicherte bisher kein Pfand und traf damit auf die vorhandene SQL-Pfandsperre. Nun nutzt dieser Pfad dieselbe bestehende depositQuote-Logik und atomare Snapshot-Speicherung wie die vorhandene POS-/QR-Finanzlogik; die Finanzsperre bleibt aktiv. Server und App prüfen das angezeigte Pfand und den Gesamtbetrag vor einer neuen Buchung.

## Prüfung
Lokale713 Root-Tests erfolgreich. Focused PGlite: tatsächliches Fundament mit SQL-Finanzsperre, Gebindemengen/Steuer/Varianten, fehlender/falscher Pfandbetrag, vollständiger Rollback, UUID-Kanonisierung, alte Preis-Snapshots, Mengenberichtigung, Rollen-/Firmen-/PIN-Schutz, dauerhafte Moduswahl, veraltete Einstellungsstände, keine Rabattstapelung, Pfand ohne Rabatt, unveränderte Wiederholung und erhaltene Preisstaffeln. UI-Tests sowie bisherige Händler-, Pfand-, Dienst- und Tischbereichstests erfolgreich. PostgreSQL16 erfolgreich. Je28 native POS-/Service-Browserprüfungen in Chromium und WebKit erfolgreich. Alle7 Release-Workflows am geprüften Head240dd3c67c806e92bb89939327e6960933be7085 erfolgreich: Bringness43225540418, POS-Release43225540619, Center43225540397, Preview43225540301, POS/AI43225540336, Navigation43225540645, Shop43225540411.

## Veröffentlichung
PR298 zusammengeführt und veröffentlicht: d3ba4f55fba562ee0b9628c7857531765cd2aa68, Quellbaum2102ca041384b883f734cab9431e4a4215629d7c. Netcup43227931249/job131215889886 erfolgreich; authentifiziertes Log bestätigt exakt diesen POS-Deploy sowie erhaltenen vorherigen Container und Datenbanksicherung.

Liveprüfung am12.11.2026 nach14:32 Europe/Berlin: /health HTTP200, status/database ok. /service/ und /pos/ liefern die neue Version deposit-trade-mode-20261112. Die3 geänderten JavaScript-Dateien stimmen bytegenau mit dem geprüften Repository überein. Private Händler-/Kellner-Endpunkte anonym401. Alle Antworten no-store. Funktionale Abnahme erfolgte mit synthetischen Daten in isolierten Datenbanken und Browsern; keine realen Produktionsverkäufe oder Pfandrückzahlungen zur Prüfung.

Bedienung: Mehr → Einstellungen → Händleroption → Händlerrabatt wählen → Mit Verwaltungs-PIN speichern. Prozentmodus benötigt hinterlegten Grundpreis ab Menge1. Danach im Händlerverkauf den Prozentrabatt aufklappen und den Prozentsatz für den Verkauf eingeben. Bestehender Mengenmodus wurde bei der Veröffentlichung nicht automatisch umgestellt.
