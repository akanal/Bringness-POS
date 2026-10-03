# Automatischer Monatsabschluss

Der Superadmin kann unter Zahlungsautomatik zusätzlich „Rechnungen aus abgeschlossenen Monaten automatisch erstellen und zum Einzug freigeben“ einschalten. Ohne diesen Schalter bleibt der bisherige Weg mit extern erstellter Rechnung und Einzelfreigabe bestehen. Alle Automatiken sind zunächst aus.

## Voraussetzungen

- Einzugsautomatik aktiv, separater AI-Mollie-Live-Zugang und SMTP eingerichtet.
- Geprüfter Rechnungssteller, Geschäftsanschrift, Steuerreferenz, Gläubiger-ID, Land Deutschland und ausdrücklich bestätigte Steuerregelung.
- Steueroptionen sind Regelbesteuerung mit 19 % auf die Vermittlungsprovision oder vom Betreiber bestätigte Kleinunternehmerbefreiung. Es gibt keine stillschweigende Steuerannahme.
- Lieferant hat ein vollständiges deutsches Rechnungsprofil samt Rechnungs-E-Mail und ausdrücklicher Zustimmung zum Empfang sonstiger elektronischer Rechnungen im HTML-Format.
- Anbieter bestätigt ein passendes gültiges SEPA-Mandat.

## Ablauf

Abgeschlossene Monate werden aus den bestätigten Wareneingängen gebildet. Vor Ausstellung werden die einzelnen Bestellungen unter Sperren erneut gegen Status und Zahlungsnachweise geprüft. Die gespeicherte Nettoprovision ist Grundlage; Umsatzsteuer wird mit Ganzzahlberechnung auf den Rechnungsnettobetrag gerundet. Eine eigene Sequenz erzeugt eindeutige `BAI-JAHR-NUMMER`-Nummern. Issuer, Empfänger, Leistungszeitraum, Beträge und Bestellgrundlagen werden als unveränderlicher Snapshot gespeichert. Ein Datenbanktrigger verbietet Updates und Löschen ausgestellter Rechnungen. Korrekturen brauchen gesonderte Dokumente; automatische Gutschriften sind noch nicht enthalten.

Rechnung und Einzugsfreigabe entstehen in derselben Transaktion, eindeutig je Monatsjob. Wiederholungen und Neustarts erzeugen keinen zweiten Beleg. Anschließend läuft der bisherige Vorankündigungs-/SEPA-Zahlungsteil ohne monatliche Einzelbestätigung. Die Rechnung wird der Vorankündigung als HTML-Datei beigefügt und an die im Rechnungsprofil angegebene Adresse gesendet. Sie bleibt im angemeldeten Lieferanten- und Adminbereich herunterladbar und im Browser druckbar. Änderungen am Profil verändern bereits ausgestellte Belege nicht.

Fehlende Voraussetzungen halten den Entwurf mit sichtbarer Begründung an; nach Ergänzung wird automatisch erneut geprüft. Technische Statusabfragen zu bestehenden Zahlungen werden sicher wiederholt, ohne einen neuen Zahlungsauftrag zu erstellen. Aktive Jobs, ausgestellte/bezahlte Jobs und Monatsentwürfe haben getrennte Verarbeitungsbudgets, sodass alte bezahlte Rechnungen den neuen Ablauf nicht blockieren.

## Formatgrenze

HTML ist eine sonstige elektronische Rechnung, keine strukturierte E-Rechnung nach EN 16931. Dieses Modul behauptet keine XRechnung-/ZUGFeRD-Konformität. Es nutzt nur den ausdrücklich zugestimmten sonstigen elektronischen Versand im unterstützten deutschen Fall. Konservativ werden ab Rechnungsdatum 2027 regelbesteuerte Rechnungen über 250 € brutto angehalten, bis strukturierter Rechnungsversand vorhanden ist; individuelle weitere Übergangsberechtigungen werden nicht angenommen. Kleinunternehmer- und Kleinbetragsausnahmen sind getrennt berücksichtigt. Andere Länder, Reverse Charge, öffentliche Auftraggeber, besondere Steuersätze und automatische Rechnungskorrekturen sind nicht unterstützt.

Primärquellen zur Implementierungsgrenze:
- https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html
- https://www.gesetze-im-internet.de/ustg_1980/__14.html

## Prüfung und Betrieb

Eingebettetes PostgreSQL und DOM mit simuliertem Zahlungsanbieter/Mailversand prüfen Pflichtangaben, ausdrückliche Steuer- und Formatfreigabe, fehlendes Profil, Cent-Rundung, Monatsschluss, eindeutigen Beleg, unveränderliche Snapshots, Schutz vor fremden Zugriffen und HTML-Escaping. Vorübergehende Anbieterfehler erzeugen keine Doppelzahlung. Bestehende Tests prüfen weiterhin Mandate, Einzug, Wartefrist, Zahlungseingang und Rücklastschrift-Ausnahme. Kein echter Bank- oder Steuerabnahmetest wurde durchgeführt. Die Live-Installation bleibt ohne Einrichtung ausgeschaltet.
