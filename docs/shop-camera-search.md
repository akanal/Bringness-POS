# Kompakte Foto-/Code-Suche

Der kleine Kameraknopf neben der Suche öffnet Fotoaufnahme, Bildauswahl und manuelle Codeeingabe. Fotoaufnahme verwendet das native Dateifeld mit capture=environment; Mobilbetriebssystem und Browser entscheiden über die verfügbare Kameraoberfläche. Keine automatische Kameraaktivierung, kein Videostream, keine Mikrofonberechtigung.

JPEG/PNG/WebP bis 8 MB, maximal 32 Millionen dekodierte Pixel. Die lokale Prüfkopie ist höchstens 1600 Pixel groß. Unterstützte native BarcodeDetector-Formate: QR, EAN-8/13, UPC-A und ITF. Die tatsächliche Erkennung hängt vom Browser ab; ohne Unterstützung bleiben Vorschau und manuelle Codeprüfung verfügbar. Keine zusätzliche Bibliothek/CDN/Server-KI. KI-Produkterkennung aus Fotos bleibt ausdrücklich inaktiv, wie vom Eigentümer gewünscht.

Bilder, Canvas und erkannte Inhalte bleiben im aktuellen Browser und werden weder hochgeladen noch in WebStorage/Konto geschrieben. Schließen, Entfernen, Hintergrundwechsel und pagehide geben Vorschau/Objekt-URL frei. Zeitgrenzen und Generationen verhindern verspätetes Wiederanzeigen. Fehlertexte enthalten keine Rohdaten oder Dateinamen.

Codes werden nur gegen den öffentlichen Katalog geprüft, unabhängig von dessen aktuell gewählten Filtern. EAN/GTIN-Prüfziffern und führende Nullen werden beachtet. Bekannte Produkt-ID/SKU und eigene Produktlinks sind zulässig; fremde Links, Auth-/Admin-Pfade und unbekannte URL-Parameter werden nicht geöffnet oder als Suchanfrage weitergegeben. Treffer öffnen erst nach bewusstem Klick das Produkt; nie Warenkorb, Konto oder Zahlung.

Der derzeitige öffentliche Katalog enthält drei Bringness-Anwendungen ohne EAN-Zuordnung. Reale Warencodes liefern deshalb ehrlich „kein zugeordneter Artikel“. Neue Katalogeinträge können über gtin/sku zugeordnet werden; private Anbieterentwürfe werden nicht durchsucht und keine Zuordnungen erfunden.

Prüfung: Checksummen-/Link-Policy, native Formatwahl, Dateigrenzen, lokale Vorschau und Freigabe, Abbruch/Spätantworten, fehlende Browserunterstützung, explizite Trefferauswahl. Native Entrypoint-Prüfung lädt ein lokales QR-PNG, prüft echte Erkennung, falls die Plattform QR unterstützt, sonst den manuellen Pfad; Vorschau/Schließen und Layout bei 1280/390. Ein physisches Handy/Kamera wurde durch diese automatischen Tests nicht ersetzt.
