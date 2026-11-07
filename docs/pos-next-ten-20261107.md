# POS: geführter Kassenabschluss und nächste zehn Punkte

Der Eigentümer beauftragt den geführten POS-Abschluss und eine neue Zusammenstellung der nächsten Punkte. Markt und AI bleiben getrennt. Bestehende Schichten und historische Abschlussberichte werden weiterverwendet; keine Zahlung, TSE-Signatur oder neue fiskalische Abschlussart wird erfunden.

## Dieser Entwicklungsblock

1. Bestehende Schicht mit Anfangsbestand und Server-Eingangsregel übernehmen.
2. Gezählt-Betrag erfassen und Differenzbegründung vor der Prüfung verlangen.
3. Aktuellen Kassenstand ausdrücklich laden und Soll/Ist/Differenz zur Prüfung anzeigen.
4. Gesonderte endgültige Bestätigung; eine Prüfung allein erzeugt keine Buchung.
5. Geänderte Zahlungen/Einlagen/Entnahmen seit der Prüfung unter dem bestehenden Restaurant-Lock erkennen und erneute Prüfung verlangen.
6. Unterbrochene Buchungen mit unveränderter Vorgangskennung abgleichen; beschädigte lokale Wiederholungen und verlassene Ansichten blockieren.
7. Gespeicherten Abschluss mit Cent-Werten, Zahlungsarten, Bewegungen, Pfand und Begründung als CSV herunterladen; Textfelder gegen Tabellenformeln absichern.
8. Beim Druck nur Berichtsinhalte ausgeben, keine Export-/Druckknöpfe mitdrucken.
9. Datenbank-/Berechtigungs-/Wiederholungsprüfungen sowie echte Chromium-/WebKit-Bedienung bei390/1280px einschließlich heruntergeladener CSV prüfen.
10. Nach erfolgreicher Prüfung über den bestehenden Netcup-Weg mit Sicherung veröffentlichen und ausgelieferte Dateien/geschützte Route verifizieren.

Der Browser prüft einen frisch geladenen Prüfstand; dessen SHA-256-Marke bindet die sichtbaren Finanzsummen und Bewegungen. Der Server vergleicht die Marke im vorhandenen serialisierten Abschlussvorgang. Ältere Clients und alte Wiederholungsbelege ohne Marke behalten ihre unveränderte Bedeutung. Kein Datenbankschemawechsel erforderlich.

CSV ist ein Kassenschichtbericht, kein DATEV-/DSFinV-K-Export und kein fiskalischer Tages-/Z-Abschluss. Später eingehende Offline-Verkäufe bleiben der beim Servereingang geöffneten Schicht zugeordnet. Bereits gespeicherte Abschlüsse werden nicht umgeschrieben. Ein erzeugter Download ist keine Bestätigung, dass eine Person die Datei gelesen oder extern archiviert hat.

## Anschließend vorbereitete Entwicklungspunkte

1. Windows: verfügbare Version, installierte Version und Updatefortschritt klar anzeigen.
2. Vor einem Windows-Update offene lokale Vorgänge und Synchronisationsstand prüfen.
3. Unterbrochenen Download ausdrücklich fortsetzen bzw. neu starten.
4. Installationspakete mit bestehenden Versions-/Integritätsangaben abgleichen.
5. Rückkehr zur vorherigen funktionsfähigen Windows-Version vorbereiten, ohne lokale Kassendaten zurückzusetzen.
6. Offline-Wiederanlauf verständlich anzeigen und offene Übertragungen gezielt prüfen.
7. POS-Mindestbestände und knappe Artikel in einer eigenen Bestandsübersicht hervorheben.
8. Eigene POS-Nachbestellliste ohne automatischen Lieferantenauftrag erstellen.
9. Gerätediagnose für Scanner und Bondrucker mit klaren tatsächlichen Testergebnissen verbessern.
10. Gemeinsamen Regressionstest auf PC/iPad/Windows durchführen und echte Geräteabnahmen getrennt dokumentieren.

Diese Folgeschritte sind als nächstes Paket zusammengestellt, nicht als bereits implementiert bezeichnet. Bestehende Offline-/Fernhilfe-Funktionen werden nicht als fehlend dargestellt. Code-Signatur, TSE-Anbieterfreigaben und echte Geräte-/Zahlungsabnahmen bleiben von konkreten Zugängen bzw. Geräten abhängig; keine neuen Verträge oder Lizenzpreise.

## Verifiziert veröffentlicht

PR248: Feature051f980190150e0f90190d02cc4c7cb2eca88acc, Tree7a6a602fb3f455ae85d92461bb0388824619a15d. Alle sechs Prüfworkflows erfolgreich; lokal700 allgemeine Tests. PostgreSQL-Prüfung und Chromium/WebKit bei390/1280px mit tatsächlichem CSV-Download erfolgreich. Finale Bilder13570115279 visuell geprüft. Frische Sicherung42211075899/job128367561934 validiert.

Mergedc8fc7a29bd168f4b19d942ad20e9268be79ee6d wurde durch Netcup42360859276/job128368751728 exakt bereitgestellt, vorherige Version und Datenbanksicherung behalten. LiveJS200/bytegleich, POS-HTML200 mit neuer Skriptversion, Health200/no-store, private Kassenschichtroute401/no-store ohne Zugang. Keine echte Kasse, Zahlung oder private Produktionsdaten zur Abnahme verändert.

## Folgestand

Die oben vorbereiteten Folgepunkte sind inzwischen als PR250 technisch umgesetzt und überprüft; verbindlicher Umfang und tatsächliche Grenzen stehen in [pos-operations-ten-20261107.md](pos-operations-ten-20261107.md). Webfunktionen sind veröffentlicht. Windows0.2.3 bleibt ein unsignierter Testbuild; öffentliche Signaturfreigabe und physische Geräte-/Installations-/Downgrade-Abnahme sind nicht erledigt.
