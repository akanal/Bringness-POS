# Händler-Provisionsguthaben

## Verbindliche Produktentscheidung

5 % des Nettowarenwerts, ohne Warenumsatzsteuer und Versand. Keine monatliche Grundgebühr und kein öffentlicher Hinweis auf spätere Grundgebühren. Zahlungsgebühren separat beim Händler. Vollerstattung: gesamte zugehörige Provision als Guthaben; Teilerstattung: entsprechender Anteil. Während des Händlervertrags ausschließlich Verrechnung mit künftigen Verkaufsprovisionen. Auszahlung erst nach wirksamer Vertragsbeendigung durch Kündigung. Kein Verfall, auch bei nachträglich bestätigten Rückgaben nach Vertragsende. Käufer erhalten ihren Kaufpreis unabhängig davon erstattet.

Die frühere Option einer Auszahlung allein wegen ausbleibender Verkäufe ist durch die ausdrückliche neue Eigentümerentscheidung ersetzt.

## Umsetzung

`server/shop-marketplace-credit.js` implementiert eine interne, transaktionale SQL-Guthabenbuchhaltung. Ein gemeinsames Kontoschloss serialisiert Guthaben, Verrechnung, Kündigung und Auszahlungsbestätigung. Unveränderliche Journale, eindeutige Referenzen, konfliktgeprüfte Wiederholung und kumulative Rundung schützen vor Doppelbuchungen und Übererstattungen. Nach Neustart bleibt das Guthaben erhalten.

Nur bereits gespeicherte bestätigte Live-Erstattungen desselben Händlerauftrags sind zugelassen. Eine tatsächlich abgerechnete Bringness-Provision (einschließlich eventuell verwendeten Guthabens) muss belegt sein. Ein obligatorischer vertrauenswürdiger Adapter muss zusätzlich die Zuordnung zu ursprünglichen Warenpositionen, Netto/MwSt./Versand und die vereinbarte Richtlinie prüfen. Ein Bruttobetrag allein wird nicht umgerechnet. Fehlende Adapter sperren jede Buchung. Testzahlungen werden nicht in das Live-Journal übernommen.

Eine Verrechnung reduziert die reservierte neue Provision im selben SQL-Commit über `applyCommissionOffset`. Unklare Anbieterergebnisse dürfen keine Freigabe des verwendeten Guthabens auslösen; nur nachweislich endgültig fehlgeschlagene/stornierte Zahlungen erlauben `releaseOffset`. Bestätigte Käufererstattungen erzeugen davon getrennte Gutschriften. Das Kontoguthaben enthält Nettoprovision; Umsatzsteuer auf Bringness-Leistung/Gutschriften bleibt vor produktiver Abrechnung zu klären.

Kündigungsadapter müssen eine bereits wirksam gewordene Händlervertragskündigung nachweisen; bloßer OAuth-Disconnect oder Sperre genügt nicht. Verrechnung nach Vertragsende ist gesperrt. Spätere Rückgaben erhöhen weiterhin das auszahlbare Guthaben. `acknowledgePayout` verbucht ausschließlich einen bereits nachgewiesenen Banktransfer, führt selbst keinen aus. Bankauszahlungen benötigen noch einen Betreiberprozess mit Reservierung, eindeutiger Transferidentität und Wiederaufnahme bei unklaren Antworten; keine automatische Bankanbindung wird behauptet.

## Händlerbeschreibung und AGB

Verknüpfte Händlerbeschreibung in `seller.html`, `marketplace-seller.html` und Hilfe. Neuer AGB-Ergänzungsentwurf `merchant-terms.html` mit ausdrücklicher Trennung von Käufererstattung und Händlerprovision, Verrechnung während der Laufzeit und Auszahlung nach Kündigung. Vorgeschlagene Auszahlungsfrist: 14 Kalendertage nach Vertragsende bzw. verifizierter Bankangabe; spätere Gutschriften innerhalb 14 Tagen nach Feststellung.

Rechtsprüfung vor Einbeziehung: https://www.gesetze-im-internet.de/bgb/__307.html und https://www.gesetze-im-internet.de/bgb/__310.html . Auch im Unternehmerverkehr sind Transparenz und unangemessene Benachteiligung relevant. Die Wirksamkeit einer Auszahlungssperre bis Kündigung wird nicht zugesichert. Notwendige rechtliche Ausnahmen müssen nach Prüfung in Text und Technik übereinstimmend ergänzt werden. Keine rückwirkende Anwendung auf bestehende Verträge. Entwurf und Hinweise versprechen keine bereits aktivierte Zahlungsfunktion.

## Grenzen und noch notwendige Anbieterabnahme

Der neue interne Baustein ist nicht im Produktivstart montiert. Die konkreten Adapter für geprüfte Waren-Erstattungszuordnung, verbindliche Händlerzustimmung, Provisionsreservierung/Anbieterabzug, wirksame Vertragskündigung und Banknachweis müssen in die vorhandene Zahlungsintegration eingebunden und mit echten Mollie-Testdaten abgenommen werden. Ein interner Adapter darf nicht durch Browserangaben ersetzt werden. Die bestehenden produktiven Zahlungssperren bleiben erhalten.

Lokale SQL-Tests verwenden PGlite, keine Produktionsdaten. Separate PostgreSQL-Verbindungen/echte Konkurrenz und echter Mollie-Geldfluss wurden damit nicht getestet. Mollies Testzahlungen verschieben keine echten Application Fees; ein späterer kleiner Live-Nachweis bedarf einer gesonderten konkreten Zahlungsfreigabe. Referenz: https://docs.mollie.com/docs/application-fees .

## Lokale Verifikation

11 fokussierte Berechnungs-/SQL-Tests bestanden (vier bestehende Provisionsprüfungen und sieben neue SQL-Abläufe), ohne Skip. Neue SQL-Tests unter `ops/shop/market-credit.test.mjs` werden vom bestehenden Shop-Prüflauf automatisch erfasst. Replaytests decken auch geänderte Auszahlungsbeträge bei identischer Bankreferenz ab.
