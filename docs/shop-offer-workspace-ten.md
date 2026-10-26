# Anbieterarbeitsplatz: Zehnerblock

1. Eigene Schaltflächen starten leere Waren-, Digital- oder Dienstleistungsentwürfe. Vorhandene ungespeicherte Texte werden nur nach der bestehenden Verwerfbestätigung ersetzt. Keine erfundenen Eigenschaften oder Preise.
2. Lokale Suche umfasst auch Beschreibung, EAN/GTIN, Versand und Bereitstellung. Suchwörter werden unabhängig von Akzenten und Reihenfolge gefunden.
3. Bestandsfilter unterscheiden Waren mit und ohne Bestand; Dienstleistungen werden nicht als Waren ohne Bestand gezählt.
4. Zusätzlich lassen sich Entwürfe nach absteigendem Nettopreis sortieren. Die gespeicherten Listen werden dabei nicht umgeschrieben.
5. Eine aufklappbare Bearbeitungsübersicht zeigt ausgefüllte und offene Punkte passend zur Angebotsart. Eine noch ungeprüfte Steuerangabe bleibt offen; Vollständigkeit ersetzt keine fachliche Prüfung.
6. Zeichenzähler an Titel, Beschreibung, Artikelnummer, EAN, Versand und Bereitstellung machen Feldgrenzen sichtbar und sind mit den Eingabefeldern verknüpft.
7. Einzelexport sichert die validierten aktuellen Formularangaben im bestehenden Importformat. Nicht gespeicherte Änderungen werden nicht heimlich gespeichert oder als erledigt markiert; Import legt nach Bestätigung lokale Kopien an.
8. Expliziter Entwurfsdruck erzeugt eine Vorschau des aktuellen Formulars und blendet im Druck andere Seitenbereiche aus. Der Ausdruck ist ausdrücklich keine Rechnung und kein Kaufbeleg. Warnung vor Verlassen umfasst jetzt auch laufende Kontoaktionen.
9. Kontoübersicht zeigt gespeicherte Netto-/Bruttowerte, Angebotsart, Bestand, Artikelnummer und aufklappbare Kennung. Versionsstände sind datiert (Europe/Berlin) und ausblendbar; Laden bleibt ausdrücklich. Ungültige Datumswerte werden vom Client verworfen.
10. Anbieterhilfe erklärt Entwurfsarten, Speicherorte, Einzelexport, Import und Druck. Die überholte Aussage, dass Registrierung noch nicht verfügbar sei, wurde korrigiert.

Verifikation: gezielte Pure-/DOM-Tests prüfen Filter, Varianten, Verwerfbestätigung, offene Steuerprüfung, ausdrücklichen Export/Druck, nicht persistierte Entwürfe und private Kontometadaten. Die tatsächliche Anwendung wird zusätzlich mit isoliertem PostgreSQL und Chromium einschließlich Download-Inhalt und Druck-CSS geprüft. Keine Schlüsselkonfiguration, Anbieteraufrufe, Veröffentlichung oder Zahlungsänderungen.
