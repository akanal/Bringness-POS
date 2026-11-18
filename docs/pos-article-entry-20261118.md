# Zentrale Artikeleingabe

Auftrag18.11.2026: Foto direkt bei der Artikeleingabe anbieten; Getränkepfand, Allergene & Zusatzstoffe und Verfügbarkeit kompakt dort bündeln. Übersetzungsbedienung aus diesem Bereich entfernen. Keine neue Position für Übersetzungen festlegen und keine vorhandenen Übersetzungen löschen.

## Bedienung und Umfang

- Mehr → Artikel zeigt eine Auswahl „Neuen Artikel anlegen“ bzw. vorhandener Artikel. Die Fotoauswahl für neue Artikel steht direkt nach dem Artikelnamen. Die bestehenden zusätzlichen Stammdaten und Kategorie bleiben verfügbar.
- Pfand, Allergene & Zusatzstoffe und Verfügbarkeit stehen in drei aufklappbaren Bereichen. Auswahl vor dem Anlegen möglich. Katalogeinträge werden als Text gerendert. Uhrzeiten im24-Stunden-Format, Auswertung wie bisher nach Berliner Zeit. Bestehende Pfandeinheiten bleiben erhalten.
- Bestehende Kachel: ein Menüpunkt „Artikelangaben“ führt in denselben Bereich. Die Stammdaten sind dort lesbar/gesperrt; dieses Paket ist kein neuer allgemeiner Preis-/Namenseditor. Foto bearbeiten/entfernen/neu laden erfolgt inline mit ausdrücklichem „Foto speichern“. Zusatzangaben werden über „Artikelangaben speichern“ übernommen.
- Keine einzelnen Foto-/Pfand-/Allergen-/Verfügbarkeits-/Übersetzungsmenüpunkte mehr an Online-Kacheln. Der bisherige Download-/Desktop-Einstieg und dessen Menü bleiben wegen des Entwicklungsstopps unverändert. Das neue Online-Modul und seine Styles aktivieren sich dort nicht.

## Speicherung und Grenzen

Vorhandene Produkt-, Label-, Pfand-, Verfügbarkeits-/Sprachspeicher- und Bild-APIs unverändert verwenden. Kein neues Backend oder Datenmodell. Ausgeblendete Übersetzungsbedienung bedeutet keine Löschung der gespeicherten Sprachen; Beschreibung/Zutaten und Verfügbarkeit verwenden weiterhin ihren bestehenden Speicherpfad.

Die vorhandenen APIs bilden keine gemeinsame Transaktion: Nach erfolgreicher Artikelanlage werden nur veränderte Zusatzangaben separat gespeichert. Bei Teilfehlern bleibt die bekannte Artikel-ID samt verbleibenden Schritten erhalten; „Speicherung fortsetzen“ legt keinen zweiten Artikel an. Bis zur Klärung werden betroffene Eingaben gesperrt. Bei unklarem Ausgang der ersten Artikelanlage keine automatische Wiederholung, sondern sichtbarer Hinweis zum Neuladen/Prüfen der Artikelliste. Diese neue Eingabe ist keine allgemeine Offline-Warteschlange; unvollständige lokale Details überleben keinen Seitenreload. Unveränderte vorhandene Zusatzangaben werden nicht erneut geschrieben, insbesondere keine unnötige Pfandänderung bei aktivem Offline-Katalog.

Die Bildgrenzen/Versionsprüfung aus docs/pos-article-photos-20261118.md bleiben erhalten. Für unerreichbare alte Bilder ist das Original zum erneuten Hochladen nötig. Keine echten Kundenartikel, Fotos, Belege, Umsätze oder Nachrichten für Tests erzeugen. AI, Windows/Offline, Anbieter und Preise bleiben außerhalb des Auftrags.

## Prüfung

`article-entry-ui.mjs`: direkte Fotoposition, sichere Katalogtexte, Neuanlage mit Foto/Pfand/Labels/Verfügbarkeit, Fortsetzung nach verlorener Zusatzantwort ohne doppelte Anlage, vorhandenes Bild inline, unveränderte Angaben ohne Schreiben, Sperre bei unklarem Anlagestatus/abweichender Sitzung, Download-Guard. Bestehende Foto- und POS-Anmeldungs-/Navigationsprüfungen bleiben grün. Vollständiger nativer Kamera-Fotoablauf verwendet den neuen zentralen Einstieg bei390/1280px; Layout-/CI-/Live-Ergebnisse erst nach tatsächlicher Prüfung ergänzen.

## Verifiziertes Ergebnis18.11.2026

- Funktions-PR348, getesteter Kopf cd786e6548e4b721a32eb29463a6f33d69504020; Merge f04bd22af0dd63a291aa95e45a8724f6cb011c1e. Alle sechs zugehörigen Prüfungen erfolgreich: Center44347053173 (Chromium/WebKit, Kamera-Fotoablauf bei390/1280px), Integration44347053109, Farbe/Navigation44347053096, isolierte Vorschau44347053035, Release44347053111 und Bringness checks44347053301. Lokale Artikel-, Foto- und Anmeldungs-/Navigationsprüfungen bestanden.
- Netcup44347776114/Job134954781402 erfolgreich. Exakter Servernachweis `pos deployed: f04bd22af0dd63a291aa95e45a8724f6cb011c1e`; vorheriger Container und Datenbankbackup erhalten.
- Live: article-entry.js/.css, product-photos.js und app.js200 und bytegenau mit dem freigegebenen Quellstand identisch; HTML lädt neuen Einstieg und Version, Health200 mit status/database ok.
- Angemeldete bestehende Eigentümersitzung rein lesend geprüft: an der Kachel nur „Artikelangaben“; bestehender Artikel lädt Foto inline sowie zusätzliche Angaben. Auswahl „Neuen Artikel anlegen“ zeigt Foto unmittelbar nach dem Namen, drei kompakte aufklappbare Zusatzbereiche und keinen Übersetzungszugang. Keine Fotos, Artikel oder Zusatzangaben in Produktion gespeichert.
