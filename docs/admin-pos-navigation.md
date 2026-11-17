# POS-Adminnavigation

Die POS-Verwaltung unter `/admin/` verwendet sechs sichtbare Bereiche mit direkt sichtbaren Unterfunktionen. Das bisherige „Mehr“-Menü entfällt.

| Bereich | Funktionen |
| --- | --- |
| Übersicht | Plattformkennzahlen; aufklappbare Kennzahlen des eigenen Betriebs |
| Kassen & Betriebe | Betriebe und Geräte, Online-Kassen-ID/Freigaben, Bildschirme/Personal/Center, Kasseneinstellungen |
| Kunden & Abrechnung | Kundensuche und Sonderkonditionen, Module/Preise, eigene Zahlungen/Rechnungen, eigenes Abonnement |
| Team & Zugänge | Eigenes Team, Kundenkonten, Service-App |
| Support & E-Mail | Supportanfragen, Fernhilfe, Bringness-Versandmaske |
| System & Sicherheit | Diagnose/Offline-Abgleich, Betriebs-/Plattformprotokolle, Steuerprüfung, Passwort und Zwei-Faktor-Anmeldung |

Die vorhandenen Berechtigungen bleiben maßgeblich. Plattformfunktionen erscheinen erst mit ihrem bereits freigeschalteten Einstieg. Betriebsmodule, Online-Kassen und E-Mail sind keine neu erteilten Rechte. Die ursprünglichen Panel-Handler und Serverprüfungen bleiben erhalten.

`navigation.js` gruppiert die vorhandenen Einstiege. Für Plattformadministratoren führen die bisherigen doppelten Geräte-/Betriebseinstiege zu „Betriebe & Geräte“. Für normale Betriebsadministratoren bleiben eigene Betriebs-/Geräteansichten verfügbar. Bezeichnungen je Betrieb stehen bei der jeweiligen Kundenkasse. Neue Erweiterungen bleiben unter System erreichbar. Direkte interne Panel-Aktionen synchronisieren die Gruppenauswahl; feste Fragmentadressen und Browser-Zurück funktionieren ohne Geschäfts-/Sitzungsdaten in der URL.

Kennzahlen erscheinen auf der Übersicht, Abo-Testkarten unter „Eigenes Abonnement“. Ein erneuter Klick auf den bereits geöffneten Bereich lädt kein Formular neu. Die Änderung führt beim Navigieren ausschließlich die bestehenden Leseanfragen aus. Speichern, Sperren, Einladungen, Fernhilfefreigaben und Zahlungsaktionen behalten ihre bisherigen ausdrücklichen Auslöser.

Markt/POS/AI bleiben getrennte Produkte. Der schwarze POS-Kopf, die orange Markenfarbe sowie die gemeinsame Position der Produktwechsel bleiben erhalten. Andere Kassen-/Kellneroberflächen, Preise, Rechte und Daten werden nicht verändert.

Prüfungen: `node server/ai-tests/admin-navigation.mjs` sowie der native Admin-Navigationsfall in `server/pos-payment-browser.test.js` bei390/1280px in Chromium und WebKit. Diese prüfen Gruppierung, direkte Ziele, alte Panel-Aktionen, späte Freischaltungen, entfernte Ziele, Fragmentnavigation, aktiven Formularerhalt und ausbleibende Schreibanfragen.
