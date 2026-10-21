# Gemeinsame Testliste Bringness POS / AI

Stand: 21.10.2026. Der Inhaber hat die weiteren Funktions- und Geräteabnahmen auf später verschoben. Diese Liste bündelt sie ohne doppelte Einträge. Bis zur Abnahme bleiben ungeprüfte Entwicklungsänderungen unveröffentlicht.

Bereits bestätigt: Mollie-Testzahlung und Aktivierung durch den Inhaber; DWD-Liveabruf und gespeicherte PLZ-Zuordnung im Restaurant-Testkonto. Keine erneute offene Mollie-Grundeinrichtung daraus ableiten. Automatisierte Nachweise stehen in acceptance-progress-20261021.md; sie ersetzen die nachfolgende praktische Abnahme nicht.

| ID | Ablauf für den späteren Generaltest | Voraussetzung | Erwartetes Ergebnis | Status |
| --- | --- | --- | --- | --- |
| T01 | Restaurant-/Händlerkonto, Bestätigungsmail, erneuter Link und Passwortreset | Zwei getrennte Testkonten und Postfach | Richtiger Kontotyp, gültiger Einmallink, formelle Sie-Ansprache; Fehler ohne falsche Versandbehauptung | Kontoanmeldung praktisch gelungen; vollständige Mailabnahme offen |
| T02 | Zeiteingaben in AI-Planung, Öffnungszeiten, Dienstplan, Stempelkorrektur, Artikelverfügbarkeit und Werbezeiträumen | Browser mit deutscher und englischer Geräteinstellung | Immer HH:MM ohne AM/PM; Grenzen und ungültige Werte; richtiger gespeicherter Zeitpunkt einschließlich Zeitzone und Sommerzeit | Entwicklung erweitert; gemeinsame Abnahme offen |
| T03 | PLZ ändern, unbekannte PLZ, manuelle Station und Neuladen | Restaurantstandort | Richtige nahe Station; kein Überschreiben bei Fehler; manuelle Auswahl hat Vorrang; Wetterausfall bleibt neutral | 10115 live bestanden; Randfälle automatisiert bestanden |
| T04 | POS mit AI-Standort verknüpfen und Artikel/Rezept zuordnen | Inhaberzugang POS und Restaurant-AI, Testartikel | Richtiger Betrieb/Standort, Rechteprüfung, genau ein Verbrauch pro Verkauf | Praktisch offen |
| T05 | Tagesprognose und Einkaufsplanung mit Verkaufsdaten | T04 und ausreichende Historie | Fehlende Daten klar benannt; nachvollziehbare Wetter-/Terminwirkung; Ruhetage berücksichtigt | Praktisch offen |
| T06 | Foto/PDF importieren, Entwurf korrigieren, freigeben, erneut hochladen und nach Verbindungsabbruch wiederholen | Restaurant-Testkonto, Testzutat, freigegebene Testbelege | Kein Bestand vor Freigabe; korrigierte Menge genau einmal; unbekannter Preis bleibt offen; Fremdzugriff verweigert | Echtes Foto isoliert bestanden; Live-Dateidialog blockiert |
| T07 | Einkauf manuell/automatisch freigeben, Lieferantenangebot ändern, Freigabe entziehen | Testlieferant und explizite Freigabe; keine echten Beschaffungskosten | Grenzen und Lieferbedingungen beachten; keine Doppelbestellung; ohne Freigabe keine Bestellung | Automatisiert bestanden; praktische Abnahme offen |
| T08 | Verkauf mit Artikeln, Varianten, Rabatt, Teilung, Bargeld/Restbetrag und Abschluss | POS-Testbetrieb | Richtige Summen, Restbetrag und Beleg; kein doppelter Abschluss nach Wiederholung | Praktisch offen |
| T09 | Pfand nach Stückzahl und Pfandbetrag bündeln | Artikel mit gleichen und verschiedenen Pfandbeträgen | Gleiche Beträge zusammen, verschiedene getrennt, alle Pfandzeilen unten | Praktisch offen |
| T10 | Händlerrechnung DIN A4, Kundendaten, Nummernkreis, Netto/MwSt./Brutto und Druck | Händleroption, gespeicherter Testkunde | Rechnung getrennt vom Lieferschein; vollständige grau-weiße Zeilen; eigener Nummernkreis | Umsetzung vorhanden; Geräte-/Druckabnahme offen |
| T11 | Kundenadresse / PLZ-Ort-Warnung / Lieferschein direkt bearbeiten | Testadresse mit absichtlichem Fehler | Rote Warnung, Korrektur möglich, kompakte Adresse, keine erfundene Adressbestätigung | Praktisch offen |
| T12 | Windows-Offlineverkauf, Neustart, längerer Netzausfall, Wiederverbindung und mehrfacher Import | Aktiviertes Windows-Testgerät; TSE-Grenzen beachten | Belege erhalten; genau einmal synchronisiert; Mandant und Geräteberechtigung bleiben getrennt | Automatisiert bestanden; echter Gerätetest offen |
| T13 | EAN-Scanner und manuelle Artikelwahl online/offline | Physischer Scanner und Testartikel | Richtiger Artikel, Varianten/Menge, kein doppelter Scan-Verkauf | Geräteabnahme offen |
| T14 | Admin- und Steuerberaterzugang, Export, Rechteentzug und Pagination | Getrennte Konten/Testmandanten | Nur freigegebener Betrieb; Entzug wirkt; vollständiger Export ohne Datenleck | Automatisiert bestanden; praktische Abnahme offen |
| T15 | Admin-Fernhilfe über zwei Geräte | Zustimmender Inhaber, separates Admin-Gerät | Ansicht/Steuerung nur nach Freigabe, Stop/Ablauf/Entzug wirksam, keine Geheimnisse im Protokoll | Automatisiert bestanden; Zwei-Geräte-Abnahme offen |
| T16 | Kellner → Küche → Abrechnung, Tischzuweisung, Push und Standby | Zwei Mobilgeräte und POS-Testbetrieb | Zuständigkeiten, Küchennotiz und Status stimmen; keine doppelte Bestellung; Handybenachrichtigung sichtbar | Geräteabnahme offen |
| T17 | QR-Tisch-, Tresen- und Center-System getrennt buchen und verwenden | Je Betriebsart eigener Testfall | Exklusive Modulregeln; Pflicht-Tische; richtiger Restaurant-Zahlungsempfänger; keine Zahlung bei Vor-Ort-Status allein | Praktisch offen; Mollie-Grundtest bereits abgeschlossen |
| T18 | Bildschirmsteuerung und Wiedergabe nach Kassen-/Playerneustart | Quer-/Hochkant-Bildschirm | Dauerbild bleibt; gespeicherter Link und Playlist erhalten; Fernänderung sichtbar | Geräteabnahme offen |
| T19 | Signierten Windows-Installer installieren/aktualisieren | Später freigegebenes Signaturzertifikat | Vertrauenswürdige Signatur; Daten bleiben beim Update erhalten | Zertifikat zurückgestellt; kein Kauf ausgelöst |
| T20 | TSE-Anbindung, Offline-Fiskalisierung und Händler-Zahlungsablauf | Anbieterzugang/Hardware und geklärter tatsächlicher Ablauf | Signierung, Ausfall-/Wiederholungsfall, Belegzuordnung; kein frei wählbares TSE-aus für Kassenverkäufe | Externe Voraussetzungen offen; keine Produktivaktivierung |
| T21 | Sicherung/Rücksicherung und kontrollierte Wiederherstellung | Isolierte Wiederherstellungsumgebung, geprüftes Backup | Unabhängige Rücksicherung ohne Produktivüberschreiben und ohne Datenverlust | Isoliert bereits geprüft; Betriebsabnahme offen |

Für jeden späteren Durchlauf Datum/Gerät, bestanden/fehlgeschlagen/blockiert, Ursache und nächsten Fix ergänzen. Testdaten und produktive Verkäufe klar auseinanderhalten. Neue Produktivzahlungen, Beschaffungen oder destruktive Wiederherstellungen erfordern den konkret freigegebenen Ablauf.

Ergänzung zu T02: Ungültiges Kalenderdatum, 24:00 als Zeitpunkt, Sommerzeit-Lücke (z. B. Europe/Berlin 29.03.2026 02:30), Herbst-Doppelstunde, Ende vor/gleich Beginn und Schicht über Mitternacht prüfen. Fehler dürfen keine API-Schreibanfrage auslösen; Werbeformular muss den Fehler anzeigen. Gerätezeitzone für diese Fälle ausdrücklich dokumentieren.

T02 umfasst auch die nachgeladene Vertretungsübersicht, den persönlichen Kellner-Dienstplan und lokale AI-Termine; Anzeige nach Aktualisieren und erneuter Anmeldung prüfen.

T02: Bestehenden Termin und Werbezeitraum mit zweiter 02:30-Stunde am 25.10.2026 in Europe/Berlin laden, ausschließlich Titel/Hinweis ändern und speichern; ursprünglicher UTC-Zeitpunkt muss einschließlich Sekunden erhalten bleiben. Danach Uhrzeit bewusst ändern und UTC-Konvertierung prüfen.

T02 Anzeigeabschluss: Belegliste und Steuerberater-CSV, Kassenabschluss, Küche/Bestellungen, Center-Status, Medienübersicht, Fernhilfe/Admin-Protokoll sowie Service-Präsenzansicht auf h23 prüfen. Mitternacht muss 00:xx anzeigen; Mengen/Geldbeträge unverändert. Browsergebiet und manuelle 12-Stunden-Voreinstellung variieren; neue Asset-Versionen nach Neuladen prüfen.

T12 Wiederherstellung nach Katalogwechsel: verlorene lokale Verkaufsantwort, Hintergrund-Katalogaktualisierung und App-Neustart kombinieren; ursprünglichen Vorgang genau einmal mit Originalpreisen bestätigen. Fremde/fehlende Kataloge bleiben gesperrt; verspätete Anzeigeantwort darf neueren Zustand nicht überschreiben. Details: offline-interrupted-payment-recovery.md.

T12/T14 gemeinsamer Mandantenfall: Firma A vollständig übertragen, zu Firma B wechseln; Verlauf, Zähler und Export dürfen keine A-Belege enthalten. Direkter Wiederholungsaufruf mit A-Verkaufs-ID unter B wird abgewiesen. Nach gültigem Wechsel zurück zu A bleiben die unveränderten Originalbelege zugänglich. Keine doppelte Testdurchführung nötig.
