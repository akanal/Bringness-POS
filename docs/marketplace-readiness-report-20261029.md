# Ausführbarer lokaler Marktplatz-Prüfbericht — 29.10.2026

Fortsetzung von PR182 unter Erhalt seiner geprüften OAuth-Lebenszykluskorrektur.
Dieser Block macht die vorhandene reine Vorprüfung aus PR181 als
begrenzten, maschinenlesbaren CLI-Bericht nutzbar. Er führt keine Host- oder
Anbieterabnahme aus und aktiviert keinen Zahlungsweg.

## Zehn zusammenhängende Bestandteile

1. Vorhandene Konfigurationskontrolle aus PR181 wiederverwenden.
2. Eigenständigen lokalen Bericht mit versioniertem JSON-Schema bereitstellen.
3. Nur die vier vorhandenen Konfigurationsfelder und drei Vergleichsadressen
   akzeptieren; zusätzliche Felder und gefälschte Freigaben ablehnen.
4. Geschützte Eingaben ausschließlich über Standardeingabe einlesen.
5. Argumente ablehnen; keine automatische Suche nach Umgebungsvariablen,
   Hostdateien, Datenbank oder Schlüsseln.
6. Eingabe auf 16384 Bytes begrenzen und ungültiges UTF-8 ablehnen.
7. Syntax-/Lesefehler mit festen Fehlercodes melden, ohne Exceptiontext oder
   Inhalte auszugeben.
8. Strukturelle Konfiguration und exakte Adressvergleiche separat ausweisen.
9. Geheimwerte, eingereichte Adressen und frei gewählte Feldnamen aus der Ausgabe
   ausschließen; unbestätigte Produktivvoraussetzungen ausdrücklich aufführen.
10. Echte Unterprozessprüfungen für Exitcodes, fehlerhafte/übergroße Eingaben,
    Geheimhaltung und Umgebungsunabhängigkeit ergänzen.

## Geschützter Aufruf

Der autorisierte Hostprozess kann die bereits sicher verwahrte Konfiguration als
JSON an `node ops/shop/marketplace-readiness.mjs` über Standardeingabe übergeben.
Das Werkzeug legt keine Konfigurationsdatei an und liest insbesondere keine
`app.env`, IDrive-Konfiguration oder Recovery-Schlüssel. Keine Zugangsdaten im
Chat, in Shellargumenten, Beispieldateien, Logs oder Git ablegen. Bestehende
SSH-Funktionsgrenzen gelten weiter; dieser Bericht erweitert sie nicht.

Eingabeform: Objekt mit `config` und `registration`, jeweils Objekte mit optionalen
Stringfeldern. `config`: `publicOrigin`, `clientId`, `clientSecret`, `tokenKey`.
`registration`: `callbackUrl`, `returnUrl`, `webhookUrl`. Fehlende Stringfelder
werden als fehlgeschlagene lokale Checks gemeldet. Unbekannte Felder, Arrays,
primitive Werte und Nicht-Stringwerte sind Schemafehler. Das CLI erwartet EOF;
es ist für eine geschützte Pipeline vorgesehen, nicht für Geheimwerte als
interaktive Konsoleneingabe.

| Exitcode | Aussage |
|---|---|
| 0 | Alle acht lokalen Struktur-/Vergleichschecks bestanden |
| 2 | Gültige Eingabeform, aber lokale Checks fehlgeschlagen |
| 1 | Ungültige, zu große oder nicht lesbare Eingabe bzw. unerlaubte Argumente |

`status=local_checks_passed` und Exitcode0 sind **keine Produktivfreigabe**.
`providerVerified`, `merchantAccepted`, `productionReady`, `canPay`, `canFulfil`
bleiben falsch. Die Anbieteradressen werden nur mit den vom Operator übergebenen
Werten verglichen; es erfolgt kein externer Abruf. Keine öffentliche Diagnose-API,
neue Abhängigkeit, Datenbankmigration, Hoständerung oder Workeraktivierung.

Der Bericht markiert geschützte Hostkonfiguration, Schlüsselstabilität und
Tokenentschlüsselung, tatsächliche Anbieterregistrierung, echte Händlerzustimmung,
Host-Scheduler, produktive Buchung/Erstattungen und reale Waren-/Küchenfreigabe
als unbestätigt. Er behauptet weder, dass diese Voraussetzungen fehlen, noch,
dass sie extern geprüft wurden. Synthetische Testdaten ersetzen keine Abnahme.

## Prüfung

- Neue Bericht-/Unterprozesstests:6 bestanden; zusammen mit vorhandener
  Konfigurationskontrolle13 bestanden, keine Fehler oder Skips.
- Allgemeine lokale Suite:675 bestanden, keine Fehler oder Skips.
- Vollständige lokale Shop-Suite:705 bestanden, keine Fehler oder Skips.
- Vollständige lokale Zahlungssuite:134 bestanden, keine Fehler, zwei
  PostgreSQL-Prüfungen lokal übersprungen und durch GitHub abgedeckt.
- Anwendungsstand9765eaed6244348e4e87609a1c0c92297cdedc73,
  Tree85ca5d988853b955044309cffa6a9b7bfe61d608, PR183 auf PR182.
- GitHub-Zahlung40984974520/job123833762046:136 bestanden, keine Fehler oder
  Skips, einschließlich realer PostgreSQL-Parallel-/OAuth-Prüfungen und der
  neuen echten CLI-Unterprozesse.
- GitHub-POS/AI40984974723/job123833762708 und isolierte Vorschau
  40984974648/job123833762363 einschließlich verschlüsselter Sicherung und
  Wiederherstellung erfolgreich.
- GitHub-Shop40984974644/job123833762282 erfolgreich:705 Shopprüfungen,
  nativer geschützter Händler-/Kunden-HTTPS-Browserablauf bei390/768/1280 und
  tatsächlicher Anwendungsstart mit isolierter PostgreSQL-Datenbank und
  vorhandenen Browser-/Mandanten-/Parallelitätsprüfungen bestanden.
- Alle vier maßgeblichen GitHub-Prüfläufe auf dem obigen Anwendungsstand
  erfolgreich. Anschließender Prüfbericht ändert ausschließlich Dokumentation.
- Kein Merge, Deployment, echter Anbieterzugriff oder tatsächliche Hostprüfung.
