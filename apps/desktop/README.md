# Bringness POS Desktop und SD-TSE

Entscheidung: Online-POS und Windows-POS sollen eine zertifizierte lokale SD-/microSD-TSE am Kassenstandort nutzen. Eine Cloud-TSE ist nicht vorgesehen.

## Aktueller Stand

Der Electron-Client lädt gegenwärtig die Online-Kasse von Railway. Er kann ohne Internet noch keine Verkäufe verbuchen. Er enthält keinen SD-TSE-Treiber, keine TSE-Signierung und keinen DSFinV-K-Export. Der TSE-Status im POS zeigt dies an. Es darf kein Beleg als TSE-signiert bezeichnet werden, solange kein echter Signaturdatensatz des Geräts vorliegt.

## Zielarchitektur

- Windows-Kasse: Kartenleser/SD-Karte → lokaler, auf ein zertifiziertes Kartenmodell abgestimmter TSE-Treiber/SDK → Kassenablauf. Für echten Offline-Betrieb sind außerdem eine lokale transaktionssichere Datenbank und spätere Synchronisation erforderlich.
- Browser-Kasse: Browser am Standort → lokal installierter Signaturdienst mit Zugriff auf dieselbe Kartenhardware → serverseitige Aufzeichnung und Belegausgabe. Der Railway-Server kann die SD-Karte des Kunden nicht direkt ansprechen.
- Vor dem endgültigen Zahlungsabschluss müssen TSE-Transaktion und signierter Abschluss für jede relevante Kassentransaktion gesichert werden; bei Fehlern darf der Beleg nicht als signiert erscheinen. Die genaue Ausfallbehandlung ist nach Herstellerunterlagen und fachlicher Prüfung festzulegen.
- Kassen- und Belegdaten bleiben dauerhaft und nachvollziehbar gespeichert; ein validierter DSFinV-K-Export ist separat zu implementieren. Die TSE-Karte ersetzt diese Aufzeichnungen nicht.

## Für die Hardwareintegration erforderlich

Konkretes BSI-zertifiziertes SD-/microSD-TSE-Modell samt Version, Hersteller-SDK/Treiber und physisches Testgerät mit Kartenleser. Danach folgen TSE-Lebenszyklus, Gerätezuordnung, Signaturprüfung, Ausfallablauf, Export und Ende-zu-Ende-Test an echter Hardware.
