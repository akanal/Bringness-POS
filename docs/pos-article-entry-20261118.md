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
