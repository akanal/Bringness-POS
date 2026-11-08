# POS-Gesamtprüfung für den Pilotbetrieb — 08.11.2026

## Umfang und Ergebnis

Vorhandene Funktionen und Tests weiterverwenden; Artikel-CSV ausdrücklich zurückgestellt. Online-POS getrennt von Markt und AI. Diese Prüfung ist kein Nachweis eines vollständig freigegebenen produktiven Kassensystems. Keine produktiven Testverkäufe, Konten, Zählstände, Hardwarebestätigungen oder Anbieterfreigaben erzeugen.

| Punkt | Geprüfter Umfang | Ergebnis / tatsächliche Restarbeit |
| --- | --- | --- |
| 1 Anmeldung und Rechte | POS-Login, Doppelabsenden, Sitzungs-/Rollen-/Firmenentzug, getrennte Erholung | Automatische Fälle bestanden; persönliche MFA-Aktivierung nicht stellvertretend bestätigen. |
| 2 Artikel, Preise, Varianten, Steuern | EAN/Zuordnung, serverseitige Preise, gemischte Steuerrabatte, Sprach-/Allergenkatalog; Darstellungsregression für Betriebs-/Kategorienamen | Textdarstellung korrigiert. Extras im Kellnerablauf geprüft; direkte Kasse hat derzeit keine Extras-Auswahl und überträgt nur productId/qty. Keine vollständige Variantenabnahme behaupten. |
| 3 Warenkorb, Rabatt, Parken | Centgenauigkeit, überhöhter Rabatt, Parken ohne Zahlung, Konflikte, Wiederholung nach Antwortverlust | Automatische Fälle bestanden. |
| 4 Barzahlung und Aufteilung | Barverkauf, serverseitige Betragsprüfung, keine manuelle Kartenbestätigung, idempotente Tischabrechnung | Barablauf bestanden. Kassenoberfläche sendet eine Zahlungsart; Tischabschluss erwartet vollständigen offenen Betrag. Getrennte Teilzahlungen / Zahlungen pro Gast bleiben offen. Kein ungeprüftes Terminal freigeben. |
| 5 Rechnungen, Belege, Stornos | Unveränderliche Rechnungs-/Empfängersnapshots, PDF, Pfand, Archiv, geschützter öffentlicher Beleg; Stornoprüfung/Entwurfs-Erholung | Vorhandene automatische Fälle bestanden. Stornoentwurf ist keine nachgewiesene produktive fiskalische Stornobuchung. |
| 6 Schicht und Kassenabschluss | Öffnung, Zahlungsübernahme, Abschlussvorschau, Abweichungsgrund, Snapshotkonflikt, unveränderlicher Abschluss/CSV | Automatische Fälle bestanden. |
| 7 Tisch, Kellner, Küche | Dienststatus, Tischzuweisung, Extras/Notizen, Bestellwiederholung und bestehende Browser-/QR-/Küchenabläufe | Automatische Fälle bestanden; vollständiger Restaurant-Probedurchlauf auf Betreibergeräten ausstehend. |
| 8 Verbindungsabbruch und Wiederanlauf | Socketverlust vor/nach Commit, persistente Kennungen, Neustart, Preisänderung, Rechteentzug, genau einmalige Belege | Isolierte HTTP-/SQL-/UI-Fälle bestanden. Physischer Windows-Neustart bleibt eigener Test; Download weiterhin gesperrt ohne kostenlose vertrauenswürdige Signierung. |
| 9 Scanner und Bondrucker | Scancode, expliziter Benutzerbericht, Drucktext58/80mm, Speicherung, CSV, Zugriffs-/Wiederholungsfehler | Automatisch mit synthetischen Geräteangaben geprüft. Eigener Scanner, tatsächliches Papier/Sonderzeichen/Schnitt am Arbeitsplatz noch nicht geprüft. |
| 10 Fehlerkorrektur und Pilotstand | Reproduzierbarer Name-Renderingfehler, Regression, vorhandene CI/Sicherung/Bereitstellung | Korrektur vollständig geprüft und live; Nachweise unten. Technische Bereitstellung ersetzt weder Hardwareabnahme noch LIVE-TSE-/Terminalfreigabe. |

## Korrigierter Fehler

Betriebs- und Kategorienamen wurden beim Aufbau der HTML-Auswahllisten ungefiltert als Markup eingesetzt. Ein Name wie `Café & <img ...>` verlor Zeichen; eingeschleuste option-Elemente konnten die Auswahl verändern. Beide Textpositionen verwenden jetzt den vorhandenen HTML-Escaper. Die Regression erwartet unveränderte sichtbare Namen und keine eingeschleusten Elemente. Der Test schlug vor der Korrektur fehl und besteht danach. Artikel-/Warenkorb-/Preis-/Berechtigungslogik und Layout bleiben erhalten. app.js erhält eine neue Cache-Version.

## Lokale Nachweise

26 Prüfläufe vor der Korrektur erfolgreich: allgemeine Unit-Suite plus25 bestehende SQL-/HTTP-/UI-Skripte. Nach der Korrektur POS-Authentifizierung inklusive neuer Namensregression, allgemeine Suite, Sprach-/Katalogintegration,26 Bestands-/Geräte-DOM-Fälle sowie Pfand-/Pfandjournaloberflächen erneut erfolgreich geprüft. Sämtliche Daten synthetisch und isoliert; TEST-TSE bleibt TEST, keine tatsächliche Anbieterzertifizierung ableiten.

## Reihenfolge der verbleibenden Arbeit

1. Direkte Kassen-Extras bis Preis-/Belegsnapshot vervollständigen, vorhandene Kellnerverwaltung wiederverwenden.
2. Getrennte Zahlungen pro Gast/Teilbetrag implementieren, ohne unbestätigte Kartenbestätigung zu erlauben.
3. Fiskalische Stornoausführung und Produktiv-TSE mit tatsächlich freigegebenem Anbieter separat abnehmen.
4. Vollständigen Restaurantablauf mit Scanner,58/80-mm-Bondrucker und Betreibergeräten praktisch durchspielen.
5. Erst anhand dieser Ergebnisse die Freigabe und einen belastbaren Fertigtermin festlegen. Automatische Tests allein rechtfertigen keinen festen Endtermin.


## Abgeschlossener Quellstand und Live-Nachweis

- PR275 final7692ae57e5c1f2dacac2915231274fde12db6de3 / Treed3fb2838ecd447340420a15cc58ec16f9263a6d0 / Merge08636fc0c86aacfa4d32ae171649ff11187ec0b2. Änderung nur Text-Escaping in zwei vorhandenen Auswahlen, Cache-Version, Regression und Prüfbericht; keine Varianten-/Teilzahlungsimplementierung behaupten.
- Lokal nach Korrektur705 allgemeine Tests,26 Bestands-/Geräte-DOM-Fälle, POS-Authentifizierung samt neuer Regression, Sprachintegration und beide Pfandoberflächen erfolgreich. Alle sechs finalen PR-CI erfolgreich: POS/AI42504168839/job128803106547; Center42504168833/Chromium128803106495/WebKit128803106678; Farben42504168835; isoliert42504168828; checks42504168829; release42504168842. Native POS-Suite in beiden Browsern14/14; echte HTML-Datei mit echtem app.js bestätigt unveränderte Namen und genau eine Kategorieoption. Datenbankfälle prüfen konkurrierende Abrechnung/Öffnung, exakt einmalige Verkäufe und Verbindungserholung mit PostgreSQL16.
- Authentifizierte Sicherung42211075899/job128802573680: Database backups validated. Netcup42504516040/job128804140682 deployt exakt08636fc0c86aacfa4d32ae171649ff11187ec0b2; Previous container retained, Database backup retained.
- Live/health200/no-store; POS-Einstieg200 mit pilot-name-text-20261108. app.js,payment-flow.js,device-checks.js200/no-store/bytegleich zum geprüften Quellstand. Bootstrap-,Bestands- und Geräteprotokollendpunkte ohne Anmeldung401/no-store. Keine produktiven Konten, Geschäftsvorgänge, Prüfprotokolle oder Bestände zur Abnahme verändert.
- Prüfblock technisch abgeschlossen; vollständige produktive POS-Abnahme bleibt wegen der oben konkret aufgeführten Funktions- und Geräte-/Anbieter-Restpunkte offen. Artikel-CSV zurückgestellt, Windows-Auslieferung ohne kostenlose vertrauenswürdige Signierung weiterhin gesperrt.
