# Privates Repository: vorbereiteter Umstieg, noch nicht aktiviert

## Tatsächlicher Stand

Eigentümer beauftragt Privatstellung unter Erhalt aller Funktionen. Das Repository akanal/Bringness-POS ist bei Prüfung weiterhin öffentlich. Bestehende Netcup-Deployments laden Quellarchive ohne Anmeldung von codeload.github.com. Aktuelle Website/Container laufen unabhängig davon; künftige öffentliche Archivabrufe würden nach Privatstellung scheitern. Windows-Veröffentlichung ist weiterhin gesperrt; vorhandene alte GitHub-Release-Downloadpfade sind kein Nachweis eines privaten Windows-Auslieferungswegs. Einmalige ältere IDrive-Installationsskripte nutzen ebenfalls öffentliche Rohdateien; laufende IDrive-Speicherung wird durch diese Änderung nicht umgebaut.

Die bestehende GitHub-Verbindung kann die Repository-Sichtbarkeit nicht verwalten. Die eingerichtete Netcup-SSH-Verbindung ist absichtlich auf status/backup/restart/deploy beschränkt; sie darf keine beliebigen Root-Installationsbefehle ausführen. Diese Grenze nicht durch geänderte Shellfragmente oder Zugriff auf Geheimnisse umgehen. Keine Passwörter/Tokens im Chat oder Repository hinterlegen.

## Vorbereitete Änderung

GitHub Actions checkt den gewünschten Commit mit den bestehenden GitHub-Berechtigungen aus und erzeugt git archive mit festem source/-Präfix. Das Archiv enthält keine .git-Daten oder Actions-Zugangsdaten. Vor dem Deploy aktuelle Serverfähigkeit ssh-archive-v1 über bestehenden status-Befehl prüfen; alter Handler stoppt vor jeder Bereitstellung. SHA256/Bytezahl und exakten Commit als festen deploy-source-Befehl übertragen, Archiv ausschließlich im verschlüsselten SSH-Standardinput. Kein dauerhaftes GitHub-Passwort auf Netcup.

Server prüft Länge/Hash/Commitmetadaten und begrenzt Archiv-/Dateigröße, Dateizahl und entpackten Inhalt. Pfadüberschreitungen, fremde Präfixe, Links, Spezialdateien, doppelte Namen und unvollständige Quellen abweisen. Erst danach bestehende Tests, Sicherung, Kandidatencontainer und Rückfallablauf nutzen. Alte deploy-Befehle bleiben während des kontrollierten Übergangs kompatibel.

## Noch notwendige administrative Schritte

1. Über autorisierten Netcup-Root-Zugang eine frische Sicherung und aktuellen Zustand prüfen. Installer, Handler und Python-Empfänger aus dem unten geprüften Entwurfscommit lokal bereitstellen; Hashes vergleichen. Installer zuerst prüfen, dann mit bash aufrufen. Kein bestehender Schlüssel oder App-Container wird dabei ersetzt.
2. Die beiden Serverdateien mit dem einmaligen Installer installieren. Er bewahrt den bisherigen Handler für Rückkehr auf und verwendet die bestehende Operations-Sperre. Ein öffentlich erreichbares Skript nicht ungeprüft direkt in eine Root-Shell pipen.
3. Über bestehenden authentifizierten status-Befehl Source transfer: ssh-archive-v1 bestätigen. Erst dann diese Workflowänderung nach erfolgreichen CI zusammenführen und eine POS-Bereitstellung über SSH-Archiv vollständig verifizieren. AI-Transport ist mit Fixtures geprüft; tatsächliche AI-Bereitstellung vor einem uneingeschränkten Nachweis ebenfalls gezielt prüfen.
4. Mit GitHub-Adminzugriff die Sichtbarkeit unter Settings → Danger Zone → Change repository visibility auf Private ändern. Nicht allein aufgrund dieses vorbereiteten Codes als erledigt melden.
5. Öffentliche/abgemeldete Repository-Abfrage verweigert, berechtigter Zugriff/Actions-Checkout weiterhin möglich; erneute Bereitstellung mit privater Quelle, Website-/Gesundheitsprüfung und bestehende Sicherung prüfen. Keine neuen kostenpflichtigen Dienste einrichten.

Eine frühere Offenlegung oder fremde Kopien werden durch Privatstellung nicht rückgängig gemacht. Veröffentlichungstermine für eine patentrechtliche Prüfung getrennt festhalten.

## Geprüfte Installationsdateien

- netcup-command.sh: `327fd85c28ba88bebfecd5a20fe9fcc6ddd72fcdd7f28116bdb111d963138c34`
- netcup-source.py: `4454ab796b9310a1268fede0203a270df664e3a2d60133087f137b37a10d6e71`
- install-private-source-access.sh: `4aefe5c5e1d71697c3f4c71b8f1ceef8d72d35bc3b63e0f982a904c6514e6ea1`

Aufruf bei lokal vorhandenen Dateien im Verzeichnis /root/bringness-private-source:

```bash
bash /root/bringness-private-source/install-private-source-access.sh /root/bringness-private-source 327fd85c28ba88bebfecd5a20fe9fcc6ddd72fcdd7f28116bdb111d963138c34 4454ab796b9310a1268fede0203a270df664e3a2d60133087f137b37a10d6e71
```

## Nachweise und Grenze

Lokal21 Tests erfolgreich:11 Archiv-/Sicherheitsfälle einschließlich echtem git archive,6 Server-/Container-Rückfallfälle und4 Workflow-/SSH-Fälle. Shellsyntax geprüft. Eigene CI prüft dieselben Fälle ohne Produktivzugang. Test-SSH und Testcontainer sind simuliert; auf dem tatsächlichen Netcup-Server wurde der neue Handler noch nicht installiert. Deshalb Entwurf, keine Zusammenführung und keine Privatstellung ohne den oben beschriebenen administrativen Abschluss.
