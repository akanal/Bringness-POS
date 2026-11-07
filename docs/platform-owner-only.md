# Persönlicher Plattformzugang

Eigentümerauftrag 07.11.2026: ausschließlich das persönliche Eigentümerkonto darf den zentralen Superadmin für Markt, POS und AI benutzen. Die drei Produkte und ihre normalen Betriebszugänge bleiben getrennt. Künftige Lizenznehmer erhalten nur ausdrücklich zugewiesene Betriebs-/Lizenzrechte; eine Betriebsrolle, Lizenz oder Zahlung erzeugt niemals einen Plattformzugang.

## Durchsetzung

`server/platform-owner.js` bindet die unveränderliche Benutzer-ID in `platform_owner`, nicht E-Mail, Namen oder Firmenrolle. Die bestehenden serverseitigen Markt-, POS-, AI-, Lizenz-, Fernhilfe- und Supportprüfungen lesen weiterhin `platform_admins`. Ein Datenbanktrigger erlaubt dort nur dem gebundenen Konto einen aktiven Plattformgrant. Ein zusätzlicher eindeutiger Index verhindert mehrere aktive Grants. Die zentrale Bindung kann weder über normale Kontoänderungen noch durch Löschen/Sperren und erneute Einrichtung übertragen werden. Die referenzierte Benutzeridentität kann nicht versehentlich gelöscht werden.

Bei der erstmaligen Migration wird ausschließlich eine bereits vorhandene, eindeutig einzelne aktive Plattformfreigabe übernommen. Bei mehreren aktiven Freigaben oder widersprüchlicher Bindung bricht die Migration vollständig zurückgerollt ab. Es wird weder der erste Datensatz noch eine vermutete E-Mail ausgewählt. Ein solcher Konflikt verlangt eine geschützte Eigentümerbestätigung vor dem Rollout; keine stillschweigende Aussperrung oder Übernahme.

Nur bei einer bislang vollständig ungebundenen Installation bleibt die bestehende Einrichtung mit aktiver Sitzung und serverseitigem Bootstrap-Geheimnis verfügbar. Transaktion, Tabellensperre, Trigger und Index serialisieren konkurrierende Anfragen. Nach der Bindung bleibt Einrichtung dauerhaft gesperrt, auch wenn die Plattformfreigabe deaktiviert wurde. Eine Eigentümerübertragung ist kein Web-/Lizenznehmer-Endpunkt und würde gesonderte geschützte Betriebswiederherstellung erfordern.

Eine Lizenznehmerverwaltung mit Gebietszuweisung, Preisen oder Vertragsbedingungen wird hierdurch nicht erfunden oder aktiviert. Vorhandene Lizenz-/Modulsteuerung bleibt dem Eigentümer vorbehalten. Keine Änderungen an Produktfarben, Kopfzeilen, Kassenvorgängen oder Kundendaten.

## Prüfung und Grenzen

`server/ai-tests/platform-owner.mjs` prüft echte SQL-Trigger und Transaktionen: bestehende Identität, wiederholte Migration, andere Firmenrollen, Manipulation/Entfernung der Bindung, Schutz vor Benutzerlöschung, E-Mail-Änderung ohne Identitätswechsel, abgelaufene Sitzungen, unmittelbaren Rechteentzug und verweigerte Neueinrichtung. PostgreSQL-CI prüft zusätzlich gleichzeitige erstmalige Einrichtung. Mehrdeutige Altfreigaben bleiben bei abgebrochener Migration unverändert.

`/health` meldet nur `platformOwner: bound` oder `not_configured`, keine Benutzer-ID/E-Mail oder geheimen Werte. Die öffentliche Anmeldeseite darf weiterhin erreichbar sein; geschützte Inhalte und Aktionen benötigen die autorisierte Sitzung. Die Kontobindung ersetzt keine zweite Anmeldebestätigung: Die Einrichtung für die Zwei-Faktor-Anmeldung ist inzwischen ergänzt, siehe [Eigentümer-MFA](platform-owner-mfa.md). Die persönliche Aktivierung erfordert die eigene Bestätigung per Handy-Code. Wer eine gültige Eigentümersitzung besitzt, nutzt technisch dieselbe Identität; die bestätigte Zwei-Faktor-Aktivierung schützt die Ausstellung neuer Sitzungen zusätzlich. Keine absolute Zusage gegen Server-/Datenbankbetreiber oder gestohlene Eigentümerzugänge.


## Release-Nachweis

PR255 wurde nach sechs erfolgreichen CI-Prüfungen als `c273824cfcaf012c47aed6ad6769145efbdfa513` übernommen und über Netcup42373573994/job128406488899 exakt eingespielt. Frische Sicherung42211075899/job128404461539 bestätigt; vorheriger Container und Datenbanksicherung behalten. Live meldet `/health` HTTP200/no-store und `platformOwner: bound`; die geprüften zentralen Markt-/POS-/AI-APIs verweigern Zugriffe ohne Anmeldung mit401/403 und no-store. Die drei öffentlichen Anmeldeseiten bleiben erreichbar. Keine echte Eigentümersitzung oder privaten Kontoinhalte zur Abnahme ausgelesen. 701 allgemeine lokale Tests,788 Marktplatztests, PostgreSQL-Konkurrenz und native Browserprüfungen erfolgreich. Die persönliche Zwei-Faktor-Aktivierung wird nicht öffentlich abgefragt; die neue Einrichtung ist in platform-owner-mfa.md beschrieben.
