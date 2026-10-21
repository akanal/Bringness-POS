# Gemeinsame Testliste Bringness POS / AI

Stand: 21.10.2026. Die automatisierten Entwicklungsprüfungen wurden nach erneuter Zustimmung ausgeführt; die praktischen Geräteabnahmen bleiben offen. Diese Liste bündelt die restlichen Fälle ohne doppelte Einträge. Bis zur erforderlichen Abnahme bleiben ungeprüfte Entwicklungsänderungen unveröffentlicht.

Bereits bestätigt: Mollie-Testzahlung und Aktivierung durch den Inhaber; DWD-Liveabruf und gespeicherte PLZ-Zuordnung im Restaurant-Testkonto. Keine erneute offene Mollie-Grundeinrichtung daraus ableiten. Aktuelle automatisierte Nachweise stehen in development-validation-20261021.md; frühere Nachweise in acceptance-progress-20261021.md. Beide ersetzen die nachfolgende praktische Abnahme nicht.

| ID | Ablauf für den späteren Generaltest | Voraussetzung | Erwartetes Ergebnis | Status |
| --- | --- | --- | --- | --- |
| T01 | Restaurant-/Händlerkonto, Bestätigungsmail, erneuter Link und Passwortreset | Zwei getrennte Testkonten und Postfach | Richtiger Kontotyp, gültiger Einmallink, formelle Sie-Ansprache; Fehler ohne falsche Versandbehauptung | Kontoanmeldung praktisch gelungen; vollständige Mailabnahme offen |
| T02 | Zeiteingaben in AI-Planung, Öffnungszeiten, Dienstplan, Stempelkorrektur, Artikelverfügbarkeit und Werbezeiträumen | Browser mit deutscher und englischer Geräteinstellung | Immer HH:MM ohne AM/PM; Grenzen und ungültige Werte; richtiger gespeicherter Zeitpunkt einschließlich Zeitzone und Sommerzeit | Automatisierte Zeit-/DST-Formularprüfung bestanden; vollständige Geräteabnahme offen |
| T03 | PLZ ändern, unbekannte PLZ, manuelle Station und Neuladen | Restaurantstandort | Richtige nahe Station; kein Überschreiben bei Fehler; manuelle Auswahl hat Vorrang; Wetterausfall bleibt neutral | 10115 live bestanden; Randfälle automatisiert bestanden |
| T04 | POS mit AI-Standort verknüpfen und Artikel/Rezept zuordnen | Inhaberzugang POS und Restaurant-AI, Testartikel | Richtiger Betrieb/Standort, Rechteprüfung, genau ein Verbrauch pro Verkauf | Praktisch offen |
| T05 | Tagesprognose und Einkaufsplanung mit Verkaufsdaten | T04 und ausreichende Historie | Fehlende Daten klar benannt; nachvollziehbare Wetter-/Terminwirkung; Ruhetage berücksichtigt | Praktisch offen |
| T06 | Foto/PDF importieren, Entwurf korrigieren, freigeben, erneut hochladen und nach Verbindungsabbruch wiederholen | Restaurant-Testkonto, Testzutat, freigegebene Testbelege | Kein Bestand vor Freigabe; korrigierte Menge genau einmal; unbekannter Preis bleibt offen; Fremdzugriff verweigert | Echtes Foto isoliert bestanden; Live-Dateidialog blockiert |
| T07 | Einkauf manuell/automatisch freigeben, Lieferantenangebot ändern, Freigabe entziehen | Testlieferant und explizite Freigabe; keine echten Beschaffungskosten | Grenzen und Lieferbedingungen beachten; keine Doppelbestellung; ohne Freigabe keine Bestellung | Automatisiert bestanden; praktische Abnahme offen |
| T08 | Verkauf mit Artikeln, Varianten, Rabatt, Teilung, Bargeld/Restbetrag und Abschluss | POS-Testbetrieb | Richtige Summen, Restbetrag und Beleg; kein doppelter Abschluss nach Wiederholung | Automatisierte POS-Flows bestanden; praktisch offen |
| T09 | Pfand nach Stückzahl und Pfandbetrag bündeln | Artikel mit gleichen und verschiedenen Pfandbeträgen | Gleiche Beträge zusammen, verschiedene getrennt, alle Pfandzeilen unten | Automatisiert bestanden; praktisch offen |
| T10 | Händlerrechnung DIN A4, Kundendaten, Nummernkreis, Netto/MwSt./Brutto und Druck | Händleroption, gespeicherter Testkunde | Rechnung getrennt vom Lieferschein; vollständige grau-weiße Zeilen; eigener Nummernkreis | Umsetzung vorhanden; Geräte-/Druckabnahme offen |
| T11 | Kundenadresse / PLZ-Ort-Warnung / Lieferschein direkt bearbeiten | Testadresse mit absichtlichem Fehler | Rote Warnung, Korrektur möglich, kompakte Adresse, keine erfundene Adressbestätigung | Praktisch offen |
| T12 | Windows-Offlineverkauf, Neustart, längerer Netzausfall, Wiederverbindung und mehrfacher Import | Aktiviertes Windows-Testgerät; TSE-Grenzen beachten | Belege erhalten; genau einmal synchronisiert; Mandant und Geräteberechtigung bleiben getrennt | 39 Desktoptests, Wiederanlauf-/Firmenwechsel-DOM, PostgreSQL-HTTP und Windows-Electron-HTTP in CI bestanden; Kundengerät offen |
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

## Detailfälle innerhalb der bestehenden Testpunkte

Diese Fälle gehören zu den oben genannten IDs; sie sind keine zusätzlichen oder doppelt durchzuführenden Testblöcke.

### T02 – Zeitformat und Zeitumstellung

- Alle Zeitformulare einschließlich lokaler AI-Termine und Werbezeiträume: ungültiges Kalenderdatum, 24:00 als Zeitpunkt, Sommerzeit-Lücke (Europe/Berlin, 29.03.2026 02:30), Ende vor/gleich Beginn und Schicht über Mitternacht. Fehler verhindern eine API-Schreibanfrage und bleiben im Formular sichtbar.
- Bestehenden Termin/Werbezeitraum aus der zweiten 02:30-Stunde am 25.10.2026 laden und nur Titel/Hinweis ändern. Ursprünglicher UTC-Zeitpunkt einschließlich Sekunden bleibt erhalten. Anschließend bewusst andere Uhrzeit wählen und Konvertierung prüfen.
- Nachgeladene Vertretungsübersicht, persönlicher Kellner-Dienstplan, Service-Präsenzansicht, Belegliste/Steuerberater-CSV, Kassenabschluss, Bestellungen/Küche, Center-Status, Medienübersicht und Fernhilfe/Admin-Protokoll prüfen: h23, Mitternacht 00:xx, unveränderte Mengen/Geldbeträge.
- Browsergebiet und manuelle 12-Stunden-Voreinstellung variieren. Gerätezeitzone dokumentieren; nach Neuladen und erneuter Anmeldung auch aktuelle Asset-Versionen prüfen.

### T12 – Wiederanlauf, Katalogwechsel und Mandantentrennung

- Verlorene lokale Verkaufsantwort nach Commit, Hintergrund-Katalogaktualisierung und App-Neustart kombinieren. Vorgang unter ursprünglicher Verkaufs-ID genau einmal mit Originalpreisen bestätigen; danach wieder frischen Katalog verwenden.
- Abgelaufenen ursprünglichen Katalog mit bereits gespeichertem Verkauf sowie separat einen noch nicht gespeicherten Vorgang prüfen. Wiederholung darf keine neue abgelaufene Buchung oder verlängerte Lizenz erzeugen. Fremde/fehlende Kataloge bleiben gesperrt.
- Während einer Anzeigeabfrage einen Katalog-/Firmenwechsel oder neuen Bezahlvorgang auslösen. Katalog, Verlauf und Zähler bleiben konsistent; verspätete Antwort darf neueren Zustand nicht überschreiben.
- Kurze gültige Gerätefreigabe später serverseitig verlängern: bei bestehender Anmeldung rechtzeitig automatisch aktualisieren. Ohne Verlängerung keine neuen Offline-Buchungen nach Ablauf.
- Firma A vollständig übertragen und zu B wechseln: Verlauf, Zähler und Export enthalten keine A-Belege; alte Warenkorb-/Druckanzeige wird geleert. Direkte Wiederholung einer A-Verkaufs-ID unter B wird abgewiesen. Nach legitimem Wechsel zurück zu A bleiben Originalbelege unverändert zugänglich. Dieser gemeinsame Mandantenfall deckt auch T14 ab und wird nur einmal durchgeführt.

Details zum Entwicklungsstand: offline-interrupted-payment-recovery.md. Die beschriebenen Offline- und Werbeformular-Randfälle sind automatisiert bestanden; echte Geräteprüfung und übrige praktische Zeitformularabnahme stehen aus.

### T12 – Manueller Abgleich während Hintergrundlauf

- Während eines automatischen Abgleichs mehrfach manuell aktualisieren: genau ein nachfolgender erzwungener Durchlauf, keine parallele Übertragung. Alle Aufrufer warten bis zu dessen Ergebnis. Während des erzwungenen Laufs keine weitere Wiederholung aufbauen. Verbindungs-/Anmeldefehler sichtbar halten, offene Verkäufe erhalten. Umsetzung auf fix/offline-explicit-refresh-20261021; Funktionsprüfung auf Wunsch zurückgestellt.

- T12 Desktop-Wiederanlauf: Fehler im Hauptdokument von bringness.de öffnet Offline-Kasse; Unterrahmenfehler, abgebrochene Navigation und fremde Origins nicht. Fensterwechsel/-schließen oder Navigation während der Sitzungsauslesung beendet diesen Verbindungsversuch; regulärer Wiederanlauf bleibt erhalten. Funktions-/Geräteprüfung zurückgestellt; nur Syntaxprüfung ausgeführt.

T04/T12 POS-AI-Fortschritt: mehr als 200 Abschlüsse mit Mikrosekunden innerhalb derselben Millisekunde, Worker-Neustart und zwei unterschiedlich schnelle Worker prüfen. Fehlendes Rezept korrigieren und verspäteten Offline-Import mit verlorener AI-Bestätigung wiederholen; richtige Standortbindung und genau eine Lagerwirkung. Weitere Fälle/Abgrenzung: pos-ai-sync-cursor-20261021.md. Zusätzliche Tests auf erneuten Inhaberwunsch vorerst zurückgestellt.
