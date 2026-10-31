# Marktplatz – Preisentscheidung für den Start

Stand: 2026-10-31. Vom Eigentümer im Gespräch festgelegt.

- Verkaufsprovision zum Start: 5 Prozent.
- Monatliche Händlergrundgebühr zum Start: 0 EUR. Es wird keine Grundmiete erhoben.
- Eine spätere monatliche Grundgebühr bleibt eine mögliche Weiterentwicklung des Geschäftsmodells. Betrag, Zeitpunkt und Bedingungen sind nicht festgelegt. Keine automatische Einführung, Abbuchung oder rückwirkende Berechnung aus dieser Entscheidung ableiten.
- In der Wirtschaftlichkeitsplanung zunächst ohne Einnahmen aus monatlichen Händlergrundgebühren rechnen. Eine spätere Grundgebühr nur als getrenntes Szenario kalkulieren.
- Zahlungsabwicklungsgebühren werden gemäß besprochenem Modell separat transparent ausgewiesen; tatsächliche Konditionen und Kostentragung vor Umsetzung bestätigen.
- Bestätigte Basis: 5 Prozent vom Nettowarenwert, ohne Warenumsatzsteuer und ohne Versandkosten. Nicht vom Händlergewinn. Zahlungsgebühren trägt der Händler zusätzlich.
- Vollständige Erstattung: vollständige Bringness-Provision zurück. Teilerstattung: die auf den erstatteten Nettowarenwert entfallende Provision zurück; Provision für behaltene Ware bleibt. Kumulativ centgenau runden, damit mehrere Teilerstattungen zusammen die ursprüngliche Provision vollständig zurückgeben.
- Umsatzsteuer auf die Bringness-Dienstleistung bleibt separat zu klären; der Ausschluss der Warenumsatzsteuer entscheidet diese Frage nicht.
- Öffentliche Konditionen nennen 5 Prozent Verkaufsprovision und 0 EUR monatliche Grundgebühr, ohne Hinweis auf eine mögliche spätere Grundgebühr.
- Vor späterer Preisänderung sind transparente Händlerinformation und die erforderlichen vertraglichen Voraussetzungen zu klären. Diese interne Dokumentation ersetzt keine Händlervereinbarung.

Dies dokumentiert die Produktentscheidung. Keine technische Gebührenaktivierung, Mollie-Konfigurationsänderung oder Freigabe echter Zahlungen wurde damit durchgeführt.

## Technischer Stand dieser Umsetzung

Neue Händlerbestellungen speichern die versionierte Nettoprovision im unveränderlichen Auftragssnapshot. Bestehende Aufträge werden nicht nachberechnet. Versand wird anhand des servergeprüften Versandbetrags abgezogen, nicht anhand einer Artikelnummer. Die Rückrechnungsfunktion verarbeitet kumulierte bestätigte Nettowaren-Erstattungen mit centgenauen Differenzen und begrenzt sie auf den ursprünglichen Warenwert.

Noch kein automatischer Mollie-Geldfluss: Der bestehende Testadapter und der Live-Leseadapter akzeptieren bislang keine Application Fee. Vor tatsächlichem Gebührenabzug und Provisionserstattung sind Anbieteranbindung, transaktionale Zuordnung bestätigter Erstattungen zu Warenpositionen, dauerhafte Deduplizierung und Anbieterprüfung erforderlich. Ein Brutto-Erstattungsbetrag allein genügt bei gemischten Steuersätzen und Versand nicht. Keine echten Zahlungen oder Rückzahlungen ausgelöst.


## Präzisierung Provisionsguthaben, 31.10.2026

Die Rückgabe der Provision erfolgt als Händlerguthaben zur ausschließlichen Verrechnung mit künftigen Verkaufsprovisionen. Auszahlung erst nach wirksamer Vertragsbeendigung durch Kündigung, kein Verfall. Ausbleibende Verkäufe allein lösen keine Auszahlung aus. Käufererstattungen sind unabhängig davon. Siehe [Guthabenentscheidung, AGB-Entwurf und technische Grenzen](marketplace-credit-policy-20261031.md). Keine bereits erfolgte Mollie-Aktivierung oder Rechtsprüfung daraus ableiten.
