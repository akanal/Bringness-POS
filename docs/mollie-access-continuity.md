# Mollie – Konfiguration und Fortsetzung

Stand: 2026-10-31

## Nutzerentscheidung

Ein bereits bereitgestellter Mollie-API-Zugang soll weiterverwendet werden. Den Nutzer nicht erneut zur Eingabe auffordern, bevor die vorhandene sichere Serverkonfiguration und die verfügbaren Secrets geprüft wurden. Konfiguration und geprüften Speicherort hier dokumentieren, niemals Zugangsdaten selbst.

## Bekannter Stand

- Laut Nutzer wurde bereits ein API-Zugang bereitgestellt. Speicherort, Gültigkeit und Nutzung durch Bringness sind noch nicht technisch verifiziert.
- Im vorherigen Gespräch wurde eine erfolgreiche Dashboard-Anmeldung beim Konto Bringness-pos berichtet. Das ist kein Nachweis einer derzeit verfügbaren Sitzung oder funktionierenden API-Verbindung.
- Zuletzt berichteter Dashboard-Stand: Bankverifizierung in Überprüfung; Website/Geschäftstätigkeit mit erforderlichen Maßnahmen. Erneute Prüfung erforderlich.

## Noch zu prüfen

1. Vorhandene Mollie-Konfiguration im Backend und in der Netcup-Laufzeit lokalisieren, ohne Secret-Werte in Logs oder Dokumentation auszugeben.
2. Vorhandensein und Test-/Live-Modus feststellen; API-Verbindung ohne Abbuchung prüfen.
3. Bestätigten Konfigurationsnamen und sicheren Speicherort dokumentieren. GitHub-Secrets nur verwenden, wenn der bestehende Deploymentprozess sie benötigt; keine unnötige Kopie anlegen.
4. Testergebnis und verbleibende Einrichtungsschritte ergänzen.

Diese Dokumentation speichert keine Browseranmeldung und bestätigt noch keine dauerhafte API-Anbindung.

## Fortsetzung: bestätigte Angaben und Codeprüfung

- Der Eigentümer bestätigt ausdrücklich, dass der vorhandene API-Schlüssel auf dem Server hinterlegt ist. Das ist eine Nutzerbestätigung, keine technische Prüfung der aktuellen Laufzeit.
- Historische Übergabe in docs/PROJECT-HANDOFF.md nennt MOLLIE_API_KEY auf Railway sowie früheren Testmodus; daraus keine aktuelle Netcup-Gültigkeit ableiten.
- Geprüfter Quellcode server/shop-mollie-marketplace-host.js lädt für den TEST-Marktplatz SHOP_MARKETPLACE_PUBLIC_ORIGIN, SHOP_MARKETPLACE_MOLLIE_CLIENT_ID, SHOP_MARKETPLACE_MOLLIE_CLIENT_SECRET und SHOP_MARKETPLACE_TOKEN_KEY sowie SHOP_MARKETPLACE_CALLBACK_URL, SHOP_MARKETPLACE_RETURN_URL und SHOP_MARKETPLACE_WEBHOOK_URL. Aktivierung benötigt zusätzlich die vorhandenen Host-/Testschalter und passende Laufzeitbedingungen.
- server/shop-mollie-marketplace-preflight.js prüft ausschließlich die Struktur. providerVerified und productionReady bleiben ausdrücklich false; der Check kontaktiert keinen Anbieter. Ein Plattform-API-Schlüssel ersetzt diese Händler-OAuth-Konfiguration nicht.
- Der vorhandene eingeschränkte Netcup-SSH-Handler stellt status/backup/restart/deploy bereit, keine freie Prüfung geschützter Variablen. Grenze erhalten. Ein tatsächlicher Mollie-Verbindungstest wurde in dieser Fortsetzung nicht ausgeführt.
- Nächste technische Abnahme: erlaubte, ausschließlich sanitisierte Laufzeitdiagnose für vorhandene Schlüssel und die getrennte Händler-OAuth-Konfiguration; keine Zahlungen, keine Secret-Ausgabe und keine automatische LIVE-Aktivierung.
