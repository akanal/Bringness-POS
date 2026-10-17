# Bringness POS

Bringness POS ist die gemeinsame Plattform für Gastronomie, Imbiss, Bäckerei, Café, Kiosk und Restaurant.

## Zielplattformen
- Online POS
- Windows POS
- iPad / iPhone
- Kundenportal
- Bringness Admin

## Architektur
- apps/web – öffentliche Produkt- und Download-Webseite
- apps/online-pos – browserbasierte Kasse
- apps/customer-portal – Kundenkonto
- apps/admin – Bringness Administration
- apps/desktop – Windows-Client
- apps/ios – iOS/iPadOS-Client
- packages/pos-core – gemeinsame Kassenlogik
- packages/ui – gemeinsames Designsystem
- server – API/Backend
- db – PostgreSQL, Migrationen und Seeds
- docs – Betrieb, Deployment und Dokumentation

## Status
Produktionsaufbau begonnen. Fiskal/TSE und Payment werden erst nach Anbindung realer zertifizierter Provider als produktiv gekennzeichnet.

<!-- deploy-sync: 2026-09-22 POS modules -->

## Freigabeprüfung – acht Funktionsbereiche (Stand: 2026-10-16)

**Status: nicht zur Produktion freigegeben.** Die folgenden Punkte belegen nur vorhandene Implementierungen, keine erfolgreichen End-to-End-Tests. Vor einem Release sind Testnachweise und die Prüfung der realen Netcup-Umgebung erforderlich.

| Bereich | Vorhandene Implementierung / Prüfansatz | Offener Freigabenachweis |
| --- | --- | --- |
| POS-Kasse | `server/payment-checkout.js`, `server/start.js` | Authentifizierter Warenkorb, Zahlarten, Kassenoberfläche und Belegdruck im Testbetrieb prüfen. Eine vom Client gesetzte `externalCardConfirmed`-Angabe ist **kein** Zahlungsprovider-Nachweis. |
| Offline/Windows | `server/offline-sales.js`, `server/offline-sale-core.test.js` | Lizenzbindung, doppelte Übertragung, Konflikte, Neustart, tatsächlicher Windows-Build und Signatur prüfen. |
| TSE/Belege | `server/tse-integration.js`, `server/public-receipt.js` | Echte TSE-Signatur/Status, Offline-TSE und QR-Belegziel mit Testtransaktion verifizieren. |
| Zahlungen/Lizenzen | `server/payment-checkout.js`, `server/package-access.js`, `server/billing-status.js` | Mollie-Webhook, wiederkehrende Abbuchung, Freischaltung/Sperrung und Rückerstattung mit Anbieter-Testkonten nachweisen. |
| Admin/Steuerberater | `server/accountant-access.js`, `server/remote-support-core.js` | Rechte je Betrieb, Sitzungsentzug, Protokollierung und Datenschutz prüfen. |
| QR/Center/Kellner | `server/center.js`, `server/qr-service.js`, `server/waiter-workflow.js` | Bestellung, Restaurantzuordnung, Abholmeldung und Bezahlung beim richtigen Händler Ende-zu-Ende prüfen. |
| Bringness AI | `server/ai-forecast-core.js`, `server/ai-procurement-core.js` | Prognosen und Einkaufsvorschläge mit Testdaten prüfen; keine automatische Bestellung ohne Freigabe. |
| Gesamttest/Netcup | `.github/workflows/netcup-operations.yml`, `ops/select-operation.js` | CI erfolgreich, Backup und Wiederherstellung geprüft, anschließende explizite Releasefreigabe. |

Für jede Freigabe getrennt dokumentieren: **Code vorhanden**, **automatisierte Tests bestanden**, **Integration getestet**, **live verifiziert**. Keine dieser Stufen darf aus einer anderen abgeleitet werden. Bestehende POS- und Kellneroberflächen bleiben unverändert.
