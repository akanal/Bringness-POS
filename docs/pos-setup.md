# Geführte Online-POS-Einrichtung

In **Einstellungen → Betrieb einrichten → Einrichtungsassistent öffnen** starten. Der Foto-/PDF-/CSV-Import verlinkt ebenfalls auf den Assistenten. Zugriff nur mit gültiger Inhaber-/Admin-Sitzung für den eigenen Betrieb. Kein automatischer Start, keine neue Kopfzeile und keine Änderung von Verkauf, Kellner-App oder gebuchten Modulen. Download-Clients erhalten den neuen Online-Einstieg nicht.

Die sechs Schritte:
1. **Betrieb & Rechnungsdaten:** vorhandenen Betriebsnamen und Rechnungsanschrift prüfen. Schaltflächen öffnen die bisherigen Formulare für denselben Betrieb; keine zweite Datenerfassung im Assistenten.
2. **Speisekarte:** aktive Artikel werden erkannt. Bestehende Verwaltung oder Foto-/PDF-/CSV-Import öffnen; Preise/MwSt. ausdrücklich prüfen.
3. **Module:** gewünschte Zusatzfunktionen auswählen und speichern. Vorhandene Berechtigungen werden angezeigt. Abhängigkeiten und Trennung von Center/anderen QR-Modulen bleiben erhalten. Wunschliste ist keine Buchung oder Kündigung. Jede kostenpflichtige Aktion bleibt im bisherigen Lizenzablauf.
4. **Geräte & Displays:** tatsächlich benötigte Geräte wählen. Vorhandene Drucker-/Scanner-Prüfprotokolle wiederverwenden; deren Bestätigung ist ein Kundennachweis, keine automatische Hardwarediagnose. Displays müssen eingerichtet und am echten Bildschirm geprüft werden. Scanner-/Displaymodul muss bei entsprechendem Wunsch tatsächlich verfügbar sein.
5. **Zahlung & TSE:** Zahlungsweg ausdrücklich wählen. Barzahlung, externes Kartenterminal oder Center-Onlinezahlung sind getrennt. Terminalanbieter bleibt separat. Center-Onlinebereitschaft benötigt bestehende aktive Center-Funktion, aktuelle Händlerverifikation, aktive/signed Center-Zuordnung im Online-/Wahlmodus, gültige Credentials, HTTPS-Zahlungsorigin sowie ausdrücklich vorhandene LIVE-/Checkout-Konfiguration. Kein neuer Anbieteraufruf, Vertrag, Checkout oder Umschalten auf LIVE durch den Assistenten.
6. **Abschluss:** alle offenen Punkte bleiben sichtbar. Erst wenn alle fünf Vorbereitungsschritte nach tatsächlichen Voraussetzungen geprüft sind, ist der Abschluss möglich. Abschluss ist weder Zahlungs-/Verkaufsberechtigung noch rechtliche Zertifizierung.

## Fortschritt und Prüfung

Auswahl, aktueller Schritt und Bestätigungen werden serverseitig je Betrieb gespeichert. Änderungen an Checkboxen werden über **Auswahl speichern** übernommen; Navigation, Prüfung und Abschluss werden ebenfalls gespeichert. Ungespeicherte Änderungen werden vor Verlassen/Neuladen geschützt. Nach Änderungen im geöffneten anderen Tab **Status aktualisieren** verwenden. Gleichzeitige veraltete Änderungen werden mit Versionskonflikt abgewiesen. Bei ungeklärter Antwort bleiben Angaben gesperrt und dieselbe Vorgangskennung kann unverändert erneut geprüft werden. Bis zur Bestätigung Tab offen lassen.

Bestätigungen sind an Fingerprints der tatsächlich gelesenen Betriebs-/Rechnungsdaten, Speisekarte/Kategorien, Modulberechtigungen, Geräteprotokolle/Displaykonfiguration und Zahlungs-/Fiskalvoraussetzungen gebunden. Ändern sich diese, öffnet sich der betroffene Prüfungspunkt erneut. Ein früherer Abschluss gilt dann nicht als aktuell. Die Tabellen `pos_setup_progress` und `pos_setup_requests` verändern keine Produkt-, Geräte-, Personal-, Zahlungs-, Lizenz- oder Belegdaten. Fortschritt, Wiederholungskennung und Änderungsprotokoll werden atomar gespeichert. Identitätswechsel oder Entzug sperren den Client; serverseitige Rechte werden vor und nach Statusermittlung sowie beim Schreiben geprüft.

## Bestehende Fiskalgrenze

Der vorhandene `/fiscal/status` meldet weiterhin `salesSigningActive:false` und `dsfinvkExportAvailable:false`. Der Assistent berücksichtigt dieselbe Produktionsgrenze und meldet TSE daher nicht allein wegen eines gespeicherten Geräts, TEST-Nachweises oder Kundenhäkchens betriebsbereit. Aktuelle reale Betriebe können die übrigen Schritte vorbereiten; Zahlung/TSE und Abschluss bleiben bis zu einer tatsächlich verifizierten Produktionsintegration offen. `readFiscalSetupStatus` ist bei späterer Freigabe gemeinsam mit dem maßgeblichen Fiskalstatus zu aktualisieren. Die neue Einrichtung erteilt keine Fiskalfreigabe.

## Abnahme

`node --test server/pos-setup-core.test.js`, `node server/ai-tests/pos-setup.mjs` und nativer Chromium-/WebKit-Lauf `server/pos-setup-browser.mjs`. Tests verwenden ausschließlich isolierte Firmen und synthetische Nachweise. Geprüft: Rechte/Betriebsbindung, Persistenz/Reload, Modulabhängigkeiten ohne Buchung, veränderte Daten, echte Voraussetzungen vor Abschluss, Audit-Rollback, veraltete Version/Fingerprint und unveränderte Wiederholung. Browserbilder bei 390/1280 px, keine produktiven Kundeneinrichtungen zur Abnahme anlegen.
