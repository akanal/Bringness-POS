# Artikelfotos in der Online-POS

Eigentümerauftrag18.11.2026: Problem mit Artikelfotos prüfen und bei Bedarf ergänzen. Die normale Artikelanlage hatte nur ein Textfeld für Bild/Emoji. Der vorhandene freigabegeschützte Adminupload lehnte übliche Handydateien oberhalb150KB direkt ab. Ohne eine konkrete betroffene Eigentümerdatei lässt sich nicht behaupten, damit jede mögliche gerätespezifische Ursache reproduziert zu haben.

Live-Leseprüfung: Ein vorhandenes Foto verwies auf `/api/v1/product-images/:id`; dieser bisher gespeicherte Pfad antwortete404 und besitzt im aktuellen Repository keinen Auslieferungshandler. Das Original wurde nicht ersetzt oder erfunden. Die neue Bearbeitung erklärt unerreichbare/beschädigte gespeicherte Fotos und ermöglicht das ausdrückliche erneute Hochladen des Originals.

## Bedienung

- **Mehr → Artikel:** Foto auswählen, lokale Vorschau prüfen und den Artikel wie gewohnt anlegen. Ohne Foto bleibt das vorhandene Emoji-/Bildlinkfeld verfügbar. Bilddaten werden nicht in dieses sichtbare Textfeld geschrieben. „Fotoauswahl entfernen“ verwirft nur die lokale Auswahl.
- **Vorhandener Artikel:** Dreipunktmenü an der Artikelkachel → **Artikelfoto**. Foto auswählen, Vorschau prüfen, **Foto speichern**. **Foto entfernen** verändert zunächst nur die Vorschau; erst Speichern entfernt das gespeicherte Bild. Ohne Foto erscheint wieder das Standardsymbol.
- Unterstützt: JPEG, PNG und WebP, Original bis8MiB und40Megapixel. Lokal im Browser proportional auf höchstens1200Pixel Kantenlänge und unter190.000Data-URI-Zeichen verkleinert, bevor es übertragen wird. Bei Bedarf werden Qualität/Auflösung weiter reduziert. PNG-Transparenz bleibt durch PNG-Ausgabe erhalten. Kein Zuschneiden und kein externer Bild-/KI-Dienst. HEIC muss vorher als JPEG exportiert werden; keine neue HEIC-Konvertierung versprochen.
- Fehlerhafte oder nicht unterstützte Dateien werden mit einer Meldung abgewiesen. Ein gespeichertes vorhandenes Foto wird dadurch nicht entfernt. Die Fotoansicht zeigt den vollständigen Bildausschnitt; bei defekter Bildadresse an einer Kachel erscheint das Standardsymbol anstelle langer Bilddaten.
- Freigabegeschützte Kassen-ID-Verwaltung: derselbe lokale Verkleinerungshelfer für Artikelfotos, Vorschau des gespeicherten Bildes und ausdrückliche Entfernungswahl. Betriebslogo-Grenze bleibt150KB. Die vorhandenen Kundenfreigaben und Adminrechte bleiben maßgeblich.

## Backend und Datengrenzen

`GET/PUT /api/v1/products/:id/image` verwendet bestehendes `products.image_url`, keine zusätzliche Medienplattform oder Migration. Eigene aktuelle Inhaber-/Admin-Sitzung, aktives Konto ohne erzwungenen Passwortwechsel und exakter Betrieb/Artikel nötig. Benutzer/Sitzung sowie Produkt/Betrieb werden in derselben Transaktion gesperrt. PUT verändert ausschließlich das Bild und ein datensparsames Änderungsprotokoll; keine Preise, Pfandwerte, Varianten, Lager-, Zahlungs- oder Belegänderungen.

Vor Änderung den vorhandenen Bildstand als SHA256 lesen. Hat ein anderer Bediener das Bild inzwischen verändert,409 mit Neuladehinweis statt Überschreiben. Eine unveränderte Wiederholung nach Antwortverlust ist erfolgreich, wenn das gewünschte Bild bereits gespeichert ist, ohne erneuten Audit-Eintrag. Fremde URL-/SVG-Payloads und übergroße/formatwidrige neue Bilder werden abgewiesen. Bereits vorhandene Bildlinks/Emojis bleiben lesbar; neu hochgeladene Bilder verwenden begrenzte PNG/JPEG/WebP-Daten. Auch der vorhandene Artikelanlagepfad prüft neue Data-URI-Bilder über denselben bestehenden Bildvalidator.

Bei unklarem Speicherstatus bleibt exakt dieselbe Speicheranfrage zum erneuten Prüfen erhalten. Neue Dateiwahl ist bis zur Klärung gesperrt; alternativ gespeicherten Stand ausdrücklich neu laden. Konto-/Betriebs-/Seitenwechsel verwerfen verspätete lokale Vorschau-/Lade-/Speicherantworten. Das ist keine neue allgemeine Offline-Synchronisierung.

## Prüfung und Umfang

- `product-photos.mjs`: echte SQL-Aufrufe für Speichern/Lesen/Entfernen, Rechte und Fremdbetrieb, aktuelle Kontosperre/Passwort-/Sitzungsgrenzen, Format/Größe, Konflikte und unveränderte Wiederholung; Originalpreis/Steuersatz/Name bleiben gleich. PostgreSQL-Variante prüft konkurrierende Änderungen und eine gleichzeitig bestätigte Kontosperre.
- `product-photos-ui.mjs`: echte Clientskripte, lokale Vorschau ohne API-Schreiben, keine Bilddaten im Textfeld, ausdrückliches Speichern/Entfernen, identische Wiederholung nach verlorener Antwort, verspätetes Laden/Verarbeiten/Speichern nach Betriebswechsel, sichere Darstellung von Artikelnamen und gesperrter Desktop-/Download-Einstieg.
- Nativer POS-Fall in `pos-payment-browser.test.js`: tatsächlich großes JPEG verarbeiten, angezeigte/gespeicherte Bildgröße, Änderung trotz verlorener Bestätigung, Reload, fehlerhafte Datei, Entfernen und neuer Artikel mit Foto bei390/1280px in Chromium/WebKit. Bestehender Warenkorb bleibt während der Bildänderung unverändert.

Keine produktiven Artikel, Fotos, Kundenfreigaben oder Umsätze zur Abnahme anlegen. Windows-/Offline-Dateien, AI, Zahlungen, private Beratung und übrige Gestaltung bleiben außerhalb des Blocks. Tatsächliche CI-/Deployment-/Live-Ergebnisse separat nach Abschluss dokumentieren.

## Bestätigter Abschluss am 18.11.2026

- Funktions-PR346: https://github.com/akanal/Bringness-POS/pull/346; getesteter Kopf6035a3432684dac9e1da31dfe00abc88f5fb7a85, Merge aa497579f53ad5631e1ca775f449cbc586de0e75. Alle sieben zugehörigen PR-Prüfungen erfolgreich, einschließlich Center44299122669, POS-Integration44299122520 und Shop44299122588. Native Chromium-/WebKit-Fotoabläufe bei390/1280px bestanden; echte Kameradatei, unveränderter Warenkorb, identische Wiederholung, Reload, Entfernen, beschädigte Datei und Neuanlage geprüft. PostgreSQL16 bestätigt konkurrierende Änderung und aktuelle Kontosperre. Allgemeine lokale Tests:740 bestanden.
- Netcup operations44300079650, Job134787213660 erfolgreich. Serverlog bestätigt exakt `pos deployed: aa497579f53ad5631e1ca775f449cbc586de0e75` sowie erhaltenen vorherigen Container und Datenbankbackup. Kein neuer Anbieter/keine neue Verbindung, keine produktiven Testschreibvorgänge.
- Live am selben Tag: gemeinsam genutzter Bildhelfer, POS-Fotomodule/Styles, Hauptskript und Admin-Fotowerkzeuge/Styles antworten200 und stimmen bytegenau mit dem freigegebenen Quellstand überein. POS-HTML lädt neue Fotomodule; Health meldet status/database ok; Bild-API ohne Anmeldung401 mit no-store.
- Angemeldete vorhandene Eigentümersitzung: Artikelmenü und reine Leseansicht der Fotobearbeitung erfolgreich. Der vorhandene defekte Altpfad wird verständlich als nicht erreichbar/beschädigt erklärt; Dateiauswahl ist verfügbar, Speichern ohne neue Auswahl deaktiviert. Kein Original erfunden, ersetzt oder gelöscht. Für dieses Altbild ist die Originaldatei zum erneuten Hochladen erforderlich.
- Windows/Offline und AI bleiben gesperrt beziehungsweise außerhalb dieses abgeschlossenen Fotoblocks. Praktische Geräteabnahme mit Originalfotos bleibt beim Eigentümer; die technische Abnahme oben ist abgeschlossen.
