# POS-Einstellungen: Tests und Steuerbereiche aufklappbar

## Eigentümerauftrag

Bestand/Zählhistorie gehören nicht in die POS-Gerätetests. Bringness AI bleibt eine andere Anwendung. Scanner, Bondrucker, gespeicherte Geräteprotokolle sowie Windows-Updates/Offline-Abgleich erhalten ein eigenes Menü Tests und einzeln aufklappbare Unterpunkte. Steuerbereiche ebenfalls aufklappbar. Vorhandenen Rahmen aus PR277 übernehmen, keine zweite Umsetzung und keine stillschweigende Migration von Daten oder Konten nach AI.

## Umsetzung

- POS → Einstellungen → Tests, geschlossen beim Öffnen. Innerhalb: Scanner testen, Bondrucker testen, Gespeicherte Geräte-Prüfprotokolle, Windows-Updates und Offline-Abgleich, jeweils unabhängig geschlossen und per Tastatur bedienbar.
- Tests verwenden operations.html?embedded=1&view=tests und eine eigene sichtbare Betriebsauswahl. Bestehenden POS-Betrieb aus dem Hauptfenster gegen bootstrap prüfen. Ausschließlich Geräteprotokolle laden; keine Bestands-/Zählhistorienabfrage und keine Zählbuchung. Geräteinitialisierung hängt nicht länger von einem versteckten Bestandsknopf ab.
- Bestands-/Historienbereiche in dieser Tests-Ansicht ausgeblendet. Vorhandene Zähldaten und der bisherige eigenständige Bestandsablauf bleiben erhalten; keine Übertragung in AI, kein neues AI-Konto/Backend und kein Vermischen von Markt-/POS-/AI-Sitzungen. AI besitzt weiterhin seine eigenständige Bestandsverwaltung.
- Zuklappen entfernt keine Formulare, speichert nichts und verwirft keine Eingaben. Vorhandene Navigations-/Betriebswechsel-Sperre bei offenen oder unbestätigten Geräteangaben bleibt wirksam; Konto-/Betriebsentzug und private Bereinigung bleiben unverändert.
- Bestehender Steuern-&-Finanzamt-Rahmen bleibt geschlossen; zusätzlich Steuerberater-/Finanzamt-Exportzentrum sowie Steuerberaterfreigabe unabhängig aufklappbar. Zeitraum, Exporte, Rechte und Freigabelogik bleiben erhalten. Keine fiskalische/Hardwarefreigabe aus dieser Gestaltung ableiten.

## Prüfung

27 Bestands-/Geräte-DOM-Fälle einschließlich neuer Tests-only-Initialisierung ohne Inventarzugriff, Scannerprotokoll, erhaltener Eingaben und getrennter Sitzung. Steuerexport-DOM prüft geschlossene Gruppen, Wertbeibehaltung beim Klappen und weiterhin gültige CSV-/JSON-Exporte. Authentifizierung und allgemeine Tests ebenfalls erfolgreich. Native Chromium-/WebKit-Einbettung prüft standardmäßig geschlossene Gruppen, Tastatur, Scanner, Protokollinitialisierung, keine Inventarabfragen, unveränderten Warenkorb, Abbruch/Verwerfen bei Navigation und korrekten Betriebswechsel bei390/1280px.


## Geprüfter Abschluss

- PR278 finalffe726ebdfc1377dfcc0703f87cb7e7c9bcb887a / Treec0866b5ff212abc27dbffa915c09030cbbea3d1b / Merge1be20448f9360899a5170df7bf0fe0480f4fa50e.
- Lokal705 allgemeine Tests,27 Bestands-/Geräte-DOM-Fälle, POS-Authentifizierung/Navigation und Steuerexport-UI erfolgreich. Alle sieben finalen PR-CI erfolgreich: Center42525637799/WebKit128868518979/Chromium128868519186 mit tatsächlichem Auf-/Zuklappen, null Inventarabfragen, Eingabeschutz und Betriebswechsel; POS/AI42525637901/job128868519209; Shop42525637912/job128868519088 mit821 Tests und tatsächlichem PostgreSQL-/Browser-Einstieg; Farben42525637820; isoliert42525637882; checks42525637817; release42525637851. Finale mobile/Desktop-WebKit-Bilder13634943977 visuell geprüft; Chromium13635186730 ebenfalls erfolgreich. WebKit-Test wartet auf freigegebene Formularfelder statt einer flüchtigen Lade-/Leermeldung.
- Authentifizierte Sicherung42211075899/job128866540210: Database backups validated. Netcup42526254399/job128870427902 deployt exakt1be20448f9360899a5170df7bf0fe0480f4fa50e; vorheriger Container und Datenbanksicherung behalten.
- Livehealth200/no-store; POS-Einstieg200 mit settings-tests-folders-20261108. app.js,operations.js,tax-export.js200/no-store/bytegleich; operations.css200/bytegleich und neue Asset-Version. Tests-Unterseite200/SAMEORIGIN mit tests-folders-20261108; Bootstrap- und Geräteprotokollendpunkte ohne Anmeldung401/no-store. Keine produktiven Konten, Zählstände, Protokolle, Warenkörbe oder Verkäufe zur Abnahme geschrieben.
