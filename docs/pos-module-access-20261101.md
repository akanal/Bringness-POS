# POS: Modulstatus und Displayzugang

## Anlass und Änderungen

Der Eigentümer findet die Displaysteuerung nicht; der doppelte Benutzermenü-Link „Lizenz & Abo“ sprang zur Kasse zurück. Bereits enthaltene/gebuchte Module waren optisch kaum von neuen Angeboten zu unterscheiden.

- PR201 hat den doppelten Benutzermenü-Link bereits entfernt. Einstellungen > Module & Abos > Module verwalten bleibt der Einstieg; diese Änderung wird übernommen.
- Einstellungen enthält jetzt eine Karte Displaysteuerung. Bei bestehender Freigabe öffnet sie den vorhandenen Editor; andernfalls führt sie zur Modulübersicht. Der zuvor fehlende Modul-Dispatch `displays` ist ergänzt. Verwaltungsfreigabe und serverseitige Zugriffsprüfung bleiben erhalten.
- Meine Module enthält aktive oder im Tarif enthaltene Angebote genau einmal. Grüne Kennzeichnung und Text „Bereits gebucht“ bzw. „Bereits enthalten“ zeigen den Status unabhängig von der Farbe. Es gibt dort keine erneute Buchungsaktion. Bei der Displaysteuerung öffnet ein eigener Button den Editor.
- Neue Angebote zeigen „Nicht gebucht“ und „Jetzt buchen“. Bei fehlenden Voraussetzungen bleibt die Aktion deaktiviert und der Grund wird erklärt. Gekündigte, noch bezahlte Zeiträume bleiben als bestehender Zugang sichtbar.
- Nach Verwaltungsfreigabe und unmittelbar vor der Buchungsmail wird der aktuelle Status erneut geladen. Bereits aktivierte/enthaltene Module, geänderte Voraussetzungen oder Preise lösen keine neue Mail-/Checkout-Anfrage aus. Die vorhandenen serverseitigen Sperren für aktive und laufende Buchungen bleiben erhalten. Zusätzlich verhindert die unter Firmensperre geprüfte Legacy-Restaurantfreigabe die erneute Buchung bereits enthaltener Tische-/Personal-/Küchen-/Center-/Displaymodule vor Verbrauch der Zahlungsbestätigung. Nachfrist bleibt geschützt; abgelaufener Zugang und andere Firmen werden getrennt behandelt.

## Prüfungen

686 allgemeine Tests ohne Fehler/Skips. Bestehende Modulfreigabe-UI-, EAN-Lizenzübersicht-, Displaypersistenz- und Checkout-Guard-Skripte lokal bestanden. Neue Regression prüft Statusgruppen, enthaltene Module, gekündigten bezahlten Zeitraum, Voraussetzungen, veralteten Tab sowie den echten Settings-/Display-Dispatch einschließlich Verwaltungsfreigabe. Browserabnahme in Chromium und WebKit bei390/1280px mit vorhandenen POS-Styles und tatsächlichem Display-Editor ist Bestandteil der Center-CI. Screenshots enthalten ausschließlich synthetische Daten.

PR202 enthält einen parallelen älteren Teilansatz für Statusfarben/Buchungstexte und Display-Button. Der zusammenhängende Folgestand PR203 umfasst diese Ziele sowie fehlenden Editor-Dispatch, Settings-Einstieg, Status-Nachprüfung und native Browserabnahme. PR202 nicht anschließend zusätzlich zusammenführen und damit Änderungen überschreiben.

## Praktischer Test nach Veröffentlichung

1. Kasse neu laden und anmelden. Benutzermenü > Einstellungen mit bestehender Verwaltungsfreigabe öffnen.
2. Displaysteuerung > Displaysteuerung öffnen. Bei fehlender Modulfreigabe stattdessen Displaymodul ansehen; keine Freigabe erfinden.
3. Vorhandenen Bildschirm wählen oder einen eigenen Testbildschirm anlegen; Bild/Inhalt wählen und Vorschau prüfen. Für echten Player die vorhandene Funktion Anzeige starten und zur Kasse verwenden.
4. Unter Einstellungen > Module & Abos > Module verwalten zwischen Meine Module und verfügbaren Angeboten unterscheiden. Aktive/enthaltene Module dürfen keinen Buchungsknopf besitzen.
5. Eine neue kostenpflichtige Buchung nur bewusst durchführen. Kein Testkauf allein zur Prüfung dieser Oberflächenkorrektur erforderlich.

Keine Preise, Verträge, Berechtigungen oder Provider-Konfiguration geändert; keine echte Buchung, Mail an Mitarbeiter, Zahlung oder Display-/Medienmutation in Produktion ausgeführt. Private Kontostatus wurden nicht aus öffentlichen Seiten abgeleitet.

## Verifizierter Freigabestand

Feature `0b9344265999eaabe351e7949322813faa990b34` bestand alle sechs Pflichtworkflows: checks41300969970, release41300969971, isolated41300969982, Farb-/Navigation41300969997, Center41300969953 und POS/AI41300970014. Center-Browserjobs124831608953/124831608781 bestätigen jeweils fünf POS-Browsertests ohne Fehler/Skips einschließlich neuem Modul-/Displayablauf. Die Vorschauen13081311297/13081083130 wurden bei390/1280px erzeugt; Chromium-Vorschauen mit vollständigen POS-Styles visuell geprüft.

POS/AI job124831609042 bestätigt neue Modul-UI, bestehende Displaypersistenz und acht gleichzeitige echte PostgreSQL-Anfragen mit genau einer Checkout-Reservierung. Legacy-Inklusivmodule sind im selben Datenbanklauf vor Genehmigungsverbrauch geschützt. Lokale finale Basissuite686 ohne Fehler/Skips bestanden.

Authentifiziertes Vorab-Backup41300675069/job124830738699 erfolgreich: Database backups validated. PR203 ist als `965b74832cc5e71d4b2fb8af510994c234574d93` gemergt. Der ältere Teilansatz PR202 wurde mit Verweis auf PR203 geschlossen; Branch bleibt als Referenz erhalten.

Netcup41301245082/job124832418584 bestätigt exakt `965b74832cc5e71d4b2fb8af510994c234574d93` bereitgestellt; vorheriger Container und Datenbanksicherung erhalten. Frische Live-Prüfung: /pos/ HTTP200 ohne doppelten Benutzermenü-Lizenzlink; /pos/app.js und /pos/licensing.css?v=module-status-20261101 HTTP200 und bytegleich mit geprüftem Quellstand. Die private Inhabersitzung wurde nicht verwendet; Modul-/Editorfunktionen sind mit isolierten Browser-/Datenbankfixtures geprüft. Physischer Bildschirm-/Player-Test erfolgt anschließend beim Eigentümer.
