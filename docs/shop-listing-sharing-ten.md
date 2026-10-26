# Anzeigennummern und dezentes Teilen

Vom Eigentümer am 26.10.2026 beauftragt: Anzeigen per fester Nummer im Suchfeld oder direktem Link weitergeben. Kleines, zurückhaltendes Teilen-Symbol; vorhandene und neue Angebote berücksichtigen. Keine KI-Anbindung.

Die zehn zusammenhängenden Änderungen:

1. Stabile öffentliche Anzeigenreferenzen: POS Online 100001, Windows 100002, AI 100003. Eigene Identität, unabhängig von SKU und EAN; fehlende/doppelte Referenzen werden abgewiesen. Reservierter manueller Bereich für integrierte Bringness-Angebote: 100000–999999.
2. Vorhandene gespeicherte Händlerentwürfe erhalten bei der Migration einmalig eine globale Datenbanknummer ab 1000001. Neue Kontoentwürfe erhalten automatisch eine neue Nummer. Ein lokaler, noch nicht gespeicherter Entwurf hat noch keine globale Nummer.
3. Eindeutiger Identity-Index und Schutz vor Nummernänderungen. Bearbeiten, Archivieren, Wiederherstellen, historische Ansichten und verlorene-Antwort-Wiederholungen behalten dieselbe Nummer. Lücken in der Nummernfolge sind möglich, Nummern sind keine Bestell-/Rechnungsnummern.
4. Exakte öffentliche Nummernsuche (auch „Anzeige 100001“). Nummernsuche ignoriert Kategorie-/Preisfilter, um ein bekanntes Angebot sicher wiederzufinden; normale Wortsuche behält ihre Filter. Nicht öffentliche Nummern liefern keinen öffentlichen Treffer.
5. Kleine lesbare Nummer am Suchergebnis und in den Details. Händlerkonto und Editor zeigen die eigene Nummer; die vorhandene Kontosuche berücksichtigt sie innerhalb des berechtigten Betriebskontos.
6. Graugrünes Teilen-Symbol mit 16px Zeichnung und 32px Bedienfläche, ohne farbigen Hauptbutton; Tastaturfokus und eindeutige zugängliche Beschriftung. Produktkarte und Detailansicht unterstützen denselben Einstieg.
7. Native Teilen-Auswahl mit Produktname, Anzeigennummer und direktem öffentlichen Link. Die Anwendung meldet nur die Übergabe an die Teilen-Funktion, niemals eine bestätigte Zustellung an einen Freund. Abbruch kopiert nichts.
8. Ohne native Teilen-Funktion: Link in die Zwischenablage kopieren. Bei fehlender/abgelehnter Zwischenablage bzw. fehlgeschlagener Teilen-Funktion: schreibgeschützter, ausgewählter Link zum manuellen Kopieren. Keine externen Weiterleitungs-/Trackingdienste.
9. Direkte Links /shop/?ad=100001 enthalten ausschließlich die öffentliche Nummer; keine Konto-/Entwurfsdaten, Suchfilter oder Checkout-Hashes. Alte ?product= Links funktionieren weiter. Unbekannte/mehrdeutige ad-Referenzen zeigen einen Hinweis statt eines beliebigen Artikels. QR-/Codeprüfung versteht die öffentlichen Nummern und Links ebenfalls.
10. Automatische Prüfung von Migration/Bestand/Wiederholungen/Betriebsgrenzen sowie Nummernsuche, Teilen/Abbruch/Kopierfallback und Handy-/Desktopdarstellung im vorhandenen nativen PostgreSQL-/Browserlauf.

## Grenzen

Händlerangebote sind weiterhin private Kontoentwürfe, keine veröffentlichten Marktplatzanzeigen. Die Nummer veröffentlicht sie nicht und verleiht keine Leseberechtigung. Öffentlich teilen lässt sich ausschließlich das vorhandene öffentliche Sortiment; eine spätere Händler-Veröffentlichung muss die bereits zugeteilte Datenbanknummer übernehmen und ihre eigene Freigabeprüfung behalten. Lokale Importe erhalten weiterhin neue Entwurfsidentitäten; eine importierte Nummer kann nicht vom Client vergeben werden. Keine neue Händler-Publikation, Zahlung, Warenkorbänderung, KI-Anfrage oder externe Nachricht wird durch Teilen ausgelöst. Eine echte WhatsApp-/Gerätefreigabe hängt vom Gerät ab und wird hier nicht als physisch getestet ausgegeben.
