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
