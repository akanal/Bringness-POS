# Händlerfreigabe: nächster Zwanzigerblock

Aufbauend auf PR #164. Der Auftrag, die nächsten zwanzig Punkte abzuarbeiten, wird hier als zusammenhängender Händlerfreigabe-Block umgesetzt. Dies sind zwanzig konkrete Arbeits-/Prüfpunkte, keine Behauptung von zwanzig eigenständigen Produktionssystemen.

| Nr. | Umsetzung |
| --- | --- |
| 1 | Eigenen Freigabestand geschützt laden |
| 2 | Geschäftlichen Namen erfassen |
| 3 | Geschäftliche Adresse und Ländercode validieren |
| 4 | Öffentliche geschäftliche E-Mail validieren |
| 5 | Ausdrückliche Zustimmung zur späteren Veröffentlichung |
| 6 | Antrag ohne automatische Freigabe speichern |
| 7 | Firmen- und Rollenbindung auf dem Server |
| 8 | Dauerhafte Anfragekennung für identische Wiederholung |
| 9 | Veraltete Revisionen und abweichende Wiederholungen abweisen |
| 10 | Superadmin-Berechtigung je Anfrage prüfen |
| 11 | Händlerprüfliste in begrenzten Seiten laden |
| 12 | Konkreten Händler und aktuellen Stand zur Prüfung öffnen |
| 13 | Manuelle Prüfung vor Freigabe ausdrücklich bestätigen |
| 14 | Freigabe mit Begründung und interner Referenz speichern |
| 15 | Antrag begründet ablehnen |
| 16 | Abgelehnten Antrag korrigieren und neu einreichen |
| 17 | Händler sperren und öffentliche Angebote atomar zurückziehen |
| 18 | Händler nach erneuter Prüfung freigeben, ohne Angebote automatisch zu veröffentlichen |
| 19 | Unveränderliche Ereignishistorie, Transaktionsrücknahme und private Ansichten absichern |
| 20 | Service-, UI-, Wiederholungs-, PostgreSQL-Konkurrenz- und Browserprüfung verbinden |

## Bedienung

Händler: `/shop/marketplace-seller.html`, Abschnitt Händlerfreigabe. Daten erst ausdrücklich laden, dann Antrag senden. Abgelehnte Anträge können korrigiert werden. Freigegebene oder gesperrte Profile werden nicht vom Händler selbst überschrieben; ein gesonderter Änderungs-/Nachprüfprozess bleibt offen.

Plattform: `/shop/marketplace-review.html`. Nur bestehende aktive `platform_admins` mit aktiver Sitzung. Es wird weder eine Superadmin-Rolle erzeugt noch eine reale Firma automatisch freigegeben. Begründungen sind für den jeweiligen Händler sichtbar; interne Referenzen und Akteurskennungen nur für Plattformadministratoren. Die Seiten übernehmen das bestehende Shop-Design; POS/Kellner bleiben unverändert.

Sperrung zieht bestehende Angebots-Snapshots zurück und erhöht deren Revision. Wiederfreigabe setzt ausschließlich den Händlerstatus zurück; jedes Angebot muss ausdrücklich neu veröffentlicht werden. Bestände und bestehende Bestellungen bleiben erhalten. Bestehende, zuvor administrativ provisionierte Händler bleiben kompatibel. Historische Pending-Profile ohne Antrag können nicht ohne neuen Antrag freigegeben werden.

## Grenzen

Manuelle Datenprüfung ist eine dokumentierte Administratorentscheidung, keine automatische Identitäts-, Steuer-, Rechts- oder Zahlungsanbieterprüfung. Keine Ausweis-/Bankdaten hochladen. Kein automatischer KYC-Check oder externes Register. Anbieteranbindung, echte Zahlungen, Auszahlungen, Erstattungen, Rechnungen und tatsächliche Versanddienstleistungen sind weitere eigenständige Arbeit; sie werden von diesem Block weder simuliert noch als fertig bezeichnet. `SHOP_MARKETPLACE_ENABLED` bleibt standardmäßig deaktiviert. Keine Produktionsfreigabe, Zusammenführung oder Bereitstellung durch diesen Block.

## Prüfung

Neue lokale Service- und UI-Prüfungen bestanden zunächst (9 + 7 neue Tests sowie 7 bestehende Client-Tests). Vollständige Shop-Suite und unabhängige PostgreSQL-/Chrome-Prüfung folgen am finalen Code-Commit. Browserdownload lokal fehlgeschlagen; keine lokale native Browserabnahme behauptet. CI verwendet den vorhandenen nativen Chrome und die leere, ausdrücklich dafür reservierte PostgreSQL-Datenbank.
