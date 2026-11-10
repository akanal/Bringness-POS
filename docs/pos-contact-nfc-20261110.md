# POS-Kontaktkarte und Kopfzeile – 10. November 2026

Eigentümer meldet grüne Kopfzeile am gedruckten QR-Ziel und verlangt einen festen Speicherort sowie NFC-Schreibanleitung. Vor Änderung live überprüft: Der QR öffnet /vorfuehrung/ auf bringness-pos.de ohne Weiterleitung; das eigene CSS färbt header grün.

Begrenzt auf POS-Vorführung: Kopf #071827, Textmarke orange, Cacheversion angepasst. Eigenständige selbstenthaltende Kontaktkarte unter https://bringness-pos.de/vorfuehrung/kontakt.html mit vom Eigentümer für die Karten angegebenen öffentlichen Geschäftsdaten. Telefon als tel-Link, Mail als mailto-Link; vCard und Kontakt-QR enthalten dieselben Daten; Logo und QR eingebettet. Keine neue Registrierung, Tracker, API, Schreibberechtigung oder fremde Kontaktplattform. Speicherung/öffentliche Auslieferung über bestehenden Netcup-App-Webroot. Kein IDrive-Upload behaupten und private Bucket-Freigabe nicht ändern.

NFC: Nur die feste HTTPS-Adresse als NDEF-URI schreiben, nicht die lokale HTML-Datei. Spätere Inhaltsänderungen lassen den Tag-Link bestehen. Physischer Schreib-/Lesetest nur mit realem Tag und Telefon möglich.

Markt, AI, Kassenfunktionen, Preise, Zahlungen und Archivberechtigungen unverändert. CI und Live-Abnahme separat belegen.
