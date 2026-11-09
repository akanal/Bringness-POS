# POS-Zahlungsabgleich: geänderten Warenkorb erhalten

Eine bestätigte ältere Zahlung darf ausschließlich den unveränderten zugehörigen Entwurf leeren. Bisher wurden bei abweichendem Warenkorb oder inzwischen ausgewähltem anderem Betrieb dessen aktuelle Verkaufswerkzeuge dennoch zurückgesetzt. Änderungen ausschließlich am Artikelpreis waren zudem in der bisherigen Artikel-/Mengenkennung unsichtbar.

Neue Zahlungsentwürfe speichern zusätzlich einen vollständigen lokalen Warenkorbsnapshot ohne Zugangstoken. Ein bestätigter Verkauf leert Warenkorb, Rabatt und Bargeldeingabe nur bei unverändertem Betrieb, bisheriger Entwurfskennung und identischem Snapshot. Bei Änderungen bleibt der aktuelle Entwurf einschließlich Verkaufswerkzeugen erhalten; die bestätigte frühere Anfrage wird weiterhin aus der Wiederherstellung entfernt. Alte gespeicherte Anfragen bleiben über ihre bisherige Kennung abgleichbar.

Geprüft: Antwortverlust/Neustart, leere Wiederherstellung, Doppelabsenden, Speicherfehler, Kartensperre, Korrektur mit gleicher Kennung, unvollständige Bestätigung; zusätzlich Mengen-, Preis-, Rabatt- und Betriebswechsel während laufender Anfrage sowie unveränderte neue und alte Entwürfe. Die neue Regression scheitert mit dem bisherigen Quellstand. Rabattintegration ebenfalls erfolgreich. Keine Änderung an Darstellung, serverseitiger Buchung, Markt oder AI. Keine produktiven Verkäufe zur Prüfung erzeugt.

Extras in der direkten Kasse bleiben der nächste Funktionsblock; dieser vorgezogene Zahlungsfehler ist keine Extras-Implementierung. Bereitstellung erst nach erfolgreichen erforderlichen CI-Prüfungen und vorhandener Sicherung.
