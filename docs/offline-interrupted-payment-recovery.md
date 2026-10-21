# Unterbrochener Offline-Barverkauf und Katalogwechsel

Entwicklungsstand, keine Live- oder Geräteabnahme.

Ein bereits lokal vorgemerkter Bezahlvorgang behält seine Verkaufskennung und seinen ursprünglichen Katalog. Die native Nur-Lese-Abfrage darf diesen archivierten Katalog nur dann zur Wiederherstellung liefern, wenn aktueller Betrieb und Gerätekennung übereinstimmen. Ein Hintergrundabgleich kann inzwischen einen frischen Katalog gespeichert haben; das verhindert die Wiederherstellung nicht mehr. Fehlende oder fremde Kataloge bleiben gesperrt.

Überlappende Anzeigeabfragen dürfen keine ältere Antwort über eine neuere schreiben. Ändert sich während einer Abfrage der vorgemerkte Bezahlvorgang, wird die Anzeige mit der passenden Auswahl erneut geladen. Nach erfolgreichem Abschluss verwendet die leere Kasse wieder den aktuellen Katalog.

Die vorhandene Ledger-Idempotenz bleibt maßgeblich: Ein bereits gespeicherter Verkauf wird mit unveränderten Daten zurückgegeben. Neue Verkäufe aus einem abgelaufenen Katalog bleiben verboten. Es gibt keine erneute Zahlung, Preisneuberechnung, Verlängerung der Offline-Lizenz oder Änderung historischer Belege. Offline-Zeitstempel werden ausdrücklich mit h23 angezeigt.

Spätere Abnahme unter T12: Antwort nach lokalem Commit verlieren, Katalog aktualisieren, App neu starten, ursprünglichen Verkauf erneut bestätigen. Genau ein Verkauf mit ursprünglichen Preisen; danach frischer Katalog. Zusätzlich abgelaufenen ursprünglichen Katalog, nicht gespeicherten Vorgang, fremden Betrieb/Gerät und verspätete Anzeigeantwort prüfen. Syntax-/Patchprüfung jetzt; Funktions- und Gerätetests auf Inhaberwunsch später.

Mandantentrennung beim Gerätewechsel zwischen Firmen: Verkaufsverlauf, Zähler und Abgleichsexport werden auf die aktuelle Firma und Gerätekennung begrenzt. Auch der direkte Wiederholungsaufruf einer bereits gespeicherten Verkaufs-ID prüft diesen Kontext. Frühere Belege bleiben dauerhaft gespeichert; nach legitimem Wechsel zurück zur passenden Firma sind sie wieder zugänglich. Die ausstehende Übertragungswarteschlange bleibt global erhalten und verhindert weiterhin einen Firmenwechsel mit offenen Verkäufen.

Wiederverbindung kurz vor Ablauf: Nach erfolgreicher Katalogspeicherung verfolgt der Synchronisierer dessen tatsächliches Ablaufdatum. Innerhalb der letzten fünf Minuten fragt er bei bestehender Anmeldung spätestens nach einer Minute erneut den Server, statt bis zum üblichen Sechs-Stunden-Intervall zu warten. Nur eine gültige Serverantwort verlängert die Freigabe; Offline-Ablauf, Geräteentzug und fehlende Lizenz werden nicht umgangen. Beim tatsächlichen Wechsel der Katalog-Firma oder Gerätekennung entfernt die Oberfläche den alten Warenkorb und den ausgewählten Druckbeleg; die gespeicherten Verkäufe bleiben erhalten.
