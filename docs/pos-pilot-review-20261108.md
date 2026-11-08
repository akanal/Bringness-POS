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
| 10 Fehlerkorrektur und Pilotstand | Reproduzierbarer Name-Renderingfehler, Regression, vorhandene CI/Sicherung/Bereitstellung | Nach CI und Liveprüfung unten belegen. Technische Bereitstellung ersetzt weder Hardwareabnahme noch LIVE-TSE-/Terminalfreigabe. |

## Korrigierter Fehler

Betriebs- und Kategorienamen wurden beim Aufbau der HTML-Auswahllisten ungefiltert als Markup eingesetzt. Ein Name wie `Café & <img ...>` verlor Zeichen; eingeschleuste option-Elemente konnten die Auswahl verändern. Beide Textpositionen verwenden jetzt den vorhandenen HTML-Escaper. Die Regression erwartet unveränderte sichtbare Namen und keine eingeschleusten Elemente. Der Test schlug vor der Korrektur fehl und besteht danach. Artikel-/Warenkorb-/Preis-/Berechtigungslogik und Layout bleiben erhalten. app.js erhält eine neue Cache-Version.

## Lokale Nachweise

26 Prüfläufe vor der Korrektur erfolgreich: allgemeine Unit-Suite plus25 bestehende SQL-/HTTP-/UI-Skripte. Nach der Korrektur POS-Authentifizierung inklusive neuer Namensregression, allgemeine Suite, Sprach-/Katalogintegration,26 Bestands-/Geräte-DOM-Fälle sowie Pfand-/Pfandjournaloberflächen erneut prüfen. Sämtliche Daten synthetisch und isoliert; TEST-TSE bleibt TEST, keine tatsächliche Anbieterzertifizierung ableiten.

## Reihenfolge der verbleibenden Arbeit

1. Direkte Kassen-Extras bis Preis-/Belegsnapshot vervollständigen, vorhandene Kellnerverwaltung wiederverwenden.
2. Getrennte Zahlungen pro Gast/Teilbetrag implementieren, ohne unbestätigte Kartenbestätigung zu erlauben.
3. Fiskalische Stornoausführung und Produktiv-TSE mit tatsächlich freigegebenem Anbieter separat abnehmen.
4. Vollständigen Restaurantablauf mit Scanner,58/80-mm-Bondrucker und Betreibergeräten praktisch durchspielen.
5. Erst anhand dieser Ergebnisse die Freigabe und einen belastbaren Fertigtermin festlegen. Automatische Tests allein rechtfertigen keinen festen Endtermin.
