# Händler: Rechnungsnummer, Auswahl und Adressbuch

Ausgangsbasis: Kassen-/Rechnungsbranch a5cca49 (PR #91), einschließlich Kundenbasis PR #90. Aktuell live ist erst 062694a mit dem Händlerschalter. Dieses Paket ist nicht veröffentlicht.

| Punkt | Ursache | Korrektur | Ergebnis |
|---|---|---|---|
| Händlernummer läuft mit Bonnummer | Checkout verwendet dieselbe PostgreSQL-Sequenz | Eigener Nummernkreis HR-Jahr-000001; normale Bons bleiben BN | bestanden: erste HR verbraucht keine BN, erster normaler Bon BN-…-000001, nächste HR …000002 |
| Artikel nicht auswählbar | Ohne Händlerstaffel war Hinzufügen deaktiviert | Anklickbare Aktion Preis festlegen öffnet passende Preisverwaltung; nach PIN-Speicherung Artikel verkaufbar | bestanden mit leerem Katalog an Händlerpreisen und tatsächlichem UI-Skript |
| Händleradressen fehlen live | Kundenfunktion ist gespeichert, aber noch nicht veröffentlicht | Vorhandenes dauerhaftes Kundenadressbuch in Händleransicht eingebunden; kompakt unter Kundenadressen & Lieferscheine aufklappbar | Speichern, Übernehmen und erneute Auswahl nach Neuladen bestanden |
| Alte Belege / Zahlungswiederholung | Nummern müssen unverändert bleiben | Keine Umnummerierung; persistierte Checkout-Antwort gewinnt vor neuer Nummernvergabe | bestanden |

Prüfung: 515 Unit-Tests; echter HTTP-Ablauf Kunde/Lieferschein/Händlerrechnung/Normalverkauf/Kassenabschluss; Händler-UI mit Preisneuanlage und Adressspeicherung/-wiederverwendung; Kunden-/Lieferschein-UI. Keine echte Zahlung und keine produktive Datenänderung.

Die getrennte Händlersequenz ist global wie die bisherige Bonsequenz, mit eigenem HR-Präfix. Sie läuft über Jahreswechsel weiter; Rollbacks können Sequenzlücken hinterlassen. Keine Aussage über gesetzliche Zertifizierung oder eine fiskalische Freigabe. Historische BN-Händlerbelege bleiben unverändert.

Die Ursache der konkret vom Inhaber gesehenen Oberfläche wurde nicht in seiner angemeldeten Livesitzung reproduziert. Der nachweisbare Fall fehlender Händlerpreise ist korrigiert und getestet. Andere Ursachen lassen sich daraus nicht ausschließen. Nach Freigabe müssen zunächst die abhängigen Kunden-/Kassen-/Rechnungsänderungen und diese Korrektur gemeinsam veröffentlicht und anschließend im Inhaberkonto kontrolliert werden.
