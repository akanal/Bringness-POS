# Markt und POS: getrennte Verwaltung und Anmeldesitzungen

Der Eigentümer hat die POS-Menüpunkte Bildschirme, Personal und Center im Markt-Admin beanstandet. `/superadmin/` enthält jetzt ausschließlich die Marktverwaltung und fordert keine POS-Betriebsliste oder POS-Systemübersicht an. Die genehmigten drei Produktlinks in der Kopfzeile bleiben erhalten. Der bisherige automatische POS-Logo-/Authentifizierungshelfer wird nicht mehr in Markt-Admin-HTML injiziert.

Die bestehenden POS-Werkzeuge bleiben unter `/admin/systems.html` erreichbar: POS → Betriebsverwaltung. Bestehende Anzeige-/Personal-/Center-Funktionen und serverseitige Berechtigungen werden wiederverwendet. Die bisher gemischte POS-&-AI-Übersicht innerhalb POS zeigt nur noch POS-Inhalte; AI bleibt über den eigenen Kopfzeilenlink erreichbar. Der Center-Modus `?superadmin=1` verwendet die POS-Verwaltungssitzung. Sein echter Zurück-Link führt zur POS-Betriebsverwaltung; das vorhandene Logoskript darf ihn nicht durch ein Logo ersetzen.

## Browser-Sitzungen

| Bereich | Gespeicherter Sitzungsschlüssel |
| --- | --- |
| Shop | `bringness-shop-token` |
| Markt-Administration | `bringness-market-admin-token` |
| POS-Betriebsverwaltung | `bringness-pos-admin-token` |
| Bestehende normale POS-Anmeldung | `bringness-pos-token` (unverändert) |

Es werden keine Sitzungstokens zwischen diesen Bereichen kopiert und keine bestehenden Daten oder Passwörter migriert. Bestehende Konten, Identitäten und die serverseitigen Rollenprüfungen bleiben erhalten. Nach dem Update einmal ausdrücklich im betroffenen Bereich anmelden. Das ist eine Trennung der Oberfläche und ihrer Sitzungsauswahl, keine neue physisch getrennte Kontodatenbank. Die gesonderte verwaltete AI-Anwendung und ihr bestehender Gateway werden nicht neu aufgebaut.

Die ältere separate Händlerprüfungsseite verwendet ausdrücklich die Markt-Admin-Sitzung. Ihr Client erhält den gewählten Sitzungsschlüssel auch dann, wenn kein fertiger Client übergeben wurde. Die Prüfung darf keine Shop-Sitzung als stillen Ersatz verwenden.

## Passwort und Shop-Anmeldung

Das vorhandene SVG-Augensymbol sitzt im Passwortfeld der Markt- und POS-Betriebsverwaltung. Es ist transparent gestaltet und weiterhin mit Tastatur bedienbar. Anzeigen/verbergen funktioniert wiederholt; bei Seitenwechsel wird maskiert. Es wird kein Passwort im zusätzlichen Speicher abgelegt.

Shop-Login speichert ausschließlich die Shop-Sitzung. Nach bestätigter Anmeldung und erfolgreichem Speichern geht es unmittelbar zum vorhandenen erlaubten Shop-Ziel weiter. Falsche Zugangsdaten, vorübergehender Verbindungsabbruch und Zeitüberschreitung erhalten die maskierte Eingabe für die Korrektur. Erfolgreiche Anmeldung oder Verlassen der Seite entfernt das Passwort aus der Ansicht. POS-Anmeldung wird dabei nicht überschrieben. Es werden keine Passwörter geändert oder Zugänge neu angelegt.

## Ausgeblendete Angebote

Oberhalb der Ergebnisliste erscheint ein eigener sichtbarer Bereich mit Anzahl, „Letztes Ausblenden rückgängig“ und „Alle wieder anzeigen“. Die Wiederherstellung bleibt erreichbar, wenn sämtliche Angebote ausgeblendet wurden. Sie ändert ausschließlich die vorhandenen persönlichen Ausblendungen in der Browsersitzung; Warenkorb, Angebote und gespeicherte Bestellungen werden nicht gelöscht oder veröffentlicht.

## Prüfung

Lokale vollständige Ausgangsprüfung: 780 Shoptests und 699 allgemeine Tests bestanden; anschließend gezielte Sitzungs-/Händlerprüfungs- und Center-Logo-Regressionen erfolgreich. Der native PostgreSQL-/Browserablauf prüft ungültigen Login mit erhaltener Eingabe, korrigierten Login und direkte Fortsetzung, getrennte Shop-/Admin-Sitzungen, das Augen-Symbol aus ausdrücklich abgemeldeter Ansicht, Markt ohne POS-Steuerung, erhaltene POS-Werkzeuge/Center-Rücksprung sowie Ausblenden aller Angebote und Wiederherstellung. Produktionskonten und echte Bestellungen sind keine Prüfdaten.

## Verifiziert live — 6. November 2026

- PR244, geprüfter Featurekopf95cca4cace77c008f5e57cd559ee324a0b8dbe96 / Tree4447ce99a7b20e6d90eba68eda42d159b3467d64. Alle sechs Workflows erfolgreich: Shop42299702036/job128173977223 (781 Tests sowie echter PostgreSQL-/Chromium-Einstieg), POS/AI42299702086, Center42299702152 (Chromium128173977307 und WebKit128173977685), isoliert42299702208, checks42299701964 und release42299701987.
- Native Prüfung umfasst reale synthetische Registrierung/Anmeldung mit Fehlversuch, unveränderter maskierter Eingabe und erfolgreicher Wiederholung/Weiterleitung. Getrennte Markt-/Shop-Sitzungen, abgemeldeter Passwortsymbol-Test, Markt ohne POS-Navigation/-Hilfsskripte, erhaltene POS-Werkzeuge und sichtbarer Center-Rücksprung sowie Hide-all/Undo/Restore-all bestanden. Finale Bilder13544880163: Markt-Login390 und Marktübersicht1280 visuell geprüft. Keine privaten Produktionszugänge oder Datensätze verwendet.
- Frische authentifizierte Sicherung42211075899/job128177599985 meldet am06.11.2026 um22:56Uhr Berlin Database backups validated. Mergea5f318d10c6864628f3b44c7e9c26594e5559369 über Netcup42300855789/job128177951274 exakt veröffentlicht; vorheriger Container und Datenbanksicherung erhalten. Main-POS/AI42300855788 und Main-Center42300855801 ebenfalls erfolgreich.
- Frische Live-Prüfung:42 geänderte öffentliche Dateien HTTP200/quellgleich; bekannte bestehende serverseitige Injektionen in POS-/Center-HTML normalisiert. Markt-Admin-HTML nun ohne Brand-/POS-Helferinjektion exakt quellgleich. /superadmin/200/no-store, /health200/no-store; private Marktübersicht und POS-Systemliste ohne Anmeldung401/no-store. Registrierungsdienst erreichbar, GET405 mit Allow:POST, ohne Registrierung oder sonstige Schreibanfrage in Produktion.

Bestehende Konten, Shopangebote, Bestellungen, Zahlungs-/Lizenzregeln und Passwörter wurden nicht gelöscht oder geändert. Einmal neu in Shop, Markt-Administration beziehungsweise POS-Betriebsverwaltung anmelden; keine stillschweigende Übernahme alter produktfremder Browser-Sitzungen.
