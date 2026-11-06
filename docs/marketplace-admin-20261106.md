# Zentrale Marktplatzverwaltung

Einstieg nach Bereitstellung: `/superadmin/` → Marktplatz. Nur bestehende aktive Plattformadministratoren; keine neue Rollenvergabe. Der Marktplatz benutzt die bestehende Plattform-Sitzung, nicht das möglicherweise parallel angemeldete Händlerkonto.

- Händler: bestehende paginierte Händlerprüfung mit Profil, Historie, Freigeben/Ablehnen/Sperren/Wiederfreigeben, Prüfbestätigung und identischem Wiederholen einer unbestätigten Entscheidung. Bestehende Sperr-/Veröffentlichungsregeln unverändert.
- Rechtliche Informationen: sechs aufklappbare Textbereiche, bestehende gekennzeichnete Texte als Anfangsentwurf. Entwurf speichern, lokale Textvorschau, gespeicherten Text ausdrücklich prüfen und separat veröffentlichen. Kein HTML-Editor; HTML wird ausschließlich als Text dargestellt. Bis zur Veröffentlichung bleibt der vorherige öffentliche Text erhalten; noch nicht publizierte Bereiche behalten ihre statischen Entwürfe.
- Übersicht: Einstiege und ausdrücklich noch nicht eingerichtete Marktplatz-Lizenzen. Keine Gebietsrechte, Vergütung, Partnerrollen oder automatische Abrechnung erfunden. Angebote/Bestellungen erhalten keine neuen administrativen Schreibaktionen.

Private Inhalte werden bei Konto-/Seiten-/Sichtbarkeitswechsel geschlossen. Offene Entwürfe warnen vor bewusstem Navigieren. Netzwerkfehler lassen identisches Wiederholen zu; ein neuer gespeicherter Stand kann nach ausdrücklichem Verwerfen erneut geladen werden. Versionskonflikte überschreiben keine neueren Texte. Datenbankspeicherung enthält Entwurf, veröffentlichten Text, Zeitpunkt, Actor/Revision/Aktion und Anfragebelege. Keine produktiven Textinhalte werden durch Codebereitstellung automatisch veröffentlicht. Die vorhandene globale Kennzeichnung als rechtlicher Entwurf und die separaten Handels-/Zahlungssperren bleiben erhalten.

Neue Routen: GET/POST `/api/v1/platform/marketplace/legal`, öffentliches GET `/api/v1/shop/legal`. Jede private Anfrage prüft aktive Plattformmitgliedschaft, aktive/unabgelaufene Sitzung und Passwortwechselstatus. Schreibzugriffe benötigen passenden Origin, JSON, begrenzten Body und geprüfte Revision; Veröffentlichung muss den exakt gespeicherten Entwurf bestätigen. Transaktionale Sperren und dauerhafte Anfragebelege verhindern doppelte/widersprüchliche Wiederholungen.

Prüfung: SQL-/HTTP-Regression mit isoliertem PGlite; UI-/XSS-/Kontowechselprüfung; vorhandene Händlerprüfungsregression. Native Browserprüfung mit tatsächlichem Produktionseinstieg und disposable PostgreSQL in Shop-CI: zentrale Navigation, Plattformtoken, Entwurf, Veröffentlichung, Händlerliste und öffentliche Textübernahme bei 390/1280 px. Screenshots enthalten nur synthetische CI-Daten.

Wegen der vom Eigentümer gemeldeten Netcup-Störung zunächst als geprüften Pull Request bereitstellen; keine Bereitstellung während der Störung behaupten.
