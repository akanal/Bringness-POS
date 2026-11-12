# Automatische Dienstplanung — 12. November 2026

## Verhalten

Unter Personalmanagement → Dienstplan → Automatische Dienstplanung hinterlegt der Betreiber Besetzungszeiten, Rollen und benötigte Kenntnisse sowie ausdrücklich erlaubte Mitarbeiter und deren Verfügbarkeit. Ohne Einrichtung bleibt die Automatik ausgeschaltet. Ein Worker erstellt nach Aktivierung Entwürfe für die nächsten zwei Wochen. Die Zeitzone gehört zum Betrieb; Stunden werden eindeutig im 24-Stunden-Format eingegeben. Doppeldeutige oder fehlende Ortszeiten bei Zeitumstellung werden abgewiesen.

Neue Dienste erscheinen erst nach ausdrücklicher Freigabe in waiter_schedules und damit in der Kellner-App. Die Entwurfstabellen werden von der Kellner-App nicht gelesen. Offene Stellen müssen ausdrücklich bestätigt werden und bleiben im veröffentlichten Vorschlag protokolliert; sie werden nicht als scheinbar besetzte Dienste angelegt. Planung erzeugt keine Stempelbuchung und aktiviert keinen Handy-Arbeitsplatz ohne tatsächliches Einstempeln.

Änderungen unterscheiden „Nur dieser Dienst“ und „Künftig wöchentlich so planen“. Feste Regeln haben ein Wirksamkeitsdatum. Frühere Wochen und einmalige Ausnahmen bleiben erhalten; andere bereits veröffentlichte Dienste werden nicht still verändert. Geschützte Dienste bleiben auch bei Ausfall ihrer Person erhalten und werden als offen markiert. Die frühere stille Vier-Wochen-Anlage nach drei ähnlichen manuellen Einträgen ist entfernt. Bestehende ungeschützte Vertretungsdienste behalten ihre frühere Behandlung.

## Schutz und Wiederherstellung

Die API /api/v1/roster-auto prüft aktuelle Besitzer-/Adminrolle, Sitzung, firmengebundenen Betrieb, Personalmodul und die bestehende sitzungsgebundene Verwaltungsfreigabe. Die eingebettete Ansicht nutzt den bereits geschützten Fetch der Kasse; sie speichert keine Verwaltungs-PIN und meldet Benutzeraktivität an die bestehende Inaktivitätssperre. Wechsel der Anmeldung räumt Personaldaten aus der Ansicht.

Echte Schichtänderungen, Freigabe, Antwortkennung und unveränderliches Änderungsprotokoll werden gemeinsam bestätigt oder zurückgerollt. Identische Wiederholung einer unbestätigten Anfrage erzeugt keine zusätzlichen Dienste. Neue Schreibaktionen und Navigation bleiben bei unbestätigter Antwort gesperrt. Versions-/Kontextprüfung erkennt inzwischen geänderte Personalzuordnung, Abwesenheiten, Dienste und Planungsvorgaben. Manuelle Entscheidungen werden bei Vorschlagsaktualisierung erhalten. Qualifikationen, Verfügbarkeit, Abwesenheit, Überschneidung, elf Stunden Abstand sowie konservativ acht Stunden je Betriebstag und 40 Stunden je Kalenderwoche werden geprüft.

## Prüfungen

- Lokal 713 allgemeine Tests ohne Fehler/Skip; acht neue reine Planungsfälle einschließlich Zeitumstellung, Qualifikation, Abwesenheit, geschützter Vorgabe, Doppelbelegung und Kalenderwochengrenze.
- PGlite auf dem tatsächlichen Basisschema: additive Migration zweimal, deaktivierter Start, Entwürfe ohne echte Dienste, PIN-/Sitzungs-/Firmen-/Modulbindung, veralteter Kontext, ausdrückliche Freigabe offener Stellen, Auditfehler mit vollständigem Rollback, identische Wiederholung, einmalige versus zukünftige Wochenregel, Ausfall eines geschützten Dienstes und unveränderliche Protokolle.
- PostgreSQL16 zusätzlich mit unabhängigen Verbindungen: gleichzeitige identische Freigaben werden einmal geschrieben; während wartender Freigabe geänderte Vorgaben blockieren Veröffentlichung.
- DOM mit echten submit-Ereignissen und eingebettetem Parent: nur lesender Start, explizite Personalauswahl, verlorene Antwort, exakter Retry, ungespeicherte Dienständerung, Wochen-Auswahl, Sitzungswechsel und Navigation bei offenem Vorgang.
- Chromium und WebKit: jeweils 24 native POS-Fälle erfolgreich; neuer Fall prüft tatsächliche Formbedienung, Antwortverlust/Neuladen/Retry, einmalige/wöchentliche Auswahl und separate Veröffentlichung bei 390/1280px ohne horizontalen Überlauf. WebKit-Bilder aus Artefakt13935341547 vom Vorlauf acdd9bfc visuell geprüft; finale Oberfläche gleich, danach Verwaltungsfreigabe ergänzt und beide Browser erneut erfolgreich.

Keine produktiven Mitarbeiter, Dienst-/Stempelzeiten, Kalender, Bestellungen oder Zahlungen zur Abnahme angelegt oder verändert. Betriebszeiten und Personalverfügbarkeit werden vom Betreiber eingerichtet, nicht aus Testdaten übernommen.

## Quellstand und Gesamtprüfung

PR296, finaler Featurestand 2d13d3dd2fd8b12cdbe73ea122190fb2047d8a37, Baum a16d35af4878bdf75674f3661c65ebe471fee9f4 (lokal identisch), Merge0f5acf4a62b6c379ee9d823a0a736222239f50ed. Alle sieben finalen Prüfungen erfolgreich: checks43201680765, release43201681008, isoliert43201681344, POS/AI43201680881/job131126414690, Center43201681285/Chromium131126414525/WebKit131126415133, Navigation43201681240 und Shop43201681247/job131126416066. Letzterer bestätigt auch den tatsächlichen Produktionseinstieg mit PostgreSQL und Browser.

## Veröffentlichung und Liveprüfung

Netcup43202878683/job131130528107 deployt exakt0f5acf4a62b6c379ee9d823a0a736222239f50ed. Authentifiziertes Protokoll bestätigt vorherigen Container und DB-Sicherung behalten; neue Planungs-/PIN-/DOM-Regressionen auch dort erfolgreich. Livehealth200/status:ok/database:ok, POS200/no-store mit auto-roster-20261112 für app.js und restaurant-owner.js. roster-auto.js, roster-auto.css, restaurant-owner.js und app.js jeweils200/bytegleich zum geprüften Quellcode. roster-auto.html200/no-store entspricht exakt der Quelle einschließlich der unveränderten allgemeinen brand-logo.js-Injektion. CSS wie bestehende statische Stile public/max-age300 mit Versionskennung. Neuer privater Dienstplan ohne Anmeldung401/no-store. Keine produktiven Personal-, Dienst- oder Stempelbuchungen zur Abnahme verändert.
