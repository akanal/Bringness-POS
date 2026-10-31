# Zahlungsfreigabe — Zehnerblock-Abgleich 30.10.2026

## Ergebnis und Grenzen

Der Block wurde Punkt für Punkt technisch abgeglichen und alle unabhängig möglichen Prüfungen ausgeführt. Die tatsächliche Zahlungsfreigabe ist NICHT abgeschlossen. Keine echten Zahlungen, Erstattungen, Produktivmigrationen oder Waren-/Küchenfreigaben wurden ausgelöst. Keine geheimen Werte wurden ausgelesen oder neu angelegt.

Die lokale Ausführungsumgebung war nicht verfügbar. Die Verifikation wurde deshalb über das verbundene GitHub-Werkzeug und GitHub Actions fortgeführt. Der Railway-Inventarversuch lieferte vor Abbruch kein verwertbares Ergebnis; daraus weder eine fehlende Konfiguration noch einen erfolgreichen Kontozugang ableiten. Die vorher abgelehnte Mollie-Browseranmeldung wurde nicht ungefragt wiederholt.

## Alle zehn Punkte

| Nr. | Geprüft / erledigt | Noch offen |
|---|---|---|
| 1 Netcup-Konfiguration | Bestehende authentifizierte Netcup-Statusoperation erfolgreich: bringness-pos, bringness-app, bringness-db und bringness-translate running; Caddy active. Der erlaubte Handler hat nur status/backup/restart/deploy. | Vorhandensein, Modus und Gültigkeit der Mollie-Konfiguration auf Netcup sind damit NICHT geprüft; kein willkürlicher Secret-Zugriff über eingeschränkte SSH-Verbindung. |
| 2 Railway-Abgleich | Frühere Evidenz MOLLIE_API_KEY/Testmodus bleibt erhalten; kein erneutes Anlegen, Ersetzen oder Übertragen vorgenommen. | Der aktuelle Railway-Zugriff/Variablenbestand konnte im abgebrochenen Versuch nicht bestätigt werden. Historischer Key ist keine aktuelle Zugangsgarantie. |
| 3 TEST/LIVE | Produktions-start.js importiert weder shop-mollie-marketplace-integration.js noch shop-mollie-marketplace-live-integration.js. TEST-Host und eigener LIVE-Leser mit unterschiedlichen Bindungen/Intent-Präfixen geprüft; Plattform-Key-Fallback wird abgewiesen. | Tatsächliche geschützte Hostwerte und echter Anbieter-Testmodus nicht durch synthetische Tests nachgewiesen. |
| 4 Händler/Profil | Quellprüfung und Tests verlangen Verkäuferbetrieb, OAuth-Verbindungs-ID, Organisation, Profil und gespeicherte Revision. Separater eigener Plattform-Abopfad verwendet MOLLIE_API_KEY. | Rechtliche Zuordnung eines echten Händlers und gültige OAuth-Zustimmung fehlen. Der alte Bringness-Plattformschlüssel ersetzt sie nicht. |
| 5 Adressen/Webhooks | Bestehender struktureller Abgleich erwartet HTTPS-Ursprung und die drei exakten Pfade unten. Tests für abweichende Adressen, unerlaubte Benachrichtigungen und serverseitige Anbieterprüfung bestanden. | Dashboardregistrierung, reale externe Zustellung und angemeldeter Abgleich bei Mollie bleiben ungeprüft. Kein neuer Webhook angelegt. |
| 6 Trennen/Wiederverbinden | Erneut getestet: spätes OAuth-Callback darf getrennte/ersetzte/abgelaufene Zustimmung nicht wiederbeleben; Tokenrefresh, Sitzungs-/Verkäuferentzug und Wiederholschutz. | Tatsächliches Verbinden/Trennen/Wiederverbinden mit dem echten Händlerkonto nicht durchgeführt. |
| 7 Testbestellung | Verbundener isolierter TEST-Adapter, verlorene Antwort, Wiederherstellung, Worker und einmalige nicht warenfreigebende TEST-Übergabe erneut bestanden. | Keine echte Mollie-Testzahlung erzeugt; kein realer Händler-/Provider-End-to-End-Nachweis. |
| 8 Rechnung/Gebühren/Erstattung | Erneute Tests für Rechnungs-/Gutschriftentwürfe, bestätigte Erstattungen, eindeutige Nummern, atomare Archivierung sowie LIVE-Journal mit nullable Gebühren. Read-only LIVE-Leser initiiert keine Erstattung. | Tatsächliche Gebührenquelle, Fiskalbeleg-/Gutschrift-/DATEV-Verknüpfung und Produktivabnahme bleiben unverbunden. Unbekannte Gebühren bleiben unbekannt. |
| 9 Bestellübergabe/Duplikate | Erneute PostgreSQL-Prüfungen gegen konkurrierende Buchung/Refund/Receipt-Verarbeitung, falsche Bindungen und wiederholte Übergabe; Rückabwicklung unverändert. | Dauerhaft deduplizierender echter Küchen-/Versandempfänger und Produktiv-Statusübergang fehlen. DB-Receipt ist keine garantierte einmalige externe Zustellung. |
| 10 Nachweis/Veröffentlichung | 157 Zahlungssicherheitsprüfungen bestanden, 0 Fehler/0 Skips, frischer GitHub-Lauf inkl. PostgreSQL. Bericht und offene Abnahmebedingungen dauerhaft gesichert. | Keine fachlich vollständig geprüfte Produktiv-Zahlungsänderung vorhanden; daher keine neue App-Bereitstellung oder Zahlungsaktivierung aus diesem Audit. |

## Nachweise

- Netcup-Status: https://github.com/akanal/Bringness-POS/actions/runs/41146951648 ; Job124374166690. Anfragecommit67c1d615c946c80d1a618a1386581149b0abd9f4.
- Frische Zahlungstests: https://github.com/akanal/Bringness-POS/actions/runs/41146988626 ; Job124374283437. 157 passed, fail0, skipped0.
- Auditbranch audit/payment-acceptance-20261030, Commit781f2b5f0b58fdfc28b66dfb5ee9aa9f093aa5e2. Einzige Code-/CI-Änderung dort: vorhandene isolierte payment-safety-Suite zusätzlich beim Push auf audit/payment-acceptance-* ausführen. Kein Produktivstart, keine Secrets und kein Deploymentjob hinzugefügt. Diese CI-Änderung ist nicht nach main übernommen; Anwendungsquelle entspricht dem Ausgangsstand.
- Frühere 713 Shopprüfungen und native Browserabnahmen von PR196 sind historischer, separat dokumentierter Nachweis; sie wurden in diesem reinen Zahlungsaudit nicht erneut als frischer Browserlauf ausgegeben.

## Erwartete Adressen bei publicOrigin=https://bringness.de

- Callback: https://bringness.de/api/v1/shop/marketplace/merchant-callback
- Rückkehr: https://bringness.de/shop/marketplace-payment-return.html
- TEST-Benachrichtigung: https://bringness.de/api/v1/shop/marketplace/checkout-notification

Das sind aus bestehendem Code abgeleitete Erwartungswerte, keine bestätigten Einträge im Anbieter-Dashboard.

## Abgleich mit offiziellen Mollie-Unterlagen

Am30.10.2026 geprüft:
- https://docs.mollie.com/docs/authentication-via-oauth — Händler müssen die Anwendung ausdrücklich berechtigen; neue Berechtigungen benötigen eine erneute Zustimmung. Bestehende TEST-Scopes sind organizations.read profiles.read payments.read payments.write. Für spätere produktive Refund-Lesezugriffe fehlt darin refunds.read; keine stillschweigende Erweiterung.
- https://docs.mollie.com/docs/connect-overview — Mollie unterscheidet Connect for Platforms (Händler ist Zahlungseigentümer, ein Händler je Checkout) und Connect for Marketplaces (Plattform ist Zahlungseigentümer, Routing an mehrere Verkäufer). Das bisher vereinbarte direkte Händlerzahlungsmodell nicht allein wegen des Bringness-Produktnamens „Marktplatz“ auf Plattform-Zahlungseigentum umstellen. Vertragliche Anbieterzuordnung bleibt echte externe Prüfung.
- https://docs.mollie.com/reference/authentication — Plattform-API-Schlüssel und delegierte OAuth-App-Zugänge sind unterschiedliche Zugangswege.
- https://docs.mollie.com/reference/webhooks und https://docs.mollie.com/reference/testing — Anbieterstatus nachprüfen; Testdaten nicht als echten Zahlungseingang behandeln.

## Kleinster notwendiger nächster Beitrag

Ein erlaubter Zugriff, der ausschließlich Konfigurationsbereitschaft/Modus ohne Schlüsselwerte bestätigt, und anschließend der tatsächliche autorisierte Mollie-App-/Händlerabgleich. Der bestehende Server muss nicht neu eingerichtet werden. Passwörter oder API-Schlüssel gehören nicht in den Chat. Auch ein funktionierender eigener API-Key allein beendet weder Händlerabnahme noch Fiskal-/Warenübergabe-Arbeiten.
