# Einkaufswege

Unter Einkaufsplanung wählt das Restaurant Selbst einkaufen oder Beschaffung über Bringness AI. Der gewählte Weg bleibt je Konto in der Browsersitzung gespeichert; Ausgangswert ist Selbsteinkauf.

Selbsteinkauf: Bedarfsmenge, Standort, Bestand und rechtzeitig unterwegs befindliche Lieferungen werden in einer druckbaren / als CSV exportierbaren Liste gezeigt. Keine Lieferantenauswahl und kein automatischer Bestellentwurf in diesem Weg.

Beschaffung: Nach Eingabe eines Wunschlieferdatums werden Angebote aus dem bestehenden aktiven Lieferantenkatalog ausgewählt und ein Entwurf erstellt. Übereinstimmender Zutatennamen und gleiche Einheit, verfügbare Artikel, aktive / bestellfähige Lieferanten, Packungsrundung, Mindestpackungen und Mindestbestellwerte sind erforderlich. Verglichen werden Warenwerte nach Packungsrundung, nicht nur Stück-/Einheitspreise. Pro Zutat werden bis zu 50 Angebote geladen und davon bis zu fünf eindeutig passende Kandidaten kombiniert. Bis zu 256 Kombinationen, maximal 50 Positionen; keine Behauptung einer global optimalen Gesamtlösung. Die mindestens erfüllten Lieferantensummen werden je Auftrag geprüft. Es wird kein zusätzlicher Vorrat nur zum Erreichen eines Mindestbestellwerts hinzugefügt.

Liefergebiet: Nur eindeutige Stadt- oder Postleitzahleinträge in einer Komma-/Semikolonliste sowie Deutschland/bundesweit werden automatisch akzeptiert. Unklare Freitexte sind manuell zu prüfen. Bei abweichender Standortadresse gibt es ohne gesicherte Ortszuordnung keinen automatischen Entwurf. Der Liefertermin ist eine Anfrage, keine Liefergarantie; bestehende Lieferbedingungen werden bei der abschließenden Warenkorbprüfung gezeigt. Umsatzsteuer und nicht strukturierte Lieferkosten sind nicht Bestandteil des automatischen Warenwertvergleichs.

Ein vollständiger Entwurf kann ausdrücklich in den Warenkorb übernommen werden (ersetzt vorhandenen Warenkorb, wird vorher angezeigt). Fehlende / ungeklärte Positionen werden ausgewiesen und verhindern automatische Übernahme. Alternativ kann der Nutzer Angebote im Beschaffungsmodus manuell wählen. Bei Eingabeänderungen wird der alte Entwurf verworfen. Preise und Konditionen werden bei der bestehenden Warenkorbprüfung erneut abgerufen. Ohne ausdrückliche Bestellbestätigung wird nichts versendet. Keine neue automatische Bestellung, keine Lagerbuchung und keine Zentralfreigabe durch das Vorbereiten eines Entwurfs. Lieferanten liefern die Ware, nicht das KI-Modul.

Regression: Bestehende zeitgerechte Liefermengen, offene Ersatzvorschläge und überfällige Lieferungen bleiben bei der Bedarfsberechnung berücksichtigt. Reine Auswahltests plus vollständige PostgreSQL-/DOM-Prüfungen testen Selbstliste, automatische Auswahl, Packungen, Mindestwertkombinationen, Rollen-/Kontentrennung, fehlende Liefergebiete, Entwurf/Warenkorb und fehlende Bestell- oder Lagerwirkung.


Verbrauchsbasis (Entwicklungsstand 16.10.2026): Die 28-Tage-Planung verwendet die gemeinsame Verbrauchshistorie von Verkaufsimport und Küchenzubereitung. Bekannte ursprüngliche Ereigniszeiten bestimmen den Zeitraum; der Importzeitpunkt bleibt im Audit erhalten. Bestätigte Zutatenrückbuchungen werden gegengerechnet. Zusätzliche Journalzeilen desselben Verkaufs, Inventurzählungen, Verluste und Wareneingänge zählen nicht nochmals als Rezeptverbrauch. Ältere Buchungen ohne Quellzeit behalten ihre bisherige Zeitbasis. Die aktuelle Bedarfsberechnung erfolgt weiterhin unmittelbar vor einer freigegebenen automatischen Bestellung.


Beschaffungsfreigabe (Entwicklungsstand 16.10.2026): Freigabeänderung, Lieferantenkonditionen und Audit-Eintrag werden gemeinsam unter einer aktuellen Restaurantberechtigung gespeichert. Ein Fehler führt zum Rollback und wird gemeldet; eine fehlgeschlagene Änderung gilt nicht als gespeichert. Wiederholtes Ausschalten erhöht die Freigabeversion nicht erneut und erzeugt keinen zweiten Audit-Eintrag. Nach verlorener Bestellbestätigung oder parallelem Lauf hat ein bereits verbindlich gespeicherter Tagesauftrag Vorrang vor veralteten Meldungen wie „kein Bedarf“ oder „blockiert“. Die Bestellkennung bleibt unverändert.

## Hintergrundverbindungen und Mehrprozessprüfung

Der aktuelle Staging-Stand hält Sperre, Planung und Warenkorbtransaktionen auf einer
physischen Verbindung. Ein-Verbindungs-Pool, konkurrierende Sitzungen, Widerruf und
dauerhafte Wiederholung sind zusätzlich auf PostgreSQL 16 geprüft. Details,
Fehlerursache und CI-Nachweise: `ai-worker-connections-20261017.md`. Das aktiviert
keine bisher deaktivierte Beschaffungsfreigabe.
