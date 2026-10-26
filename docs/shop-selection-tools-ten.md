# Zehn Verbesserungen für Merkliste und Vergleich

1. Volltextsuche innerhalb der gemerkten Produkte.
2. Filter nach monatlicher, einmaliger oder noch offener Abrechnung.
3. Sortierung nach gemerkter Reihenfolge, Namen oder Preis innerhalb der Abrechnungsart.
4. Trefferanzeige und ausdrückliches Zurücksetzen der Merklistenfilter; keine Treffer werden erklärt.
5. Merkliste zeigt Netto-/Bruttobeträge und Abrechnungsart zusammen.
6. Bereits im Warenkorb enthaltene Produkte sind in Merkliste und Vergleich gekennzeichnet. Die Übernahme erhöht eine bestehende Menge nicht.
7. Produkte lassen sich direkt aus der Merkliste zum Vergleich hinzufügen/entfernen.
8. Das letzte Entfernen aus der Merkliste lässt sich in der ursprünglichen Reihenfolge rückgängig machen; der Tastaturfokus bleibt nutzbar.
9. Vergleich kann gleiche Merkmale ausblenden; bei nur einem Produkt bleiben alle Fakten sichtbar. Gemeinsame Kategorie und getrennte Laufzeiten werden klar benannt.
10. Produkte lassen sich aus dem Vergleich merken oder ausdrücklich in den seitlichen Warenkorb übernehmen. Nicht bestellbare Produkte erhalten keinen Kaufknopf.

Auswahl und Rückgängig sind browserlokal, keine Kontospeicherung, Reservierung oder Bestellung. Geldbeträge/MwSt., Lizenzmengenprüfung, bestehende Kaufprüfung und Zahlungsgrenzen bleiben erhalten. Suchtext und Filter werden nicht an den Server übertragen. Die vorhandene Merkliste ist weiterhin auf die aktuelle Browsersitzung beschränkt.

Prüfung: Pure-/DOM-Tests für Filter, Beträge, Rückgängig, Fokus und Übernahmen ohne doppelte Mengen. Native Chromium-Prüfung am tatsächlichen Entrypoint mit isoliertem PostgreSQL bei 1280 und 390 Pixeln, einschließlich Vergleichsunterschieden, Warenkorbstatus und public-only Screenshots vor Anmeldung.
