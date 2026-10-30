# Händlerverbindung und Kunden-Testcheckout – drittes Zehnerpaket

Basis: PR178 /33bd1ee. Bestandsabgleich: Shop-Anmeldung, owner/admin-Prüfung,
Händlerfreigabe, Bestellansicht, dauerhafte Test-Intents, Mollie-Testadapter und
PostgreSQL-Einmalstart waren bereits vorhanden. Diese Bausteine werden erweitert.
Keine zweite Anmeldung oder separate Zahlungsdatenbank.

## Die zehn verbundenen Schritte

1. Vorhandene Anmeldung, frische Rollen-/Sitzungs- und Händlerprüfung für die Zahlungsverwaltung verwenden.
2. Mollie-OAuth-Zustimmung mit zehn Minuten gültigem, einmaligem State, Sitzung und sicherem Browsercookie binden. Händlerprofil ausdrücklich wählen und über die Anbieter-API prüfen.
3. Access-/Refresh-Tokens mit AES256-GCM verschlüsseln, AAD an Händler, Verbindungsrevision und Testzweck binden. Schlüssel nur vom geschützten Host beziehen. Refresh transaktional serialisieren; vor Anbieteroperation speichern. Transiente Fehler lassen den verschlüsselten alten Stand für erneute Prüfung erhalten.
4. Private Händler-Verbindungsansicht und Sperre integrieren. Browser erhält weder Tokens noch Verschlüsselungsdaten. Sperre löscht lokale Tokens, ersetzt keine externe OAuth-Widerrufung.
5. Vorhandene Kunden-Bestellansicht um ausdrücklich bezeichnete Testzahlung ergänzen. Betrag/Händler stammen aus der gespeicherten Bestellung. Zahlungsstart erfordert bewusste Bestätigung.
6. Eigene Mollie-Rückkehrseite implementieren. URL-Bestellverweis dient ausschließlich zum authentifizierten Laden, niemals als Zahlungsbeweis. Offen/unklar/fehlgeschlagen/abgebrochen/bezahlt anzeigen; sichere feste Mollie-Hosts für Fortsetzungslinks.
7. Anbieterbenachrichtigung akzeptiert ausschließlich eine Zahlungs-ID als Hinweis. Bekannte Zahlungsdaten werden serverseitig neu abgerufen und vom bestehenden Adapter geprüft; vom Absender gelieferte Status-/Betragsfelder werden abgewiesen.
8. Begrenzten, wiederaufrufbaren Abgleichworker bereitstellen: dauerhafte Ein-Minuten-Claims mit PostgreSQL SKIP LOCKED, maximal50 Vorgänge, ausschließlich GET-Recovery. Keine neuen Zahlungs-POSTs. Ein verlorenes Erstellungsresultat wird anhand des ursprünglichen Intents gefunden.
9. Bestätigte Testzahlungen einmalig und transaktional dem vorhandenen Händlerauftrag zuordnen. Unveränderlicher Test-Handoff, eindeutige order_id, CHECK(payment_mode='test',can_fulfil=false). Händleransicht zeigt Testbestätigung; echte Lieferung/Bestand/Fiskalbeleg bleiben gesperrt.
10. Verbindungs-, HTTP-, Recovery-, UI- und PostgreSQL-Paralleltests ergänzen; bestehende Zahlungs-, Shop- und Projektsuiten prüfen.

## Zusammensetzung und Grenzen

`createMarketplaceTestIntegration(pool, config)` liefert `merchantConnections` und
`checkoutProviderResolver` für `createMarketplaceRuntime`. `config` verlangt unabhängig
bereitgestellte OAuth-App-ID/-Secret, stabilen256-Bit-Schlüssel, HTTPS-Ursprung und optional
Testtransport. Kein Rückgriff auf POS-Aboschlüssel oder Center-Konfiguration. Der Host muss
seine bestehende geschützte Konfiguration verwenden; keine Geheimwerte im Chat/Repository.
`server/start.js` importiert die Zusammensetzung ausdrücklich noch nicht. Kein automatischer
Produktionsschalter, keine Umgehung der Host-Zugriffsgrenze, kein Deployment.

`runtime.reconcile()` ist ein begrenzter Host-Workeraufruf, kein offener HTTP-Adminendpunkt.
Der Host muss ihn nach gesonderter Konfiguration wiederholt ausführen. Der Testhost/CI
ruft ihn explizit auf; kein laufender produktiver Hintergrunddienst wird behauptet.
Bekannte Callback-Zahlungen werden direkt abgeglichen; unbekannte IDs werden nicht an
beliebige Händler weitergereicht. Verlorene IDs bleiben Aufgabe der Intent-Recovery.

Eine bestehende Verbindungsrevision kann für bereits gebundene Zahlungen nicht ersetzt
werden. Lokale Sperre ist sofort möglich. Wiederverbindung bei offenen/bezahlt gebundenen
Intents erfordert noch einen gesondert geprüften, identitätserhaltenden Wiederfreigabeablauf;
keine automatische Umbindung auf ein anderes Konto oder Profil. Dauerhaft ungültige
Refresh-Tokens brauchen diese administrative Wiederfreigabe. Zeitweilige Refresh-Fehler
löschen die vorhandenen Tokens nicht und erlauben erneute sichere Prüfung.

Schritt9 ist eine **Testzuordnung**, keine produktive Warenfreigabe. Tatsächliche Auszahlung,
Fiskalbelege, Rückerstattungs-/Bestandsrichtlinien und echte Händlerabnahme bleiben eigene
Produktivvoraussetzungen. Kein echtes Mollie-Konto wurde verbunden oder belastet.
Die Restaurantregeln und die übrigen POS-/Kellneroberflächen bleiben unverändert.

## Referenzen (29.10.2026)

- https://docs.mollie.com/reference/oauth-generate-tokens
- https://docs.mollie.com/reference/authorize-endpoint
- https://docs.mollie.com/reference/get-profile
- https://docs.mollie.com/docs/authentication-via-oauth

## Prüfung

Anwendungsstand:61e62ff955ef607a90157da98966a0fd18478875 auf GitHub,
identischer lokaler Tree7603ea6c2f3d87b89dc676e8af060be53f751ec4 /12f885fb.

- 659 allgemeine lokale Projekttests bestanden.
- 16 lokale Verbindungs-/Checkout-Integrationsprüfungen nach der letzten Serversperrkorrektur bestanden.
- 12 fokussierte UI-Prüfungen bestanden, darunter geschlossene Bestellungen ohne neuen Zahlungsstart.
- 107 Zahlungstests in GitHub bestanden, keine ausgelassenen Prüfungen. Enthält echten PostgreSQL-Einmalstart, parallele Token-Erneuerung, gleichzeitigen Abgleich und Kontowechsel gegen begonnene Zahlung.
- Neuer nativer HTTPS-Browsertest in Shop40957194617/job123740221733 bestanden: sichere Cookie-/State-Zustimmung, Callback, Profilprüfung, verlorene Zahlungsantwort, GET-Recovery, Rückkehrseite, einmaliger Test-Handoff und390/768/1280 ohne Überstand. Provider vollständig isoliert simuliert.
- Abschließende GitHub-Shop-Suite:703 bestanden, keine Fehler oder ausgelassenen Prüfungen. Echter Anwendungsstart mit PostgreSQL und bestehende native Händler-/Kundenabläufe ebenfalls erfolgreich.
- Alle sechs Anwendungs-Prüfläufe auf61e62ff erfolgreich: Shop40957194617/job123740221733, Zahlungssicherheit40957194569, POS/AI40957194565, isolierte Vorschau40957194459, Bringness40957194475 und Release40957194423. Browserartefakt12932899143.

Frühere Browserprüfung zeigte einen Teststatus-Knopf bei bereits geschlossenen unbezahlten
Bestellungen. Die aktuelle Version beschränkt ihn auf zahlbare Bestellungen oder bereits
gebundene Testzahlungen; bestehende native Händler-/Kundenprüfungen bleiben unverändert.
Kein Produktionskonto, Secret, Zahlungsauftrag oder Live-System wurde geändert.
