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
