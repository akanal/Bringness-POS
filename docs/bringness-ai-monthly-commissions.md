# Monatliche Provisionsübersichten

Lieferanten und aktive globale Plattformadministratoren finden den neuen Bereich „Monatsabrechnung“. Er zeigt die bestätigten Wareneingänge eines ausgewählten Kalendermonats nach Berliner Zeit, den vermittelten Netto-Warenwert, die gespeicherten Provisionen sowie bezahlte und offene Beträge. Stornierte und noch nicht erhaltene Bestellungen werden nicht als Forderung gezählt. Die Einführungsprovision bleibt unverändert 2 %.

Die Zuordnung nutzt `ai_orders.received_at`; bestehende erhaltene Bestellungen werden bei der Migration aus ihrem bisherigen `updated_at` übernommen. Bestellwiederholungen ändern den Zeitpunkt nicht. Diese historische Übernahme ist eine Rekonstruktion, kein zusätzlicher Liefernachweis.

Lieferanten sehen ausschließlich ihre eigenen Werte und Bestelldetails. Admins können je Monat und Lieferant Details aufrufen, eine bereits vereinbarte Zahlungsfrist hinterlegen und einen vollständig geprüften Zahlungseingang mit Nachweis auf die noch offenen Bestellungen buchen. Die Zahlung erfolgt atomar unter Bestellsperren und darf nur exakt dem offenen Betrag entsprechen. Veränderte Beträge, doppelte Bestätigung und Lieferantenschreibzugriffe werden abgelehnt. Einzelzahlungen aus dem bestehenden Provisionsbereich werden berücksichtigt. Teilzahlungen bleiben dort ebenfalls ununterstützt.

Eine offene Summe nach der hinterlegten Frist wird als überfällig angezeigt. Die Frist ist eine dokumentierte Vereinbarung; das System verschickt keine neue Zahlungsaufforderung und sperrt keine Accounts automatisch. Laufende Monate sind ausdrücklich vorläufig. Die Ansicht bleibt eine aktuelle Übersicht mit Zahlungsabgleich, kein unveränderliches Rechnungsdokument. Werbegebühren sind separat.

Drucken beziehungsweise Speichern als PDF erfolgt über den Browser. Die Übersicht ist keine steuerliche Rechnung. Automatische Lastschrift, Mandate, Rechnungsnummern, Steuerberechnung, Mahnversand, Gutschriften und echte Anbieterzahlungen erfordern weitere Einrichtung. Rechnungssteller, Steuerangaben, Bankverbindung und Anbieterfreischaltung werden nicht erfunden.

Integrationstests prüfen Wareneingangsdatum, Berliner Monatsgrenze, Rollen und Kontentrennung, Monatsbetrag, geprüfte Zahlungsnachweise, Konflikte und die Lieferantenoberfläche.
