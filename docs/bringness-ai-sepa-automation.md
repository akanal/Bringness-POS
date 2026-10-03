# Zahlungsautomatik: Zahlungsteil und Freigaben

Die Zahlungsautomatik ist standardmäßig ausgeschaltet. Ein Worker bereitet jede Minute neue offene Provisionsmonate vor; nur abgeschlossene Berliner Kalendermonate und bestätigte Wareneingänge zählen. Eine eindeutige Lieferant/Monat-Zuordnung verhindert doppelte Entwürfe. Bestehende Zahlungen werden abgezogen. Ein Entwurf ist keine steuerliche Rechnung.

## Noch erforderliche Einrichtung

- Superadmin hinterlegt geprüften Rechnungssteller, Anschrift, Steuerreferenz und die Gläubiger-ID für den tatsächlich verwendeten Einzug.
- Separater `AI_MOLLIE_API_KEY` mit Live-Zugang sowie SMTP müssen serverseitig vorhanden sein. POS-Zugangsdaten werden nicht stillschweigend wiederverwendet.
- Lieferant stimmt der Zahlungsvereinbarung ausdrücklich zu und erteilt ein echtes SEPA-Mandat beim Anbieter. Die Checkbox allein ist kein Mandat.
- Superadmin ordnet die beim Anbieter eingerichteten Kunden- und Mandatsreferenzen zu. Mollie muss gültiges `directdebit` bestätigen; Kunden-E-Mail muss zum Lieferanten passen.
- Die Rechnung wird derzeit außerhalb dieses Moduls erstellt. Der Superadmin hinterlegt Rechnungsreferenz und tatsächlich geprüften Gesamtbetrag und gibt den Einzug frei. Steuerberechnung, Rechnungsausstellung und Anbieter-Onboarding sind noch nicht automatisiert. Ein vollständig unbeaufsichtigter Monatsabschluss ist deshalb noch nicht freigegeben.

## Automatisierter Zahlungsteil

Nach Freigabe und Aktivierung versendet der Worker eine Vorankündigung mit Rechnungsreferenz, Bruttobetrag, Mandatsreferenz, Gläubiger-ID und Einzugstag. Der Termin wird bei verzögertem Versand verschoben, damit mindestens 14 volle Tage zwischen erfolgreichem Versand und Einzug liegen; geplant werden 15 Tage. Danach legt der Worker eine variable SEPA-Zahlung an. Er prüft Mandat, Kontostatus und unveränderte offene Provision vor Versand und Einzug erneut. Der Lieferant kann weitere Einzüge in seinem Konto stoppen.

Eine Anbieterzahlung wird nur nach bestätigtem `paid`, passend zu Zahlungs-ID, Kunden-ID, EUR-Gesamtbetrag und Job-Metadaten den Provisionen zugeordnet. Bankbearbeitung ist kein Zahlungseingang. Manuelle Einzel- und Monatszahlung sind für reservierte Einzüge gesperrt. Der tatsächliche Gesamtbetrag bleibt beim Job gespeichert; die Provisionsübersicht führt weiterhin den Nettoprovisionsanteil.

Der Worker verwendet einen PostgreSQL Advisory Lock für mehrere Serverprozesse. Ein Zahlungs-POST wird vor dem Aufruf dauerhaft markiert. Nach Timeout oder Neustart bei unklarer Antwort wird niemals automatisch ein zweiter POST ausgeführt. Eine vorhandene Anbieterreferenz kann nach überprüftem Vergleich zugeordnet werden. Unklarer Mailversand, fehlendes/widerrufenes Mandat, Fehler, Erstattung oder Rücklastschrift erscheinen als Ausnahme. Nach erfolgtem Einzug ist keine einfache Stopp-Aktion möglich. Rücklastschriften ändern den bisherigen Zahlungsnachweis nicht stillschweigend; buchhalterische Korrektur bleibt manuell erforderlich. Es gibt noch keinen automatisierten Mahn- oder Wiederholungsablauf.

## Lieferantenfreigabe

Der Superadmin kann die Pflicht für geprüfte Mandate gesondert einschalten. Dann sind neue Bestellungen und Lieferantenannahmen (Oberfläche und Lieferanten-API) ohne aktuelle erfolgreiche Anbieterprüfung blockiert. Anmeldung, Profil und Sortimentsvorbereitung bleiben möglich. Bestehende Dummy-Konten werden nicht automatisch gesperrt; die Pflicht ist zunächst aus.

## Tests

Eingebettete PostgreSQL- und DOM-Integration, Anbieter und Mailversand simuliert. Geprüft: Rollen, Zustimmung, gültiges und passendes Mandat, gesperrte Einrichtung, Monats-Deduplizierung, Vorankündigung, Wartefrist, genau ein Zahlungsaufruf, bestätigter Zahlungseingang, Reservierung und Rücklastschrift-Ausnahme. Kein echter Bankeinzug oder echtes Mandat wurde getestet. PostgreSQL Advisory Locks werden lokal simuliert, nicht als Mehrprozesslasttest geprüft.
