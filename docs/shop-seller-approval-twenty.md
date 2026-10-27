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

Anwendungs-/Prüfcommit `beb9571a172f388b30525b464505bb1aa7ed17a0` in PR #165 besteht alle drei relevanten Workflows:

- Shop-Integration 40577226646 / Job 122446792782: 663 Tests, keine Fehler/übersprungenen Tests; tatsächlicher Anwendungseinstieg mit PostgreSQL und nativem Chrome erfolgreich.
- Expliziter Händlerantrag, manuelle Freigabe, verlorene Freigabeantwort und identische Wiederholung bei 390/768/1280. Zwei gleichzeitige verschiedene Sperrentscheidungen ergeben genau einen Erfolg und einen Revisionskonflikt; identische parallele Wiederfreigaben bleiben eine Mutation.
- Bestehende Angebots-/Bestell-/Bestands-/Stornoabläufe bleiben erfolgreich. Zusätzliche Testkonten werden nur in der zuvor nachweislich leeren Loopback-Datenbank angelegt; das echte Registrierungslimit bleibt unverändert.
- POS/AI-Integration 40577226633 erfolgreich; isolierte Gesamtanwendung 40577226711 einschließlich Browser, Netzwerksperre sowie verschlüsselter Sicherung/Wiederherstellung erfolgreich.
- Browserartefakt 12766894194; mobile Händler- und Prüfseiten sowie Desktop-Prüfseite visuell kontrolliert. Der Superadmin-Einstieg steht im Freigabeabschnitt, damit die mobile Kopfzeile nicht überläuft.

Lokale vollständige Suite: 662 Tests vor dem zusätzlichen Zugriffstest; abschließende gezielte Service-/UI-Prüfung: 17 Tests erfolgreich, bestehender Client separat ebenfalls erfolgreich. Der endgültige unabhängige Gesamtlauf enthält 663 Tests. Lokaler Browserdownload war fehlgeschlagen; native Abnahme erfolgte in CI. Dokumentationscommits danach verändern keinen Anwendungscode. Keine Zusammenführung/Bereitstellung oder echte Händler-/Zahlungsfreigabe.
