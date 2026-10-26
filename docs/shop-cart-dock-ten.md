# Warenkorb ohne Einkaufssperre: zehn Änderungen

Screenshot (310) zeigt den bisherigen modalen Warenkorb mit verdunkeltem, gesperrtem Shop. Die neue Warenkorbansicht verwendet kein showModal und keine Fokusfalle.

1. Rechts angedockter Warenkorb auf großen Bildschirmen.
2. Hintergrund bleibt bedienbar: suchen, filtern und weitere Artikel hinzufügen.
3. Ab 1100px reserviert die Seite Platz für den offenen Warenkorb; die Inhalte passen sich an.
4. Auf kleineren Bildschirmen liegt ein nicht modales Feld unten mit höchstens 52% Bildschirmhöhe. Zusätzlicher Seitenabstand lässt auch die letzten Artikel darüber scrollen.
5. Verkleinern/Vergrößern reduziert den Warenkorb auf seine Kopfzeile.
6. Kopfzeile und Aktionen bleiben sichtbar, der Inhalt scrollt separat.
7. Escape schließt den Warenkorb, sofern kein anderer Dialog darüber offen ist; Tab kann in den Shop wechseln.
8. Der Kopfleisten-Schalter öffnet und schließt mit aria-expanded; alle bestehenden Warenkorb-Einstiege öffnen dieselbe Ansicht.
9. Weitere Artikel aktualisieren den offenen Warenkorb sofort, ohne zusätzliches Bestätigungsfenster.
10. Die Kopfzeile zeigt die aktuelle Gesamtstückzahl auch im verkleinerten Zustand. Der Assistent weicht dem Warenkorb aus.

Weiter stöbern/Schließen behält die Auswahl. Preise, Mengenprüfung, MwSt., Merkliste, Rückgängig, Kontoprüfung und Zahlungsregeln bleiben erhalten. Bestellung prüfen bleibt ein ausdrücklicher eigener Schritt. Keine neuen Serveranfragen beim Öffnen oder Bearbeiten des Warenkorbs.

DOM-Tests prüfen nicht modales Öffnen, Hintergrundsuche und Hinzufügen, Summen, Verkleinern, Escape, Fokus, Weiterstöbern und Dialogübergänge. Native Browserprüfung kontrolliert Nicht-Modalität, tatsächlich anklickbare Hintergrundartikel, Layout/Fußraum und Breiten von 390 bis 1600 Pixel.
