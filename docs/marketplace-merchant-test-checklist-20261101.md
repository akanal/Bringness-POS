# Händler- und Mollie-Test für den nächsten gemeinsamen Termin

## Voraussetzungen
Nur eine isolierte TEST-Installation und synthetische Händler/Käufer nutzen. Keine echten Kundendaten, Bestellungen oder Auszahlungen. Den tatsächlich bereitgestellten Versionsstand der TEST-Installation vor Beginn dokumentieren; die Codeveröffentlichung in Produktion ersetzt diese getrennte Testinstallation nicht. Ein Mollie-Dashboard-Login ersetzt nicht die technische Händlerfreigabe.

Zwei getrennte Konten: Händler und Käufer. Händlerfreigabe erfolgt ausdrücklich durch den bestehenden Superadmin. Sichere Hostkonfiguration mit vorhandener Test-Integration und korrekten OAuth-Rückkehr-/Webhook-Adressen; Geheimwerte ausschließlich in geschützter Konfiguration. Der Bereitschaftsbericht muss verbleibende Blocker anzeigen. Keine Live-Schlüssel und keine Änderung der Produktions-Zahlungsschalter.

## Zehn Prüfpunkte mit erwarteten Ergebnissen

1. **Registrierung und Login:** Testbetrieb registrieren, abmelden und erneut anmelden. Bei vorhandenen Betrieben das bestehende Konto nutzen. Ungültige/fehlende Pflichtfelder werden abgelehnt. Ein Kellnerkonto erhält keine Händlerverwaltung.
2. **Händlerprofil:** Geschäftsname, Straße, PLZ, Ort, Land und öffentliche E-Mail speichern, neu laden und vergleichen. Ohne Kontaktzustimmung keine Einreichung; ohne manuelle Prüfung keine Freigabe. Anderes Konto sieht diese privaten Daten nicht.
3. **Produktentwurf:** Physische Testware mit Kategorie, Beschreibung, Nettopreis 100,00 EUR, 19 % Waren-USt., Artikelnummer und Bestand 3 anlegen. Im Betriebskonto speichern und erneut laden. Produktbilder sind inzwischen implementiert; den gesonderten Bildablauf unten prüfen. Private Dokumente niemals ersatzweise veröffentlichen.
4. **Veröffentlichung und Lieferung:** Standardvariante, Versand 10,00 EUR netto mit 19 % USt. sowie Abholung und Lieferzeit angeben. Erst ausdrücklich veröffentlichen. Preis und Daten nach Neuladen identisch. Keine Lieferart und negative Preise/Bestände ablehnen.
5. **Käuferbestellung:** Vom getrennten Käuferkonto ein Stück bestellen: Warenwert 100,00 EUR netto + 19,00 EUR USt.; Versand 10,00 EUR netto + 1,90 EUR USt.; Gesamt 130,90 EUR. Bestand fällt auf 2. Identische Wiederholung erzeugt keine zweite Bestellung und keinen weiteren Bestandsabzug.
6. **Händlerübersicht:** Dieselbe Bestellung mit Empfänger, Menge, Lieferung und Status laden. Vorgesehene Provision 5,00 EUR netto auf 100,00 EUR Nettowarenwert, 0 EUR monatliche Grundgebühr; Versand und Waren-USt. gehören nicht zur Provisionsbasis. Diese Anzeige bestätigt keinen tatsächlichen Gebührenabzug.
7. **Mollie TEST:** Händler über die Test-Verbindung autorisieren, Profil prüfen, Bereitschaft und Testcheckout laden. Erfolgreiche, abgebrochene und unklare Testzahlung prüfen. Abgleich darf keine zweite Zahlung erzeugen. Testzahlungen geben keine echte Ware und keine produktiven Belege frei. Nur bei freigegebener TEST-Integration ausführbar.
8. **Teil- und Vollerstattung:** Separater Testfall: 40,00 EUR Warenwert netto (47,60 EUR brutto) zurückerstatten → erwartete Provisionsgutschrift 2,00 EUR netto. Weitere 60,00 EUR netto (71,40 EUR brutto) → weitere 3,00 EUR netto. Eine zusätzliche Versandkostenerstattung ändert die Provisionsgutschrift nicht. Ganze Bestellung in einem anderen Testfall → insgesamt 5,00 EUR Provision. Der aktuelle Stand enthält hierfür lokale SQL-/Berechnungstests, noch keinen verbundenen Mollie-Erstattungsadapter. Bis dieser angeschlossen ist, Punkt als blockiert markieren, keine Erfolgsmeldung erfinden.
9. **Guthaben und Wiederholungen:** Bestätigte Provisionsgutschrift, Verrechnung und Buchungsverlauf vergleichen. Wiederholte Meldungen dürfen nichts verdoppeln. Bei 5,00 EUR Guthaben und 2,00 EUR nächster Provision verbleiben 3,00 EUR Guthaben. Ein nur reservierter, endgültig gescheiterter Gebührenabzug gibt die verwendete Gutschrift wieder frei. Im aktuellen Entwurf ist die automatische Abrechnung noch nicht aktiviert; diese Übergänge sind lokal mit synthetischen Adaptern geprüft.
10. **Kündigung und Datenschutz:** Vor wirksamer Vertragsbeendigung keine Auszahlung. Danach Restguthaben auszahlungsberechtigt; erst verifizierte Bankauszahlung reduziert es. Spätere Erstattungen bleiben erhalten. Echte Kündigungs-/Bankadapter und rechtliche Freigabe stehen aus. Kontowechsel/Tab-Pause entfernt private Guthabendaten; Neuladen ist erforderlich.

## Abnahmeprotokoll
Für jeden Punkt Ergebnis PASS / FEHLER / BLOCKIERT, Testumgebung und Versionsstand, erwarteten/tatsächlichen Betrag und anonymisierte Referenz festhalten. Keine Zugangsdaten oder Tokens ins Protokoll aufnehmen. Ein blockierter Punkt ist kein bestandener Test. Keine produktive Veröffentlichung aus dieser Liste ableiten.

## Ergänzung: Produktbilder und Rechtstext-Verlinkung

- Im freigegebenen Händlerkonto ein eigenes Kontoangebot öffnen. PNG/JPEG bis 5 MiB auswählen und die ausdrückliche Sichtbarkeitsbestätigung prüfen. Nicht veröffentlichter Entwurf darf keine öffentliche Bilddatei ausliefern.
- Nach ausdrücklicher Angebotsveröffentlichung muss das aktuelle Bild in Liste und Detailansicht erscheinen. Auf Mobil-/Tablet-/Desktopbreite auf abgeschnittene Inhalte prüfen.
- Bild ersetzen: vorherige öffentliche URL liefert keine Datei mehr. Bei verlorener Antwort dieselbe Anfrage im offenen Editor wiederholen; kein zusätzlicher Bildstand. Nach Neuladen erst den gespeicherten Stand laden.
- Mit einem zweiten Betrieb dürfen Bildverwaltung, Austausch und Entfernen des ersten Betriebs nicht möglich sein. Konto-/Offline-/Ansichtswechsel schließen die private Bildverwaltung.
- Bildzuordnung entfernen, Angebot zurückziehen oder Händler sperren: Bild darf nicht weiter ausgeliefert werden. Entfernen der Zuordnung ist noch keine physische Löschung im Objektspeicher.
- Footerlinks und /shop/legal.html prüfen. Impressum/Datenschutz und zusätzliche Rechtstexte bleiben klar als unvollständiger Entwurf markiert; keine erfundenen Firmenangaben und keine Zustimmung zu Platzhaltern.
- Mollie-Testzahlungen prüfen nur simulierte Zahlungszustände. Sie bestätigen keinen echten Transfer einer Application Fee. Produktiver Gebühren-/Guthaben-/Bankablauf bleibt bis zu verbundenen vertrauenswürdigen Adaptern und gesonderter Abnahme gesperrt.
