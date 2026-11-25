# Bringness Bestell-Sandbox · Übergabe vom 25.11.2026

- Testumgebung: https://sandbox-bestellen.bringness.de/center/manage.html. Center: Bringness Sandbox Center. Betrieb: Bringness Sandbox Restaurant. Netcup-Arbeitsverzeichnis: /opt/bringness-delivery-sandbox. Compose: ops/delivery-sandbox.compose.json. Datenbank: bringness_delivery_sandbox.
- Mollie Connect ist verbunden. „Zahlungsstatus: Vom Anbieter bestätigt“ wurde mit dem Bringness-pos-Profil verifiziert. Der Testbetrieb hat „Vertrag abgeschlossen“ als Testwert.
- Die Sandbox fragt Mollie-Zahlungsmethoden mit testmode=true ab. Die Live-Freigaberegeln bleiben erhalten. Der Sandbox-Container wurde nach der Checkout-Konfiguration als healthy bestätigt. Effektive Werte: CENTER_MOLLIE_MODE=test, CENTER_CHECKOUT_ENABLED=true und CENTER_PAYMENT_ORIGIN auf der Sandbox-HTTPS-Adresse.
- Nächster Schritt: feste Center-Tische einrichten und QR-Testbestellung durchführen. Die Sandbox hat noch keinen aktiven Superadmin und keinen gebundenen Plattforminhaber. Der erste aktive Admin-Eintrag würde den Plattforminhaber dauerhaft binden. Eine vorübergehende Rolle wurde genehmigt, die dauerhafte Bindung steht noch zur Bestätigung aus. Die unveränderliche Eigentümerbindung nicht umgehen. Es wurde noch keine Testzahlung ausgelöst.
- Zugangsdaten bleiben in der geschützten .env.sandbox auf Netcup. Keine API-Schlüssel, OAuth-Tokens, Passwörter, Sessiondaten oder Tischcodes in Git speichern.

Der Konfigurations- und Code-Diff ist als `delivery-sandbox-checkout.patch` auf diesem Branch abgelegt. Er setzt den lokalen Sandbox-Quellstand `3f5d79c0` voraus. Der lokale Delivery-Branch konnte mangels Git-Push-Anmeldung nicht direkt übertragen werden.
