# Feste Branchen-Icons und zentrale Produktwerbung

Auftrag des Inhabers vom 27.11.2026: Ein festes, wiederverwendetes Figuren-Icon je Geschäftsart; kein Icon-Wahlrecht für Betreiber. Kostenlose Portalteilnahme, Bestellannahme und Lieferung freiwillig. Produktwerbung rechts, mobil unter den Inhalten, ausschließlich über die Inhaberverwaltung steuerbar.

## Umsetzung

- Zentrale unveränderliche Zuordnung in `apps/web/public/business-sectors.js`: Restaurant/Pizzeria → Pizza, Lebensmittel → Gemüse, Kiosk/Presse → Zeitung, Bekleidung → T-Shirt, Elektronik → Computer, Blumen → Blumen. Gestaltung kann zentral ausgetauscht werden. Figuren und Schrift in der bestehenden Kategorienleiste; weitere Branchen bleiben bis zur tatsächlichen Such-/Bestellunterstützung als „Demnächst“ markiert.
- Bestehende POS-Einrichtung ergänzt die Geschäftsart im Bestellportal. Vorhandene Portal-API speichert die Geschäftsart; ältere Clients ohne Angabe erhalten den gespeicherten Wert. Keine automatische Aktivierung von Abholung/Lieferung. Keine neue Gebühr, Zahlungsaktivierung oder Veränderung bestehender Preise.
- `/admin/advertising.html`, Verwaltung → Support & E-Mail → Werbung · Inhaber: Bilddatei, Überschrift, Text, HTTPS-Link, Reihenfolge, Zeitraum, Entwurf/aktiv/pausiert sowie Vorschau für Computer und Handy. Ortszeit des Geräts wird vor Speicherung nach UTC umgerechnet.
- `portal_advertisements` und separates Änderungsprotokoll. Nur bestehender gebundener Plattforminhaber mit aktiver Sitzung, aktivem Benutzer und Plattformfreigabe. Keine zusätzliche Freigabe für Betriebsadministratoren. Änderungen und Audit atomar; Versionsschutz und identische unmittelbare Wiederholung. Unklare Schreibantwort wird in der Oberfläche zum Standabgleich gesperrt.
- Öffentliche API liefert höchstens sechs aktuell aktive Anzeigen, ohne interne Versions-/Inhaberinformationen. Rasterbilder werden lokal verkleinert/neu codiert; keine SVGs oder eingebetteten Skripte, keine externen Tracking-Bildquellen. Texte werden als Textknoten ausgegeben. Kein Klicktracking, keine automatische Werbeabrechnung oder garantierte Einnahmen.
- Aktuelle öffentliche Sandbox-Dateien als Gestaltungsgrundlage übernommen; bestehende Suche und Filter erhalten. Alte lokale Werbetext-Experimente ersetzt durch zentrale Verwaltung. Ohne aktive Werbung bleibt die Spalte leer und verborgen. Offene Seiten gleichen Anzeigen spätestens im nächsten sichtbaren Minutenintervall ab.

## Prüfung und Bereitstellungsgrenze

- Lokal 794 allgemeine Unit-Tests bestanden. Zusätzliche PGlite- und DOM-Prüfung deckt Entwurf/Aktivierung, zukünftige/abgelaufene Anzeigen, Versionskonflikte, identische Wiederholung, Audit, entzogenes Recht, abgelaufene Sitzung, sichere Darstellung und Geschäftsart-Erhalt ohne Aktivierung der Bestellarten ab.
- Nativer Chromium-Test für Bild hochladen, Speichern/Neuladen/Pausieren und Layoutbreiten 320/390/650/1280 liegt als `server/ai-tests/portal-advertising-browser.mjs` bei. Lokal konnte Chromium nicht gestartet werden: vorhandener Launcher ohne Browser-Binary; Playwright-Download scheiterte. Separater PR-Workflow führt die Prüfung auf GitHub aus. Erfolg erst nach tatsächlich bestandenem Lauf behaupten.
- Änderungen auf eigenem Entwicklungszweig. Keine Produktion oder Sandbox veröffentlicht. Bestehender Netcup-Workflow kennt nur `pos`/`ai`, keinen Sandbox-Deploy. Nicht die Produktion als Ersatz für eine beauftragte Testbereitstellung verwenden. Für die Sandbox muss der vorhandene Konsolenweg genutzt und der abweichende Host-Quellstand vor Anwendung gesichert/abgeglichen werden.

Praktische Inhaberprüfung der Figurengestaltung bleibt wie besprochen für später. Onlinebestellungen für andere Branchen und automatische Werbeabrechnung sind nicht implementiert.
