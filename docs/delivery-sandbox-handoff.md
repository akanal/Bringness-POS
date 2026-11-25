# Bringness Bestell-Sandbox · Übergabe vom 25.11.2026

- Testumgebung: https://sandbox-bestellen.bringness.de/center/manage.html. Center: Bringness Sandbox Center. Betrieb: Bringness Sandbox Restaurant. Netcup-Arbeitsverzeichnis: /opt/bringness-delivery-sandbox. Compose: ops/delivery-sandbox.compose.json. Datenbank: bringness_delivery_sandbox.
- Mollie Connect ist verbunden. „Zahlungsstatus: Vom Anbieter bestätigt“ wurde mit dem Bringness-pos-Profil verifiziert. Der Testbetrieb hat „Vertrag abgeschlossen“ als Testwert.
- Die Sandbox fragt Mollie-Zahlungsmethoden mit testmode=true ab. Die Live-Freigaberegeln bleiben erhalten. Der Sandbox-Container wurde nach der Checkout-Konfiguration als healthy bestätigt. Effektive Werte: CENTER_MOLLIE_MODE=test, CENTER_CHECKOUT_ENABLED=true und CENTER_PAYMENT_ORIGIN auf der Sandbox-HTTPS-Adresse.
- Ersteinrichtung am 25.11.2026 abgeschlossen. Das bestehende Sandbox-Konto wurde mit Zustimmung des Inhabers dauerhaft als Plattforminhaber dieser Sandbox gebunden. Die vorübergehende Superadmin-Rolle wurde anschließend deaktiviert; die Datenbank meldete null aktive Superadmins.
- `Sandbox Testtisch 1` ist angelegt. Nach Entzug der Adminrechte und Neuladen der Center-Verwaltung war „QR-Bild herunterladen“ weiterhin sichtbar. Der QR-Gastablauf wurde am 25.11.2026 mit einem Sandbox-Testartikel für 1,00 € verifiziert. Mollie zeigte ausdrücklich den Testmodus. Die simulierte Kartenzahlung wurde auf Paid gesetzt. Bringness zeigte danach „Zahlung bestätigt“, „An die Küche freigegeben“, Abholnummer BN-2026-001000 und den Link zum digitalen Beleg. Es wurde kein echtes Geld bewegt. Die Bestellung erschien in der POS-Bestellliste als #001 (Beschriftung „Theke / Mitarbeiter / Kasse“). „Zubereitung starten“ setzte sie auf „In Zubereitung“, sichtbar auch in der Center-Küche. Dort wurde „Abholbereit“ gesetzt. Nach Aktualisieren sah der Gast „Deine Bestellung ist abholbereit“ und den Verlaufseintrag „Abholbereit“ um 10:52. Der Zubereitungsstart über die allgemeine POS-Liste erschien nicht im Gastverlauf. Push und Signalton wurden nicht geprüft.
- Zugangsdaten bleiben in der geschützten .env.sandbox auf Netcup. Keine API-Schlüssel, OAuth-Tokens, Passwörter, Sessiondaten oder Tischcodes in Git speichern.

Der Konfigurations- und Code-Diff ist als `delivery-sandbox-checkout.patch` auf diesem Branch abgelegt. Er setzt den lokalen Sandbox-Quellstand `3f5d79c0` voraus. Der lokale Delivery-Branch konnte mangels Git-Push-Anmeldung nicht direkt übertragen werden.

## Nachtest: Zubereitung und Abholung

Der POS-Bestellstatus nutzt für den Start einer Center-Bestellung jetzt die bestehende Center-Küchenlogik. Der regressionsgeprüfte Patch ist auf der Netcup-Sandbox installiert. Mit der zweiten simulierten 1,00-€-Bestellung BN-2026-001001 erschien „Zubereitung gestartet“ nach dem Start über die reguläre POS-Bestellliste auf der Gastseite. „Abholbereit“ wurde in der Center-Küche gesetzt und im geöffneten Gastfenster automatisch angezeigt. Keine Echtgeldzahlung. Push und Signalton bleiben ungeprüft. Der ursprüngliche Testlauf bleibt als historischer Fehlernachweis dokumentiert.

## Abhol-Push in der Sandbox

Push wurde im Netcup-Sandbox-Container aktiviert. Compose lädt `../.env.sandbox-push` über `services.app.env_file`. Die Datei ist auf dem Host mit Modus 600 geschützt und enthält den Aktivierungsschalter sowie ein separates VAPID-Schlüsselpaar. Der öffentliche Sandbox-Konfigurationsendpunkt bestätigte `available: true`; die Gastseite zeigte den Schalter zur Benachrichtigung. Neun Push-Unit-Tests bestanden. Bei BN-2026-001002 (simulierte Mollie-Zahlung) verweigerte der Cloudbrowser die Benachrichtigungsfreigabe. Die Bestellung wurde anschließend in der Center-Küche bis „Abholbereit“ geführt. Auf der Gastseite erschienen die Abholmeldung und der vollständige Verlauf einschließlich Zubereitungsstart. Tatsächliche Push-Zustellung steht aus und erfordert eine neue Testbestellung mit erteilter Browserfreigabe vor dem Küchenabschluss. Der Signalton wurde anschließend separat implementiert.

## Abholton im geöffneten Gastfenster

Commit 57fde0c3ada8447fe04593f75139e5f138db87f8 ist auf der Netcup-Sandbox installiert. Die HTML-Datei im gesunden Container stimmt per SHA-256 mit der geprüften GitHub-Datei überein. Die tatsächliche Gastseite lädt den neuen Schalter und blendet ihn bei einer bereits abholbereiten Bestellung aus. Vier lokale Audiologik-Szenarien bestanden. Ein hörbarer Testlauf auf einem Gerät steht aus. Vorherige Quelldatei und Container-Image wurden für einen Rückfall gesichert.

Browser-Nachtest mit BN-2026-001003 und simulierter Mollie-Zahlung: Der Gastschalter meldete „Abholton eingeschaltet“. Die Center-Küche setzte die Bestellung in Zubereitung und anschließend auf „Abholbereit“. Die geöffnete Gastseite zeigte den Wechsel automatisch. Die tatsächliche Audioausgabe wurde im Cloud-Browser nicht abgehört.

## Vorbereitung Live-Checkout

`center-checkout-rollout-guard.patch` ergänzt im lokalen Delivery-Quellstand eine Startprüfung für ausdrücklich aktivierten Center-Checkout. Außerhalb der isolierten Sandbox wird der explizite Mollie-Live-Modus verlangt. HTTPS-Basisadresse, passender OAuth-Callback, Client-Konfiguration und Token-Schlüssel werden strukturell geprüft. 58 fokussierte Tests bestanden. Der Patch ist als GitHub-Datei archiviert, weil dem Übergabebranch der vollständige Delivery-Quellstand fehlt. Noch nicht installiert. Vor Echtgeldbetrieb bleiben bestätigtes Mollie-Live-Händlerprofil, reale TSE-Abnahme und ein kontrollierter Zahlungs- und Belegtest offen. Optionale Push-Zustellung separat prüfen.

## Sandbox-Test: fehlgeschlagener Kartenzahlungsversuch

Am 25.11.2026 wurde für Testbestellung C-955B1299 in Mollie ausdrücklich „Failed“ simuliert. Mollie kehrte zur Auswahl der Zahlungsarten zurück. Nach Rückkehr zu Bringness stand die Bestellung noch auf „Zahlung wird geprüft“, ohne Zahlungsbestätigung oder digitalen Beleg. Die Bestellung erschien nicht in der Center-Küche. Das bestätigt den Schutz vor Freigabe bei diesem unbezahlten Versuch, aber noch keinen finalen Fehlerstatus für den gesamten Checkout. TSE-Arbeiten wurden auf Wunsch des Inhabers zurückgestellt.

## Sandbox-Test: Ablauf eines Kartenzahlungsversuchs

Bei C-D4DA4B27 wurde im Mollie-Testmodus „Expired“ gewählt. Mollie kehrte zur Zahlungsartenauswahl zurück. Nach manueller Rückkehr zur Gastseite wartete Bringness weiter auf die Zahlung, ohne Beleg. Der Versuch bestätigte keinen endgültigen Ablauf des gesamten Mollie-Checkouts. Lokal bestanden 34 Center-, Mollie- und Datenbanktests, einschließlich final gemeldeter Providerstatus failed/canceled/expired ohne Belegerzeugung. Der Test des endgültigen Status mit dem echten Sandbox-Provider bleibt offen.

## Offenen Checkout fortsetzen

Die Gaststatusseite bietet für eine noch offene, gebundene Mollie-Zahlung „Zahlung fortsetzen“ an. Sie verwendet die gespeicherte Checkout-Adresse und erzeugt keine neue Bestellung oder Zahlung. Bei deaktiviertem Checkout, inaktivem Tisch/Center sowie nach Zahlung oder endgültigem Anbieterfehler wird der Link nicht freigegeben. 40 lokale Center-, Datenbank- und Checkout-Tests bestanden. Commit 5d7e179cc256a097e48b7074db2f528c007d2bb6 wurde für die beiden Laufzeitdateien auf Netcup abgeglichen und in der Sandbox installiert. Der Sandbox-Container wurde anschließend als healthy bestätigt. Der Cloud-Browser blockierte den anschließenden Prüfschritt wegen des URL-Protokolls. Der manuelle End-to-End-Klick steht aus.

## Kennzeichnung in der POS-Bestellliste

Center-Bestellungen werden im Quellcode als „Center-Abholung“ und „Center-QR-Bestellung“ bezeichnet. Syntaxprüfung und lokaler POS-/Display-Integrationstest einschließlich der Center-Karte bestanden. Commit ce38505a8c25180ad1cfe8327031348146f6c289 enthält die gezielte Änderung für den Übergabebranch. Der Sandbox-Quellstand enthält weitere Delivery-Änderungen und hat die entsprechende lokale Änderung separat. Auf Netcup-Sandbox installiert. Die Kassendatei stimmt per SHA-256 mit dem lokal geprüften Stand überein. Nach einer zwischengespeicherten Browseransicht wurde die Skriptversion erhöht und im gesunden Container verifiziert. Die URL-Richtlinie des Cloud-Browsers blockierte die abschließende Sichtprüfung.

## POS-Abnahme und Freigabestatus

Patch 996b08bccd8a9316612ace28f766d6c830428a34 wurde nach Quellstandprüfung mit Rückfallkopien auf die Netcup-Sandbox angewendet. Sandbox-Container healthy. Im Browser waren vier bezahlte Center-Karten mit korrekter Kennzeichnung sichtbar. Die unbezahlten Vorgänge #005 und #006 erschienen nicht in der POS-Bestellliste. Die Center-Karten hatten keinen allgemeinen Storno-Button. 58 Center- und Mollie-Tests sowie der POS-/Display-Integrationstest bestanden. Ein Checkout mit Echtgeld erfordert bestätigte Live-Zahlungsbereitschaft des Händlerprofils und einen separat kontrollierten Echtzahlungs- und Belegtest. Für bereits online bezahlte Bestellungen ist der Erstattungsablauf vor einem Live-Pilot zu klären. TSE-Arbeiten sind auf Wunsch zurückgestellt. Die Sandbox-Installation ist keine Produktionsfreigabe.
