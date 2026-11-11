# POS-Kontaktkarte und Kopfzeile – 10. November 2026

Eigentümer meldet grüne Kopfzeile am gedruckten QR-Ziel und verlangt einen festen Speicherort sowie NFC-Schreibanleitung. Vor Änderung live überprüft: Der QR öffnet /vorfuehrung/ auf bringness-pos.de ohne Weiterleitung; das eigene CSS färbt header grün.

Begrenzt auf POS-Vorführung: Kopf #071827, Textmarke orange, Cacheversion angepasst. Eigenständige selbstenthaltende Kontaktkarte unter https://bringness-pos.de/vorfuehrung/kontakt.html mit vom Eigentümer für die Karten angegebenen öffentlichen Geschäftsdaten. Telefon als tel-Link, Mail als mailto-Link; vCard und Kontakt-QR enthalten dieselben Daten; Logo und QR eingebettet. Keine neue Registrierung, Tracker, API, Schreibberechtigung oder fremde Kontaktplattform. Speicherung/öffentliche Auslieferung über bestehenden Netcup-App-Webroot. Kein IDrive-Upload behaupten und private Bucket-Freigabe nicht ändern.

NFC: Nur die feste HTTPS-Adresse als NDEF-URI schreiben, nicht die lokale HTML-Datei. Spätere Inhaltsänderungen lassen den Tag-Link bestehen. Physischer Schreib-/Lesetest nur mit realem Tag und Telefon möglich.

Markt, AI, Kassenfunktionen, Preise, Zahlungen und Archivberechtigungen unverändert. CI und Live-Abnahme separat belegen.

## Veröffentlichung und nachgeholte Browserabnahme
PR286 wurde als7030eed41fe68b451e2b87a23679d137d1671956 veröffentlicht. Netcup42818116330/job129836329592 erfolgreich; vorheriger Container und Datenbanksicherung behalten. Live /vorfuehrung/ mit neuer CSS-Version sowie CSS und /vorfuehrung/kontakt.html bytegleich geprüft; Gesundheitsstatusok. Gedruckter QR bleibt unverändert gültig.

Am11.11. wurde der zuvor während der Testumgebungsinstallation abgebrochene Main-WebKit-Lauf erfolgreich nachgeholt: Center42818116275/job130453925452 besteht109 Berechtigungsprüfungen,1 PostgreSQL-Lebenszyklusprüfung,21 native Center-Fälle und15 native POS-Fälle einschließlich Kontakt-vCard und dunklem Kopf bei390/1280. Main-Chromium besteht ebenfalls. Keine Testumgehung und keine neue Anwendungs-/Infrastrukturänderung. Das heutige öffentliche IDrive-Statussignal configured:true/available:true betrifft ausschließlich den bestehenden privaten Dokumentenspeicher; keine öffentliche Kartenablage bei IDrive behaupten.
