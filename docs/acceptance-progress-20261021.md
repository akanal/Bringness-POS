# Bringness: Testbericht zum Listenabgleich, 21.10.2026

| Bereich / Prüfung | Ergebnis | Ursache oder Grenze | Nächster Fix / Schritt |
| --- | --- | --- | --- |
| Restaurant-Anmeldung Bringness testshop | Bestanden, live | Restaurantoberfläche im angemeldeten Browser sichtbar | Kein Fix erforderlich |
| DWD-Wetterabruf | Bestanden, live | Aktuelle MOSMIX-Daten wurden für Berlin-Tempelhof und Berlin-Alexanderplatz angezeigt | Kein Fix erforderlich |
| PLZ-Zuordnung | Bestanden, live | Teststandort: 10115 → 10389; Automatik und Station nach Neuladen erhalten | Reale Betriebs-PLZ je Standort hinterlegen |
| 24-Stunden-Zeiteingaben | Bestanden, isoliert / GitHub | Öffnungszeiten und Terminzeiten ohne native AM/PM-Eingabe; ungültige Uhrzeiten abgewiesen; gespeicherte Termine geprüft | Live-Veröffentlichung von PR111 noch gesondert bestätigen |
| Echtes Belegfoto: Upload → OCR → geprüfter Lagerzugang | Bestanden, isoliert | Tatsächliches Uploadformular/FileReader, OCR-Worker und authentifizierte Handler mit wegwerfbarer Datenbank; Originalfoto bleibt privat | Browserprüfung auf Nutzergerät bleibt offen |
| Beleg erneut hochladen / Antwort nach Commit verloren | Bestanden, isoliert | Identischer Entwurf wiederverwendet; Wiederholung erzeugt genau eine Lagerbewegung; kein Bestand vor Freigabe | Kein Fix aus diesem Test erforderlich |
| Fremdes Konto / ungeprüfte Daten / unbekannter Preis | Bestanden, isoliert | Fremdzugriff verweigert; manuell korrigierte Menge verwendet; fehlender Preis bleibt unbekannt | Kein Fix erforderlich |
| Offline-Speicherung, Cloud-Wiederholung, Steuerberaterseiten | Bestanden, isoliert | Dauerhafte Speicherung, Mandantentrennung, Bestandsschutz und 251-Beleg-Seitennavigation geprüft | Echter Windows-Geräte-/Netzausfalltest offen |
| Offline-HTTP: Abbruch vor/nach Commit, Neustart, 401/403 | Bestanden, isoliert | Echte authentifizierte HTTP-Route; zwei Verkäufe ergeben genau zwei Belege | Echte Cloud-/Geräteprüfung offen |
| Steuerberater-/CSV-Oberfläche | Bestanden, isoliert | Formel-Escaping, Anführungszeichen, Entfernen privater Bearer-Fragmente geprüft | Praktische Inhaber-/Steuerberaterabnahme offen |
| Admin-Fernhilfe | Bestanden, isoliert | Plattformrechte, Mandant/Gerät, ausdrückliche Ansicht-/Steuerfreigabe, Stop, Ablauf, Entzug, Protokoll und DOM geprüft | Praktische Zwei-Geräte-Sitzung offen |
| Live-Dateiauswahl im Cloud-Browser | Blockiert | Browser meldet nicht sicher fortsetzbaren nativen Anmeldestatus; dokumentierter neuer Tab und Laufzeitneustart lösen die Sperre nicht | Neue unterstützte Browsersitzung oder Prüfung auf Nutzergerät erforderlich; Upload nicht bestätigt |
| Tagesprognose im neuen Restaurantkonto | Blockiert durch fehlende Datenanbindung | Kein POS mit Verkaufsdaten angebunden | Bestehende POS-Anbindung einrichten; keine erfundenen Prognosen |
| Produktive TSE / Windows-Signatur | Weiterhin extern offen / zurückgestellt | TSE-Anbieterzugang bzw. Signaturzertifikat nicht eingerichtet; keine neue Freigabe oder Beschaffung erfolgt | Anbieterantworten/Zertifikat abwarten; keine Produktivaktivierung |

Ausgeführt: vollständige AI-Integration mit REAL_DELIVERY_PHOTO, offline-accountant.mjs, offline-http-sync.mjs, accountant-ui.mjs und remote-support.mjs. Alle fünf Prozesse endeten mit Exit-Code 0. Die umfassenden CI-Prüfungen zu PR111 waren erfolgreich; das ersetzt keine Live-Bereitstellungsbestätigung.

Kein neuer Produktivverkauf, keine Zahlung, keine Beschaffung und kein produktiver Lagerzugang in diesem Testblock. Die POS-/AI-Implementierungen werden nicht pauschal erneut als offen bezeichnet. Mollie-Testzahlung und Aktivierung bleiben vom Inhaber als erfolgreich bestätigt; produktive TSE und echte Gerätetests bleiben davon getrennt.
