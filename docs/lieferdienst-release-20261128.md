# Lieferdienst – Vorbereitung vom 28.11.2026

## Verifizierter Zugang
https://sandbox-bestellen.bringness.de/bestellen/ liefert HTTP 200. Dies bestätigt die Erreichbarkeit der Testseite, keine Freigabe echter Bestellungen.

## Richtige Quellbasis
Branch feat/ordering-restaurant-storefront, Commit d80f61e6cc69b448eb7c961651f25054fe53d3ce.
Ausgelieferte Startseite stimmt mit dieser Quellbasis bis auf das zusätzlich eingebundene /brand-logo.js überein. Der ältere Zweig codex/delivery-address-search ist nicht die vollständige aktuelle Grundlage.
Die Server-JavaScript-/CSS-Dateien und der Backendstand sind noch nicht bytegleich abgeglichen.

## Vorbereitete Korrektur
Verspätete Speisekartenantworten dürfen neuere Speisekarten, Preise und Betreiberangaben nicht überschreiben. Erneutes Laden leert alte Kategorien, Kontaktangaben und Titelbildsichtbarkeit. Die Korrektur liegt im Releasezweig und ist noch nicht auf dem Server veröffentlicht.

## Prüfungen
25 gezielte Tests ohne Fehler oder Skip: getrennte Sandboxkonfiguration, öffentliche Menüfreigaben, Checkoutberechnung, Zahlungsrückkehr, stabile Wiederholungskennung, keine doppelte POS-Buchung, DOM-Bestellablauf, Adresssuche, Favoriten und verspätete Speisekartenantwort.
Zusätzlich JavaScript-Syntax und git diff --check erfolgreich.
DOM-Prüfung ist keine native Browserabnahme und keine echte Zahlungs-/Restaurantabnahme.

## Noch vor vollständiger Freigabe
- Zwölf Sprachen oben rechts im PLZ-Einstieg, gespeicherte Auswahl im gesamten Ablauf; Arabisch/Persisch mit RTL. Im aktuellen Stand ist nur ein versteckter Deutschhinweis vorhanden.
- Originale Produkttexte im POS erhalten; Übersetzung erst im Lieferdienst. Kein externer Übersetzungsanbieter wurde hier eingerichtet.
- Gespeicherte Restaurantansicht und Warenkorb-Vorschau vom 27.11.2026 sind separate Gestaltungsvorschauen; keine vollständige Übernahme in den funktionalen Ablauf behaupten.
- Neuere Wiederherstellungswünsche für die Ergebnisgestaltung mit dem vorhandenen Restorezweig abgleichen.
- Aktuelle Serverressourcen vollständig vergleichen und native Browserabnahme durchführen.
- Bestehender Standard-Netcup-Workflow hat nur all/pos/ai, kein sandbox-Ziel. Keine Sandboxänderung durch ein ungeprüftes POS-Deployment ersetzen.
- Sicherung und Rückfall vor Veröffentlichung bestätigen, danach Revision und ausgelieferte Ressourcen abgleichen.

## Ablage
Backend und funktionaler Quellcode bleiben im bestehenden GitHub-Repository. Das zusätzlich angelegte Projekt Bringness Lieferdienst wurde nicht veröffentlicht; keine zweite aktive Bestellinstanz eingerichtet.
