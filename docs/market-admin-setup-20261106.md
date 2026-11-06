# Marktplatz: Einrichtungsstand und direkte Aufgaben

Die bestehende Marktplatzübersicht verknüpft ihre sieben Zahlenkarten mit den passenden Bereichen. Offene/freigegebene Händler öffnen die vorhandene Händlerprüfung mit pending/approved-Filter. Neue Bestellungen öffnen die lesende Bestellliste mit received-Filter; weitere Angebote/Bestellungen bleiben über die vorhandenen Listen erreichbar. Gespeicherte Veröffentlichungsstände sind nicht gleichbedeutend mit tatsächlicher öffentlicher Sichtbarkeit; die vorhandene Detailanzeige bleibt maßgeblich.

Einrichtungsstand liest parallel zu den vorhandenen Übersichtszahlen die bestehenden geschützten Rechtstextdaten. Alle sechs bekannten Bereiche unterscheiden Entwurf ohne Veröffentlichung, Veröffentlichung mit identischem Entwurf und Veröffentlichung mit abweichendem gespeichertem Entwurf. Fehlende Einträge/fehlgeschlagene Statusabfrage werden ausdrücklich als unbekannt angezeigt. Die Zahl veröffentlichter Bereiche ersetzt weder juristische Prüfung noch Zahlungsfreigabe. Bereich öffnen lädt den vorhandenen Editor mit genau diesem Abschnitt aufgeklappt. Speichern und ausdrücklich bestätigte Veröffentlichung bleiben unverändert.

Keine neuen Endpunkte, Tabellen, Schreibaktionen oder Rollen. Vorhandener Konto-/Ansichtswechsel- und Entwurfsschutz bleiben bestehen. POS/AI, Produktfarben, Lizenzgebiete/Rechte/Wirtschaftlichkeit und Zahlungsaktivierung werden nicht verändert.

## Prüfung und Veröffentlichung
- PR242 Feature0693fc4854789258ee4ed7cc12c58ef75eb961cf / Tree5d35bf1f5b1770e45048abc83d48b986a2dee948: alle vier ausgelösten Workflows erfolgreich — Shop42258574417/job128032203752 (777 Tests und echter PostgreSQL-/Chromiumlauf), checks42258574494, release42258574362 und isoliert42258574318. Lokal699 allgemeine und8 Marktplatz-UI-Tests bestanden.
- UI prüft gemischte gespeicherte/veröffentlichte Zustände, Teilfehler, gezielt geöffneten Datenschutz-Editor, pending-Händlerfilter und received-Bestellfilter. Native Prüfung auf390/1280px; Einrichtungsscreens im Artefakt13524186563 visuell geprüft. Die dortigen Händler/Angebote/Bestellungen und eine veröffentlichte Betreibersektion sind ausschließlich synthetische isolierte Prüfdaten.
- Frische authentifizierte Sicherung42211075899/job128032193665 bestätigt Database backups validated. Merge d0f180a069e686e71ae311712f8f3afe94391264 über Netcup42259510411/job128035428662 exakt deployed; vorheriger Container und Datenbanksicherung erhalten.
- Live drei geänderte Seiten/Skripte200 quellgleich (HTML plus bestehender Logo-Injektion), /health200. Übersicht-/Legal-Endpunkte ohne Anmeldung401/no-store. Keine privaten Produktionskonten gelesen, keine tatsächlichen Händlerentscheidungen, Bestellungen oder Rechtstexte angelegt/veröffentlicht.

Einstieg: Markt-Admin → Marktplatz → Übersicht. Die Zahlenkarten öffnen passende vorhandene Listen; Einrichtungsstand → Bereich öffnen führt zum zugehörigen Rechtstexteditor.
