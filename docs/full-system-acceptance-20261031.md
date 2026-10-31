# Bringness – gemeinsamer Gesamttest

Ausgangsbasis: main `2e97905d20c9c02bab9e3972ba8e09baea3e2cf5`, einschließlich PR200; Rechnungs-Regressionsprüfung aus PR186 anschließend auf diesen Stand übernommen und als `926135f101d276b27111e2b9522c2d738a61d96d` gemergt. Bestehende Gestaltung bleibt unverändert. Diese Liste erweitert die Händlerliste und bündelt den Geräte-Testbacklog; sie bestätigt keine bereits erfolgte praktische Abnahme.

## Vorbereitung und Protokoll

PC/Windows, iPad/Safari und Android-Handy bereithalten. Browser-/App-Version, Gerätezeit und tatsächlich getestete Serverrevision notieren. Zwei getrennte Testbetriebe A/B, Inhaber, Kellner und Käufer verwenden. Schreibende Geschäftsabläufe ausschließlich in einer ausdrücklich getrennten Testumgebung mit synthetischen Daten durchführen. Die öffentliche Produktionsseite kann lesend geprüft werden. Ein vorhandenes Konto oder Dashboard-Login ist keine Freigabe von echten Zahlungen.

Je Fall dokumentieren: ID, Umgebung/Revision, Gerät, Schritte, Soll/Ist, PASS / FEHLER / BLOCKIERT, anonymisierte Referenz und nächster Schritt. Ein blockierter oder nicht durchgeführter Fall zählt nicht als bestanden. Keine Zugangsdaten, Tokens oder echten Kundendaten ins GitHub-Protokoll schreiben. Vor jedem Fehlerfall zuerst den normalen Ablauf prüfen.

## 1. Domains, Anmeldung und Marktplatz

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| M01 | bringness.de und www öffnen; bringness-pos.de getrennt öffnen | Erstere zeigen Marktplatz am Domain-Stamm; POS-Domain zeigt Kassenproduktseite auf eigener Domain. bringness.com-Transfer ist getrennt zurückgestellt. |
| M02 | Start, Konto, Händler, Impressum und Datenschutz bei 390/768/1280 px öffnen | Genehmigter grüner Kopf, weißer Hintergrund, Marketplace-Schriftzug auf Rechtsseiten; keine abgeschnittenen Bedienelemente. Pfeil öffnet Assistenten, Wortmarke Startseite. |
| M03 | In frischem Browser notwendige Speicherung wählen, neu laden; Einstellungen öffnen, Komfort erlauben und widerrufen | Hinweis erscheint zunächst, gespeicherte Auswahl verhindert automatisches Wiederöffnen. Widerruf entfernt optionale Ansichtspräferenzen; Warenkorb/Anmeldung bleiben erhalten. Bei blockierter Speicherung keine optionale Speicherung. |
| M04 | Bestehendes Geschäftskonto anmelden/abmelden, falsches Passwort, Reset und verbrauchten Link prüfen | Klare Fehler, einmalige Links, kein fremder Kontozugriff. Gemeinsames Geschäftskonto nicht als eigenständige neue Privatkunden-Registrierung darstellen. |
| M05 | Händlerdaten und Produktentwurf speichern, erneut laden, Bild hochladen/ersetzen/entfernen und Angebot veröffentlichen | Pflichtdaten geprüft; ohne tatsächliche Händlerfreigabe kein freigegebener Verkauf. Nicht veröffentlichte/fremde Bilder unzugänglich; ausgetauschtes Bild nicht mehr öffentlich erreichbar. |
| M06 | Bestellung und verlorene Antwort mit derselben Kennung wiederholen; parallel in zweitem Tab laden | Genau eine Bestellung und ein Bestandsabzug. Käufer und Händler sehen dieselbe gespeicherte Referenz und nachvollziehbare nächste Schritte. |

Bild- und Betragsdetails sowie die zehn Händlerfälle: [Händler-Testliste](marketplace-merchant-test-checklist-20261101.md). Rechtstext-Platzhalter bleiben eine Startsperre für den echten Handel.

## 2. POS, Kunden, Rechnungen und Abrechnung

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| P01 | Artikel, Varianten, Rabatt, Pfand, Teilzahlung, Bargeld/Restbetrag und Abschluss testen | Summen stimmen; gleiche Pfandbeträge gebündelt, verschiedene getrennt. Zweiter Klick/verlorene Antwort erzeugt keinen zweiten Abschluss. |
| P02 | Kundenadresse mit falscher PLZ/Ort bearbeiten; Rechnung und Lieferschein getrennt erstellen | Warnung nachvollziehbar, Korrektur möglich. Eigene Belegarten/Nummernkreise, vollständige Mengen und Netto/USt./Brutto. Keine erfundene Adressbestätigung. |
| P03 | Bringness-Aborechnung mit/ohne Händler-Kundennummer als PDF prüfen; Betrieb neu laden | Vorhandene Kundennummer bleibt gleich und steht im tatsächlichen PDF-Text. Fehlende Nummer wird nicht erfunden. Kundennummer ist keine Rechnungsnummer. |
| P04 | A4-/Bondruck, Umbruch, lange Position, Tagesabschluss und erneute Anzeige prüfen | Keine abgeschnittenen Pflichtdaten; gespeicherter Abschluss bleibt unverändert. Physischer Druck gesondert bestätigen. |
| P05 | Steuerberater freigeben, paginieren/exportieren und Zugriff entziehen | Nur freigegebener Betrieb, vollständige Reihenfolge; Entzug verhindert weitere Datenabfragen. |

## 3. QR, Kellner, Küche und Abholung

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| Q01 | Tisch-, Tresen- und Center-Modus jeweils mit erforderlichen Testmodulen öffnen | Betriebsarten bleiben getrennt. Vor-Ort-Bestellung ist keine bestätigte Zahlung und kein bezahlter Beleg. |
| Q02 | Kellner A/B gemeinsam Tisch zuweisen, Bestellung mit Varianten/Küchennotiz senden, Küche bearbeiten | Richtiger Betrieb/Tisch, genau eine Bestellung, Notiz und Status erhalten. Bezahlte/stornierte Tischaufträge verschwinden aus offenen Summen. |
| Q03 | Tresenauftrag sehen, bezahlen und ausdrücklich abholbereit freigeben | Bezahlter, nicht abholbereiter Auftrag bleibt sichtbar. Gast erhält Status erst nach tatsächlicher Freigabe; Neuladen mit Bestelllink funktioniert. |
| Q04 | Android bei offenem Browser und Standby testen, Ton/Vibration einzeln deaktivieren | Tatsächliche Handy-Anzeige und Signal dokumentieren. Anbieterannahme allein zählt nicht als Geräteerfolg. Vollständig ausgeschaltetes Handy nicht als erreichbar bewerten. |
| Q05 | iPad/Safari öffnen, Verbindung trennen und erneut verbinden | Fehler bleiben sichtbar, keine Doppelbestellung. Für iPhone-Gäste ohne bestehende Home-Screen-App ist offene Bestellseite nötig; keine Sperrbildschirm-Zusage. |

## 4. Bildschirmsteuerung

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| D01 | Einzelbild/-video wählen, Quer/Hochformat prüfen, Player und Kasse neu starten | Einzelmedium bleibt dauerhaft, stabiler Link und Zuordnung erhalten. |
| D02 | Bewusst auf zeitgesteuerte Playlist wechseln, fernändern, Netzausfall testen | Keine Mischung von Dauer- und Zeitmodus; gespeicherter Stand bleibt nachvollziehbar, Änderungen erscheinen nach Verbindung. |

## 5. Personal und Berechtigungen

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| S01 | Per E-Mail einladen; Kellner wählt Namen/Passwort und getrennte vierstellige Stempel-PIN | Einmallinks, getrennte Passwort-/PIN-Rücksetzung. Stempeln ausschließlich an autorisierter Kasse. |
| S02 | Dienstplan, Krankmeldung/Rückkehr, Urlaub/Vertretung testen | Nur eigene Meldungen; Inhaber genehmigt Urlaub. Keine erfundenen Stempelzeiten oder ungeprüfte konfliktbehaftete Vertretung. |
| S03 | Zugriff entziehen, alte Sitzung/Links erneut nutzen; Betrieb B prüfen | Sofortiger Zugriffsschutz; Bestellungen/Belege bleiben erhalten. Keine Daten aus A bei B. Modulbuchung nur mit geschütztem Inhaberablauf. |

## 6. Windows, Offline und Wiederanlauf

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| O01 | Gültiges Testgerät offline nehmen, Verkauf speichern, App neu starten, Netz zurückbringen und mehrfach synchronisieren | Originalpreise und Original-Verkaufskennung bleiben; genau ein Serverimport. Kein neuer Verkauf nach Ablauf der Gerätefreigabe. |
| O02 | Nach verlorener Antwort Katalog/Firma wechseln, später wieder zu A zurückkehren | Keine fremden Warenkörbe/Belege/Zähler bei B. A-Originalbeleg bleibt unter A erhalten; kein neuer Abschluss durch Wiederholung. |
| O03 | Scanner mit Enter, schnelle Doppelbetätigung und Drucker testen | Richtiger Artikel/Menge; keine zweite Zahlung. Tatsächliche Hardwareabnahme separat protokollieren. |
| O04 | Freigegebenes Update installieren, lokale Daten erneut prüfen | Daten bleiben. Signierter öffentlicher Installer und dauerhaft offline fiskalisierte Produktion bleiben bis Zertifikat/Hardware-TSE-Abnahme blockiert. |

## 7. AI, Lager und Einkauf

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| A01 | POS-Betrieb/AI-Standort verknüpfen, Rezept zuordnen, Verkauf wiederholen | Genau ein Verbrauch am freigegebenen Standort; fremde/fehlende Zutaten sperren Freigabe. Änderung der Firmenbindung löst Konflikt statt Fremdbuchung aus. |
| A02 | Bestand und Reservierung bis zur Tausendstelgrenze, Teilrückgaben und verlorene Bestätigung testen | Exakte Mengen, Rückgabe höchstens ursprünglicher Verbrauch; gleiche Kennung erzeugt keine zweite Wirkung. |
| A03 | Foto/PDF importieren, Entwurf korrigieren, freigeben, erneut hochladen | Vor Freigabe keine Lagerwirkung; danach genau einmal. Unbekannter Preis bleibt offen; keine fremden Belege. |
| A04 | PLZ/Wetterausfall, Prognose mit fehlender Historie, Ruhetage und HH:MM prüfen | Manuelle Auswahl bleibt erhalten; fehlende Daten klar benannt. Keine erfundene Prognosesicherheit, keine AM/PM-Verwechslung. |
| A05 | Einkauf vorschlagen, Freigabe entziehen und Wiederholung simulieren | Ohne tatsächliche Freigabe keine Bestellung. Keine echten Lieferantenbestellungen im Test; Grenzen/Lieferbedingungen respektiert. |

## 8. Zahlung, Fiskalisierung und Betrieb

| ID | Prüfschritte | Soll-Ergebnis |
| --- | --- | --- |
| B01 | Händlerbereitschaft ohne Rechte und als richtiger Inhaber prüfen | Ohne Anmeldung 401; privat konkrete Sperrgründe für genau Betrieb/Händler/Profil. Plattform-API-Key ersetzt keine Händler-OAuth-Freigabe. |
| B02 | Auf explizitem TEST-Host Erfolg/Abbruch/unklare Zahlung, doppelte Webhooks und Wiederabgleich testen | Keine zweite Zahlung/Zuordnung, keine echten Waren oder Produktivbelege. Rückkehradressen/Webhooks müssen tatsächlich zur Testinstallation passen. |
| B03 | 5 % Nettowarenprovision, Teil-/Vollerstattung und Guthaben vergleichen | Versand/USt. nicht in Basis; keine Auszahlung vor wirksamer Vertragsbeendigung. Ohne verbundene Gebühren-/Erstattungs-/Bankadapter als BLOCKIERT erfassen. |
| B04 | Bestehenden Fiskaly-TEST-Status prüfen, simulierten Ausfall/Wiederholung ausführen | TEST bleibt TEST. Keine zusätzliche reale Signatur oder LIVE-Aktivierung allein aufgrund dieses Plans. Produktiv-TSE-Freigabe und Offline-Hardware fehlen weiterhin. |
| B05 | IDrive-Bereitschaft, geschützten Belegzugriff und isolierte Rücksicherung prüfen | Bereitschaft ist kein PDF-Ende-zu-Ende-/Wiederherstellungsbeweis. Fremdzugriff gesperrt; Wiederherstellung überschreibt nie Produktion. |

## Zusammengefasste tatsächliche Startsperren

- Händler-/Profilfreigabe, geschützte LIVE-OAuth-/Abnahmespeicherung und verifizierte Rückkehr-/Webhook-Konfiguration sind gesondert nachzuweisen. Bestehende API-Schlüssel nicht erneut erzeugen.
- Automatische Mollie-Provision/Erstattungsanbindung, echte Gebührenverrechnung, Vertragsbeendigung/Bankauszahlung, produktive Fiskal-/Gutschriftintegration und dauerhafte nachgelagerte Warenübergabe sind nicht vollständig angeschlossen.
- Rechtsseiten enthalten unvollständige Entwürfe. Geräte-/Druck-/Push-Abnahme, signierter Installer und Hardware-TSE sind durch automatisierte Tests nicht erledigt.
- Bereits vorhandene historische TEST-Erfolge nicht erneut als fehlende Grundeinrichtung behandeln; gleichzeitig nicht als aktuelle LIVE-Freigabe auslegen.

Automatisierte Ergebnisse, aktuelle CI-Revision und Bereitstellungsnachweis werden im Projekt-Handoff getrennt von diesen noch auszuführenden praktischen Fällen festgehalten.

## Frische automatisierte Nachweise dieses Durchlaufs

- Allgemeiner Testlauf nach Übernahme: 686 bestanden, keine Fehler/Skips. Windows-Desktop: 39 bestanden, keine Fehler/Skips. Kundennummer/Migration/PDF/privater SQL-Audit: 3 bestanden.
- 31 Integrationsskripte erfolgreich: pos-auth, personnel, personnel-service, staff-lifecycle, duty-planning, table-waiters, waiter-workflow, waiter-draft, waiter-push, waiter-signal, pickup-notify, qr-guest-push, center-onsite, center-simple-ui, displays, checkout-recovery, table-settlement, trade, customer-delivery, cash-closing, offline-ui, offline-accountant, offline-http-sync, stock-lifecycle, pos-stock-bridge, integration, fiskaly-test, fiskaly-sandbox, billing-mail, transactional-mail, time24-forms. Diese lokalen Läufe verwenden isolierte Fixtures, PGlite und DOM-Simulationen.
- Vollständiger Shop-Testlauf: **742 bestanden, keine Fehler/Skips**.
- Zahlungsprüfungen lokal: 153 bestanden, vier echte PostgreSQL-Fälle lokal übersprungen. GitHub-Zahlungslauf einschließlich Kundennummern und echtem PostgreSQL: **160 bestanden, keine Fehler/Skips**, Run41242769717/job124659892971. Damit sind die vier lokalen Auslassungen ausdrücklich durch CI abgedeckt.
- Feature `bd93179ef8b54b4e6188344587482492fb6234c5`: alle fünf einschlägigen Workflows erfolgreich (Payment41242769717, POS/AI41242769624, Isolated41242769652, checks41242769629, release41242769585).
- Frisches authentifiziertes Netcup-Backup41242903444/job124660285607 erfolgreich: „Database backups validated“.
- Öffentliche Live-Abfragen: Marktplatz/www, POS-Domain und beide Rechtsseiten HTTP200; Rechtsseiten ohne injiziertes POS-Logo. IDrive meldet storage=idrive/configured=true/available=true. Händlerbereitschaft ohne Anmeldung HTTP401. Das bestätigt Erreichbarkeit/Bereitschaft/Zugriffsschutz, keine echte Bestellung oder vollständige Belegspeicherung.

Die übernommene Rechnungsänderung ergänzt Regressionstests und privaten SQL-Audit sowie deren CI-Zuordnung; sie schaltet keine Geschäfts- oder Zahlungsfunktion frei. Den privaten SQL-Audit nicht als bereits auf der Produktionsdatenbank ausgeführt darstellen.

Live-Browser zusätzlich: Marktplatz am Domain-Stamm und Impressum mit Marketplace-Wortmarke bestätigt. „Nur notwendige“ schließt den Cookie-Hinweis; nach Neuladen bleibt er geschlossen, die Einstellungen bleiben erreichbar.

PR186 wurde über Netcup41242983317/job124660523758 exakt als `926135f101d276b27111e2b9522c2d738a61d96d` bereitgestellt; vorheriger Container und Datenbanksicherung bleiben erhalten. Browser-Neuladen nach Bereitstellung bestätigt Marktplatz am Stamm, erhaltene Cookie-Auswahl und weiterhin sichtbare Vorschau-/Zahlungssperre.
