# TSE-Beleg und QR-Code: Abnahmeprotokoll

Stand: 2026-10-16. Dies ist ein Testplan, keine Bestätigung einer Live-Abnahme.

## Bereits automatisiert geprüft
- TSE-Snapshot wird ausschließlich für `signed` erstellt.
- Beleg und TSE-Transaktion werden in PostgreSQL miteinander verknüpft.
- Eine bereits zugeordnete TSE-Transaktion kann nicht unbemerkt durch eine andere ersetzt werden.
- Ein fehlender Beleg verhindert den erfolgreichen Abschluss der Speicherung.

## Vor Produktivfreigabe zwingend offen
1. Den tatsächlichen Checkout-Endpunkt identifizieren und nachweisen, dass jeder fiskalisierungspflichtige Kassenabschluss eine vorbereitete TSE-Transaktion erzeugt.
2. Für einen signierten Testbeleg kontrollieren, dass Belegnummer, Gesamtbetrag, Steuersätze, Zahlungsart, TSE-Seriennummer, Transaktionsnummer, Start-/Endzeit, Signaturzähler und Signatur im Beleg-/Druckmodell korrekt erscheinen.
3. Den QR-Code auf dem Ausdruck und im digitalen Beleg mit einem echten Mobilgerät scannen. Der Link muss die **zugehörige Rechnung** öffnen und darf weder zu einer generischen Startseite noch zu einem falschen Beleg führen.
4. Zugriffsschutz prüfen: Ein fremder Restaurant-Account darf keine Belegdaten abrufen; öffentliche Beleglinks benötigen geeignete nicht erratbare Zugriffstoken und angemessene Gültigkeit.
5. Störungen prüfen: fehlender Beleg, verlorene TSE-Antwort, fehlender Drucker, doppelte Zahlung und Neustart nach Absturz. Niemals eine unbestätigte Hardware-Signierung automatisch wiederholen.
6. Offline-SD-TSE mit dem konkreten zertifizierten Gerät und dem lokalen Bridge-Treiber testen; anschließend Anforderungen an KassenSichV und DSFinV-K gesondert prüfen.

## Freigaberegel
Keine Live-Fiskalisierung allein aufgrund von Unit- und PostgreSQL-Tests. Produktivfreigabe erst nach Checkout-Integration, Geräteprüfung, QR-/Druckabnahme und dokumentierter Sicherheitsprüfung.
