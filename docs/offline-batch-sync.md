# Offline-Verkaufssynchronisierung (Windows-Kasse)

Die Download-Kasse kann nach Wiederherstellung der Internetverbindung gespeicherte Barverkäufe gesammelt übertragen.

## Katalog beziehen
`POST /api/v1/offline/catalog` mit Bearer-Session und JSON `{"deviceKey":"<64 hex Zeichen>"}`.
Nur aktive, freigeschaltete Download-Geräte eines berechtigten Unternehmens erhalten einen Katalog. Der Katalog ist maximal 24 Stunden gültig, bei früherem Lizenzende entsprechend kürzer.

## Verkäufe gesammelt übertragen
`POST /api/v1/offline/batch` mit Bearer-Session und JSON:

```json
{
  "deviceKey": "<64 hex Zeichen>",
  "sales": [
    {
      "id": "<UUID des lokalen Verkaufs>",
      "snapshotId": "<UUID des zuvor erhaltenen Katalogs>",
      "restaurantId": "<Restaurant-ID>",
      "createdAt": "2026-10-16T12:00:00.000Z",
      "paymentMethod": "cash",
      "items": [{"productId":"<Artikel-ID>","quantity":2}]
    }
  ]
}
```

Maximal 20 Verkäufe je Anfrage. Der Server antwortet mit `results` in derselben Reihenfolge, sowie `succeeded` und `failed`. Für jeden Verkauf enthält `ok:true` die bestätigte Server-Bestellung und Belegnummer; bei `ok:false` folgen HTTP-ähnlicher `status` und `error`. Bereits erfolgreich importierte Verkäufe mit unveränderter Kennung und gleichem Inhalt werden mit `replayed:true` quittiert. Ein Konflikt mit derselben Kennung, aber anderen Daten liefert `409`.

## Client-Ablauf
1. Jeden lokal bezahlten Verkauf **vor** der Synchronisierung dauerhaft speichern, einschließlich UUID und unveränderter Positionen. Nur Barzahlungen werden offline importiert.
2. Bis zu 20 offene Verkäufe an `/api/v1/offline/batch` senden.
3. Ausschließlich Verkäufe mit `ok:true` lokal als synchronisiert markieren; die Server-Bestell-ID und Belegnummer übernehmen.
4. Bei `ok:false` den Datensatz mit Fehlermeldung behalten. Netzwerkfehler später mit derselben UUID erneut senden, niemals eine neue UUID für denselben Verkauf erzeugen.
5. Bei `409` nicht automatisch überschreiben. Der Verkauf muss manuell abgeglichen werden.
6. Eine abgelaufene Katalogberechtigung erfordert einen neuen Katalog für **neue** Offline-Verkäufe; alte Verkäufe und Belege dürfen nicht rückdatiert oder verändert werden.

## Abgrenzung
Der Batch-Endpunkt ist serverseitig implementiert. Eine fertige lokale Windows-Warteschlange, Geräte-End-to-End-Prüfung und die zertifizierte TSE-Anbindung sind damit **noch nicht** nachgewiesen. Offline importierte Belege behalten den steuerlichen Status `pending`, bis der separate Signaturprozess sie rechtskonform verarbeitet.
