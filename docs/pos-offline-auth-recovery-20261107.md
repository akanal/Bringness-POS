# Windows POS: Anmeldung beim Offline-Abgleich

Stand: 07.11.2026. Desktop-Version 0.2.4, PR264.

## Verhalten

Die native Windows-Kasse erhält den HTTP-Status abgewiesener Offline-Anfragen, auch wenn die Fehlerantwort kein JSON enthält. Eine abgelaufene Online-Sitzung (401) fordert zur erneuten Anmeldung in der Online-Kasse auf. Fehlende Berechtigungen (403) melden die erforderliche Prüfung durch den Inhaber. Serverdiagnosen werden dabei nicht als Fehlermeldung an die Oberfläche weitergegeben.

Die offene lokale Warteschlange bleibt bestehen. Keine neue Verkaufskennung, kein erneutes Kassieren und kein Löschen von Barverkäufen. Nach erneuter Anmeldung werden ausschließlich unbestätigte Verkäufe mit ihrer ursprünglichen Kennung abgeglichen. Bereits bestätigte Belege bleiben bestätigt, auch wenn nur die nachfolgende Katalogaktualisierung die Anmeldung oder Berechtigung ablehnt. Ein solcher Durchlauf erhält keinen neuen erfolgreichen Gesamtzeitpunkt. Verlorene Antworten behalten die vorhandene idempotente Wiederholung bei.

Keine geänderten Rollen, Gerätefreigaben, Offline-Laufzeiten, Lizenzbedingungen oder Zahlungsverfahren. Keine Änderungen an Markt, AI oder dem Online-Kassenlayout. Diese Änderung gehört zur installierten Windows-Anwendung und wird erst durch eine passende installierte Version wirksam.

## Prüfung und Auslieferung

Lokal: 51 Desktop-Tests erfolgreich. Neue Fälle prüfen 401/403 mit unveränderter Warteschlange, erneute Anmeldung, abgelehnte Katalogaktualisierung nach bestätigtem Verkauf sowie Sitzungsablauf nach den ersten 20 von 25 bestätigten Verkäufen. Syntax und Diff-Prüfung erfolgreich.

Alle fünf PR-Prüfungen erfolgreich: Windows-Build42397512774/job128477965882, tatsächlicher Electron-/HTTP-Abgleich42397512767/job128477966021, POS/AI42397512785, checks42397512766, release42397512818. Im echten Electron-Test werden lokale SQL-Daten und der tatsächliche HTTP-Handler verwendet: TCP-Abbruch vor/nach Commit, Neustart der Anwendung, ursprüngliche Verkaufskennungen, 401/403, erneute Anmeldung, 503 und Geräteentzug; drei Test-Barverkäufe werden genau einmal importiert.

Feature164c68095947040a7d8bb73fbcbb90cc9887b7f0 / Tree0327bd5c2489839869059bb27be2af0b49b52f65 / Mergeb13a737d1676ed5b4f256511e56cfe23690307c6. Der PR-Build erstellt Bringness-POS-Setup-0.2.4.exe; Artefakt13583927880 heißt Bringness-POS-Windows-signed-false. Die Veröffentlichung behält eine gültige Authenticode-Signatur als Voraussetzung. Ein unsignierter Test-Build ersetzt keinen öffentlichen Installer.

Keine Netcup-Bereitstellung: ausschließlich Desktop-Quellen geändert. Die öffentliche Online-Kasse bleibt auf ihrem vorhandenen geprüften Stand; die installierte Windows-Kasse benötigt einen passenden Installer.

Echte Windows-Neustarts, Installation auf dem Betreibergerät, physische 58-/80-mm-Drucker und zertifizierte Offline-TSE bleiben eigene Abnahmepunkte. Keine echten Zahlungen oder produktiven Konten für diese Prüfung verwenden.

Main-Windows-Build42397741911/job128478660950 ebenfalls erfolgreich; Artefakt13584272268 weiterhin signed-false. Schritt Publish latest installer asset ausdrücklich übersprungen; öffentlicher Installer nicht ersetzt.
