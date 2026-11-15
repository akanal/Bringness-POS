# Marktplatz-Nachtauftrag: Zehn-Punkte-Abschluss

Ausgangsstand main: `57d258485a392729d0a25d44cf42a761923ad599`. Geprüfter Anwendungsstand: `ff62583f706688c0eaa8774e75de409ffcb2046f`, Quellbaum `1e20a7a61c827c0bd67cbf009b6d10eb41724e0c`. Änderung und Prüfungen liegen ausschließlich in Entwurfs-PR331. Keine Zusammenführung, Livebereitstellung, Domainänderung oder echte Zahlung. Ausschließlich synthetische Konten/Schreibtests in isolierten Datenbanken.

## Ergebnisse aller zehn Punkte

| Punkt | Tatsächliches Ergebnis | Grenze / Restpunkt |
|---|---|---|
| 1 Registrierung | SQL-/HTTP-/DOM-Tests sowie tatsächliche Registrierung über die Browseroberfläche bei 390/768/1280px bestanden. Pflichtfelder, Normalisierung, atomare Anlage, Antwortverlust und Wiederholung geprüft. Registrierung meldet nicht automatisch an. | Kein neues Produktivkonto angelegt. |
| 2 Anmeldung / Passwort | Fehlenden Wiederherstellungseinstieg direkt in der Shop-Anmeldung ergänzt. Vorhandener gemeinsamer `/api/v1/auth/forgot-password`-Dienst bleibt maßgeblich. Generische Rückmeldung, Fehler/Timeout, Einzelanfrage, Kontowechsel und verworfene späte Antworten getestet. Bestehender vollständiger Reset mit simuliertem SMTP, Einmaligkeit/Ablauf/Sitzungsentzug und Anmeldung mit neuem Passwort bestanden. | Zustellung in ein echtes Postfach und menschlicher Klick auf diesen Link nicht geprüft. Der vorhandene gemeinsame E-Mail-Rücksetzpfad bleibt erhalten. Änderung noch nicht live. |
| 3 Fehlgeschlagene Händleranlage | Standardablauf mit drei tatsächlich registrierten Testkonten über Oberfläche erfolgreich: Zustimmung, Antrag speichern, erneut laden, Status „In Prüfung“. Zusätzlich Replay/Rollback/erneute Einreichung getestet. | Der konkrete frühere Produktivfehler ist ohne genaue Fehlermeldung und Schritte weiterhin nicht reproduziert. Keine Behauptung, dieser Einzelfehler sei behoben. |
| 4 Adresse | Tatsächliche PLZ-Ergänzung 10551→Berlin in der Registrierung bei drei Größen bestanden; vorhandene Stadt-/Ländervorschläge, Adressspeicherung/-validierung geprüft. Straßen- und Hausnummern werden nicht geraten. | Keine Behauptung einer weltweiten oder amtlichen Vollvalidierung. |
| 5 Händlerprüfung / Adminfreigabe | Bestehende native Gesamtprüfung und SQL-/HTTP-Tests bestätigen ausdrückliche manuelle Freigabe, Zustimmung, Revision und Wiederholung. Neue Browseranträge bleiben bis zur Freigabe „In Prüfung“. | Keine produktiven Händler freigegeben. |
| 6 Ablehnung / Sperrung / Rechte | Bestehende Gesamtprüfung bestätigt verweigerte Selbstfreigabe, Mandantentrennung, entzogene Plattformrechte, Ablehnung/Sperre und Zurückziehen öffentlicher Angebote. Wiederfreigabe veröffentlicht nichts automatisch. | Tatsächliche Rechte eines individuellen Kundenkontos wurden nicht verändert oder als geprüft ausgegeben. |
| 7 Ausgeblendetes POS-Angebot | `pos-online` ist im Katalog vorhanden,34,99 EUR netto monatlich. Tatsächliches Ausblenden und „Alle wieder anzeigen“ bei 390/768/1280px bestanden; bestehende Hide-all/Undo/Restore-all-Prüfung erfolgreich. | Eine persönliche Ausblendung im Safari-Profil des Eigentümers wurde nicht verändert. Dort oberhalb der Liste „Alle wieder anzeigen“ verwenden. Kein neues Angebot angelegt. |
| 8 Markt / POS / AI | Bestehende Produktrouten und getrennte Sitzungsschlüssel geprüft. Tatsächliche Shop-Anmeldung schreibt keinen POS-Token. Wiederherstellung wird direkt im Shop angefordert, ohne POS-Oberfläche zu laden. Gemeinsame Kontoidentität bleibt erhalten. | Keine Domainänderung und keine Änderung von Lizenzen/Anbieterfreigaben. |
| 9 Impressum / Datenschutz / Cookies | Alle vier Footerziele im Browser geprüft; lokale Anwendungsrouten liefern 200. Cookie-Notwendigkeit, Komfort-Opt-in und Widerruf durch bestehende Prüfungen abgedeckt. | Impressum und Datenschutz sind tatsächlich weiterhin unvollständige Platzhalter. Finale Betreiberangaben und geprüfte Texte fehlen; keine juristische Freigabe. |
| 10 Zusammenhängende Browser-/Tabletprüfung | Neuer vollständiger Registrierungs-/Händlerablauf mit echtem Produktionseinstieg und PostgreSQL sowie bestehende Gesamtprüfung erfolgreich. Responsive Größen390/768/1280px, gespeicherter Händlerstatus, POS-Wiederanzeige, Rechte, Konto-/Bestellabläufe und kein horizontaler Überlauf geprüft. | Chromium in CI ist keine tatsächliche iPad-/Safari-Geräteabnahme. Diese bleibt ein kurzer gemeinsamer Praxistest. |

## Korrigierter Befund

Der frühere Automationslauf hatte einen Link zur POS-Seite ergänzt. Der vollständige CI-Lauf erkannte, dass dies der bestehenden Shop-Navigationstrennung widerspricht. Die Trennungsprüfung wurde nicht abgeschwächt. Stattdessen gibt es einen geschlossenen Wiederherstellungsbereich im Shop, der ausschließlich den bestehenden gemeinsamen Passwortdienst anspricht. Cookies und Authheader werden dabei nicht übertragen; Sitzungstokens werden weder kopiert noch verändert. Der Timeout entspricht dem bestehenden Mailpfad mit 60Sekunden. Keine neue Passwortdatenbank oder neue Wiederherstellungsberechtigung.

Ein bestehender Browser-Test hatte danach wegen zweier E-Mail-Felder einen mehrdeutigen seitenweiten Selektor. Er wurde auf das tatsächliche Anmeldeformular eingegrenzt; die Prüfung von falschem Passwort, beibehaltenem maskiertem Passwort und erfolgreicher Anmeldung bleibt vollständig erhalten.

## Prüfnachweise

- Allgemeine Tests: 736 bestanden, 0 Fehler.
- Finale isolierte Shop-Suite in CI: 877 bestanden, 0 Fehler/Skip.
- Gezielte Login-/Recovery-/Navigation-/Legal-Prüfung: 20 bestanden.
- `node server/ai-tests/admin-reset-integration.mjs`: isolierter SMTP-/Resetpfad erfolgreich; keine E-Mail an ein echtes Postfach.
- Alle vier finalen PR-CI auf ff62583f erfolgreich: Checks43665292909, Release43665292906, isolierte Vorschau43665292914 und Shop43665292897/job132663197095.
- Neuer Browserlauf: drei ausdrückliche Registrierungen, PLZ-Ergänzung, Anmeldung, Händlerantrag/erneutes Laden, POS ausblenden/wiederherstellen, Recovery-Einstieg und Rechtstextziele bei 390/768/1280px bestanden. Keine Passwort-E-Mail angefordert.
- Bestehender vollständiger Produktionseinstiegs-/PostgreSQL-/Browserlauf mit Quote, Entwurf, Antwortverlust/Wiederholung, vorbereitetem Checkout ohne Zahlung, Kontoisolation, Verkäuferpflege, manueller Prüfung und Bestellabläufen ebenfalls bestanden.
- Eigene leere Loopback-Datenbank `bringness_shop_night_audit` und separater tatsächlicher Anwendungsstart für den neuen Ablauf. Das vorhandene Registrierungslimit wurde weder erhöht noch deaktiviert; kein Produktionszugriff über diese Tests.
- Screenshotprüfung der synthetischen Händleransicht auf Handy/Tablet; vorheriger identischer Oberflächenstand aus Artefakt14141613016 geprüft. Die letzte funktionale Differenz betrifft Timeout und Testauswahl, keine Gestaltung.
- main zum Abschluss unverändert auf 57d25848. Kein Netcup-Deploy, keine produktiven Konten-/Beleg-/Finanzänderungen durch diesen Auftrag.

## Morgen gemeinsam offen

1. Konkreten früheren Händlerfehler mit genauer Meldung und Handlungsschritten nachstellen.
2. Passwort-E-Mail mit einem ausdrücklich geeigneten Testkonto im tatsächlichen Postfach prüfen.
3. Falls das POS-Angebot im persönlichen Browser ausgeblendet ist: „Alle wieder anzeigen“ dort ausführen.
4. Kurzer tatsächlicher iPad-/Safari-Test; responsive CI-Prüfung ersetzt ihn nicht.
5. Finale Betreiberangaben und geprüfte Impressums-/Datenschutztexte bereitstellen. Die technischen Links sind vorhanden, Inhalte bleiben Entwürfe.

Nächster sinnvoller Schritt: zuerst den konkreten Händlerfehler und den echten Wiederherstellungsweg gemeinsam abnehmen; anschließend der separat vorgesehene Centersystem-Test. Dieser Zweig bleibt bis zu einem neuen Veröffentlichungsauftrag unveröffentlicht.
