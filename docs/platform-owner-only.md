# Persönlicher Plattformzugang

Eigentümerauftrag 07.11.2026: ausschließlich das persönliche Eigentümerkonto darf den zentralen Superadmin für Markt, POS und AI benutzen. Die drei Produkte und ihre normalen Betriebszugänge bleiben getrennt. Künftige Lizenznehmer erhalten nur ausdrücklich zugewiesene Betriebs-/Lizenzrechte; eine Betriebsrolle, Lizenz oder Zahlung erzeugt niemals einen Plattformzugang.

## Durchsetzung

`server/platform-owner.js` bindet die unveränderliche Benutzer-ID in `platform_owner`, nicht E-Mail, Namen oder Firmenrolle. Die bestehenden serverseitigen Markt-, POS-, AI-, Lizenz-, Fernhilfe- und Supportprüfungen lesen weiterhin `platform_admins`. Ein Datenbanktrigger erlaubt dort nur dem gebundenen Konto einen aktiven Plattformgrant. Ein zusätzlicher eindeutiger Index verhindert mehrere aktive Grants. Die zentrale Bindung kann weder über normale Kontoänderungen noch durch Löschen/Sperren und erneute Einrichtung übertragen werden. Die referenzierte Benutzeridentität kann nicht versehentlich gelöscht werden.

Bei der erstmaligen Migration wird ausschließlich eine bereits vorhandene, eindeutig einzelne aktive Plattformfreigabe übernommen. Bei mehreren aktiven Freigaben oder widersprüchlicher Bindung bricht die Migration vollständig zurückgerollt ab. Es wird weder der erste Datensatz noch eine vermutete E-Mail ausgewählt. Ein solcher Konflikt verlangt eine geschützte Eigentümerbestätigung vor dem Rollout; keine stillschweigende Aussperrung oder Übernahme.

Nur bei einer bislang vollständig ungebundenen Installation bleibt die bestehende Einrichtung mit aktiver Sitzung und serverseitigem Bootstrap-Geheimnis verfügbar. Transaktion, Tabellensperre, Trigger und Index serialisieren konkurrierende Anfragen. Nach der Bindung bleibt Einrichtung dauerhaft gesperrt, auch wenn die Plattformfreigabe deaktiviert wurde. Eine Eigentümerübertragung ist kein Web-/Lizenznehmer-Endpunkt und würde gesonderte geschützte Betriebswiederherstellung erfordern.

Eine Lizenznehmerverwaltung mit Gebietszuweisung, Preisen oder Vertragsbedingungen wird hierdurch nicht erfunden oder aktiviert. Vorhandene Lizenz-/Modulsteuerung bleibt dem Eigentümer vorbehalten. Keine Änderungen an Produktfarben, Kopfzeilen, Kassenvorgängen oder Kundendaten.

## Prüfung und Grenzen

`server/ai-tests/platform-owner.mjs` prüft echte SQL-Trigger und Transaktionen: bestehende Identität, wiederholte Migration, andere Firmenrollen, Manipulation/Entfernung der Bindung, Schutz vor Benutzerlöschung, E-Mail-Änderung ohne Identitätswechsel, abgelaufene Sitzungen, unmittelbaren Rechteentzug und verweigerte Neueinrichtung. PostgreSQL-CI prüft zusätzlich gleichzeitige erstmalige Einrichtung. Mehrdeutige Altfreigaben bleiben bei abgebrochener Migration unverändert.

`/health` meldet nur `platformOwner: bound` oder `not_configured`, keine Benutzer-ID/E-Mail oder geheimen Werte. Die öffentliche Anmeldeseite darf weiterhin erreichbar sein; geschützte Inhalte und Aktionen benötigen die autorisierte Sitzung. Die Kontobindung ersetzt keine zweite Anmeldebestätigung: Zwei-Faktor-Authentifizierung ist mit dieser Änderung noch nicht eingerichtet. Wer das Passwort bzw. eine gültige Sitzung des Eigentümers besitzt, ist technisch derselbe Zugang. Keine absolute Zusage gegen Server-/Datenbankbetreiber oder gestohlene Eigentümerzugänge.
