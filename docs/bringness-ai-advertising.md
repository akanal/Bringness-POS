# Lieferantenwerbung

Der Bereich „Werbung“ steht Lieferanten und Plattformadministratoren zur Verfügung. Restaurantkonten sehen ausschließlich passende, freigeschaltete Anzeigen im Überblick, Lieferantenkatalog oder in der Einkaufsplanung.

## Ablauf

1. Lieferant reicht Produkt, Angebot, Saisonangebot oder Firmenvorstellung mit Titel, Beschreibung und optionalem PNG/JPEG/WebP (bis 120 KB) ein.
2. Aktiver Plattformadministrator legt Gesamtpreis netto, Beginn, Ende, Städte oder PLZ-Präfixe, Platzierung und optional Küchenart / Suchbegriff fest. Es gibt keine vorgegebenen Preise.
3. Lieferant bestätigt die aktuellen Konditionen ausdrücklich. Neue Konditionen widerrufen eine ältere Bestätigung.
4. Plattformadministrator schaltet frei. Eine bestätigte Kampagne kann vor dem Start freigegeben werden; die Anzeige erscheint erst innerhalb ihrer Laufzeit.
5. Plattformadministrator kann pausieren, wieder freischalten oder ablehnen und einen tatsächlich geprüften Zahlungseingang mit Referenz erfassen.

Werbegebühren gelten zusätzlich zur unveränderten Vermittlungsprovision von 2 % auf den Netto-Warenwert vermittelter Bestellungen. Der Zahlungsnachweis ersetzt keine Rechnung; automatische Abbuchung und Rechnungsstellung sind nicht Bestandteil dieses Moduls.

## Freigabe und Zielgruppe

Nur aktive globale `platform_admins` dürfen Konditionen bearbeiten und veröffentlichen. Ein Betriebsadministrator oder Lieferant kann sich keine Freigabe erteilen. Region und Küchenart stammen aus dem angemeldeten Restaurantprofil, nicht aus manipulierbaren Filterparametern. Städte und PLZ-Präfixe sind alternative Regionskriterien; Küchenarten begrenzen zusätzlich. Ein optionaler Suchbegriff begrenzt gefilterte Katalogansichten. Ohne Suchkontext gelten die übrigen Kriterien.

Inhaltsänderungen ziehen die Freigabe zurück und erfordern einen neuen vollständigen Ablauf. Änderungen an Produktname, Einheit, Packungsinhalt, Mindestpackzahl oder Nettopreis verhindern die Ausspielung bis zur erneuten Einreichung und Prüfung. Gesperrte Lieferanten und nicht lieferbare Produkte werden nicht angezeigt. Zeiträume enden automatisch. Es erscheinen höchstens drei Anzeigen je Platzierung; sie sind ausdrücklich als „Anzeige“ gekennzeichnet.

## Statistik

Ein sichtbarer Anzeigenblock (mindestens 50 % Sichtbarkeit per IntersectionObserver) meldet eine Ansicht. Bei fehlender Browserunterstützung werden keine Ansichten geschätzt. Ein Klick wird mit kontogebundenem Token gemeldet; je Konto, Kampagnenversion und Stunde werden maximal eine Ansicht und ein Klick gezählt. Abruf allein zählt nicht. Statistiken sind aggregierte Reichweitenhinweise, keine Abrechnungsgrundlage oder geprüfte Werbeauslieferungsnachweise. Werbeklicks öffnen den internen Lieferantenkatalog.

## Validierung

Die eingebetteten PostgreSQL- und DOM-Tests prüfen Rechte, individuelle Konditionen, ausdrückliche Bestätigung, regionale und Küchen-Zuordnung, Terminsteuerung, Produktänderungen, Pause, erneute Inhaltsprüfung, getrennte Zahlungsnachweise und die Lieferanten-/Admin-Oberflächen. Die bestehende Integration prüft weiterhin Bestellungen und 2-%-Provisionen.
