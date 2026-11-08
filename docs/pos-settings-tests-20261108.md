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

27 Bestands-/Geräte-DOM-Fälle einschließlich neuer Tests-only-Initialisierung ohne Inventarzugriff, Scannerprotokoll, erhaltener Eingaben und getrennter Sitzung. Steuerexport-DOM prüft geschlossene Gruppen, Wertbeibehaltung beim Klappen und weiterhin gültige CSV-/JSON-Exporte. Authentifizierung und allgemeine Tests erneut prüfen. Native Chromium-/WebKit-Einbettung prüft standardmäßig geschlossene Gruppen, Tastatur, Scanner, Protokollinitialisierung, keine Inventarabfragen, unveränderten Warenkorb, Abbruch/Verwerfen bei Navigation und korrekten Betriebswechsel bei390/1280px.
