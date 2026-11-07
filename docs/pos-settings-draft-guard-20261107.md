# POS: Bestandsarbeit beim Ansichtswechsel schützen

Stand: 07.11.2026, PR266 und PR267.

## Verhalten

POS → Einstellungen enthält die Bestands-/Geräteprüfung weiterhin direkt. Vor einem internen Ansichtswechsel wird der aktuelle Zustand des eingebetteten, gleichursprünglichen Fensters synchron geprüft. Offene Zählfelder verlangen eine ausdrückliche Bestätigung zum Verwerfen. Abbrechen erhält die Ansicht samt Werten und Navigationsverlauf. Laufende Arbeit oder eine noch unbestätigte Speicherung sperren das Entfernen des Fensters, bis derselbe Vorgang geklärt ist.

Auch der übergeordnete Betriebswechsel prüft dies vor dem Leeren des bestehenden Kassen-Warenkorbs. Ein abgebrochener Wechsel stellt die vorherige Betriebsauswahl wieder her. Die aktive Einstellungsansicht wird anhand des vorhandenen Ansichtsmarkers erkannt, auch wenn sie über das Benutzermenü geöffnet wurde und keine aktive Hauptnavigationsschaltfläche besitzt. Nach einem erlaubten Wechsel werden die Einstellungen und die Bestandsprüfung für den ausgewählten Betrieb neu geladen. Das bisherige Verhalten eines erlaubten Betriebswechsels für den Warenkorb bleibt erhalten.

Die Bestandsansicht gibt ausschließlich drei boolesche Zustände (dirty, pending, busy) an ihren gleichursprünglichen Elternrahmen. Keine Zugangsdaten, Bestandswerte oder Schreibbefugnisse werden übertragen. Speicher-API, Revisionen, ursprüngliche Anfragekennungen, Lizenzregeln und Kontentrennung bleiben unverändert. Konten-/Sitzungsentzug darf private Eingaben weiterhin löschen; dieser Schutz blockiert keine erzwungene Abmeldung. Browser-/Geräteabsturz und erzwungenes Schließen sind keine garantierte Entwurfssicherung. Vor Verlassen der Anwendung speichern.

## Prüfung

Lokal: 705 allgemeine Tests und 10 Bestands-DOM-Prüfungen erfolgreich. Neue Fälle prüfen den booleschen Elternzustand bei Entwurf, verlorener Antwort und erfolgreicher Wiederholung, Kontenwechsel sowie den tatsächlichen Betriebswechsel-Handler vor einer möglichen Warenkorb-/Ansichtslöschung.

Browser-Abnahme verwendet den tatsächlichen POS-Navigationscode und das tatsächliche eingebettete Bestandsdokument: Abbrechen/Bestätigen, verzögerte POST-Antwort und serverseitig bestätigte Speicherung mit verlorener Antwort. Wiederholung erhält dieselbe Anfragekennung; eine verworfene Menge wird nicht gespeichert. Verwaltungs-PIN, bestehender Warenkorb, fremde Nachrichten und mobile/Desktop-Breiten bleiben geprüft.

## Windows-Entscheidung des Eigentümers

Nur eine kostenlose vertrauenswürdige Signierung kommt infrage. Keine kostenpflichtigen Zertifikate oder Signaturdienste buchen. Windows-Download bleibt gesperrt, solange kein passender kostenloser, geprüfter Auslieferungsweg eingerichtet ist. Online-POS weiterentwickeln; eine Bestellung hebt die Kostenentscheidung oder Signatur-/Prüfanforderungen nicht automatisch auf. Eine selbst erstellte Testsignatur ist keine öffentlich vertrauenswürdige Kundensignatur. Microsoft-Store/MSIX ist bislang eine geprüfte Möglichkeit aus der Recherche, keine eingerichtete Veröffentlichung.

## Verifizierter Quellstand

Featurecf154fcd8315240562795ce6b34689cd87cdd7b3 / Tree79a3f84f0f958b46e54922f3755a4d4b37d338f2 / Merge1999c1ee8ad42cd5ac0573ca7182e62acdb9bf54. Alle sieben PR-CI erfolgreich: POS/AI42417206343; Center42417206340 (Chromium128537773927, WebKit128537774133); Shop42417206353/job128537774020 mit804 Tests und tatsächlichem PostgreSQL-/HTTP-/Browser-Einstieg; Farben42417206301; isoliert42417206483; checks42417206413; release42417206303. WebKit-Bilder13591981818 bei390/1280px visuell geprüft. Bestehende Darstellung ohne Layoutänderung.

Frische authentifizierte Sicherung42211075899/job128537807456: Database backups validated. Keine produktiven Zählstände, Aufträge oder Benutzerkonten für die Prüfung angelegt. Physische Hardwareprüfung bleibt eigenständig.

Ergänzung PR267: Featurefe9a4e2dbd0cc5d7dd8ddad507f420005da77049 / Tree5a3a93771a6322dc0416f5ac66d66560610011cd / Merge4769219ed43fa7ccfe0ae6a14732faabf8448955. Tatsächlicher Betriebswechsel über das Benutzermenü zusätzlich in Chromium/WebKit geprüft, einschließlich Abbruch mit unverändertem Eingabewert und anschließendem ausdrücklichem Wechsel zur Bestandsansicht des neuen Betriebs. Alle sieben finalen PR-CI erfolgreich: POS/AI42417845793, Center42417845730 (Chromium128539682105, WebKit128539682271), Shop42417845814/job128539682449, Farben42417845788, isoliert42417845702, checks42417845758, release42417845672.

Netcup42418271147/job128540964257 deployt exakt4769219ed43fa7ccfe0ae6a14732faabf8448955; vorheriger Container und Datenbanksicherung behalten. Main-Center42418271233 und Farben42418271287 ebenfalls erfolgreich. Live: app.js/operations.js200/bytegleich mit finalem Quellstand, POS-Einstieg200 mit aktueller Asset-Version, eingebettete Bestandsseite200/SAMEORIGIN, Health200/no-store, privater Bestandsendpunkt ohne Anmeldung401/no-store. Kein produktiver Zählstand für diese Abnahme verändert.
