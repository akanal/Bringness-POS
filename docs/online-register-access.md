# Online-Kassen: ID, Freigabe und Fernverwaltung

Jeder angemeldete Online-Arbeitsplatz wird mit einer Geräte-UUID in `devices` und einer unveränderlichen Betriebszuordnung in `online_registers` registriert. Der Wiedererkennungsschlüssel bleibt pro Betrieb im Browserprofil, getrennt von Sitzungstokens. Löschen des Browserspeichers oder ein anderes Browserprofil erzeugt eine neue Kasse; mehrere Tabs desselben Profils/Betriebs teilen die ID. Ein Schlüssel kann weder Betrieb noch Firma wechseln. Keine Fingerprinting-Erkennung und keine ID als Passwort.

Die bestehende Verwaltungs-PIN schützt die Anzeige unter Einstellungen → Kassen-ID & Fernverwaltung. Registrieren dürfen Inhaber, Admin, Manager und Kasse, die Zustimmung geben ausschließlich aktive Inhaber/Admins des Kundenkontos. Verwaltung wird ausdrücklich für eine Stunde freigegeben und ist sofort widerrufbar. Die Freigabe wird bei jeder einzelnen Anfrage gegen Zeit, Konto, aktiven Grantor, Plattformmitgliedschaft und aktuelle Adminsitzung geprüft. Keine permanente Zusatzanmeldung und kein Umgehen der Kundenfreigabe.

Admin → Online-Kassen · ID öffnet `/admin/online-registers.html`. Suche über vollständige UUID oder Betriebs-/Firmennamen; maximal 100 Treffer. Zugriff nach Freigabe: Kategorie anlegen/umbenennen, Artikel anlegen/bearbeiten/deaktivieren, Preis in Cent, MwSt., Beschreibung und Kategorie; Betriebsname/Betriebsart; Diagnose aus Datenbankbereitschaft, letzter Verbindung und Webversion; Zugriffsverlauf. Neue Datensätze verwenden klientenseitig gehaltene UUIDs für identische Wiederholung nach einer verlorenen Antwort. Keine Zahlungs-/Verkaufs-/Personalbuchungen, keine Passwörter und keine willkürlichen Serverbefehle über diese API. Bilder, Varianten und andere bestehende Artikelattribute werden bei Änderungen nicht überschrieben. Nicht alle vorhandenen POS-Konfigurationsbereiche haben bereits ein eigenes Fernverwaltungsformular.

`/api/v1/online-registers` ist der geschützte Werkzeugzugang für dieselben Aktionen. Die Assistenz kann ihn über die angemeldete Admin-Browseroberfläche bedienen. Die Ausführung setzt eine tatsächlich verfügbare authentifizierte Browsersitzung voraus; die Bereitstellung richtet keinen automatisch verbundenen externen MCP-Connector und keinen unbeaufsichtigten Dauerzugang ein. Bearbeitungen werden unter dem angemeldeten Plattformadministrator protokolliert. Es werden keine Kundensitzungen imitiert und keine Kundentokens erzeugt.

## Browser-Bildschirmhilfe

Die bestehende Fernhilfe zeigt jetzt auch Browsergeräte und ihre Kassen-ID. Unterstützte Browser melden Protokollbereitschaft. Der Kunde bestätigt jeden Vorgang selbst, wählt nur Bildschirm oder Bildschirm mit Bedienung und wählt im Browserdialog den aktuellen Kassentab. Der zufällige Capture Handle samt Origin muss exakt dem aktuellen Tab entsprechen. Andere Tabs/Fenster werden abgelehnt, ein Wechsel oder das Ende der Freigabe stoppt die Übertragung. Voraussetzungen werden per Feature-Erkennung geprüft; insbesondere Safari/iPad wird keine garantierte Bildschirmsteuerung versprochen. Referenz: https://developer.chrome.com/docs/web-platform/capture-handle

Ein dauerhaft sichtbarer Hinweis erlaubt sofortiges Stoppen. Die vorhandene serverseitige Begrenzung auf 15 Minuten, Kunden-/Admin-Sitzungsprüfung, Ablauf, Widerruf, Gerätesperre, begrenzte JPEG-Bilder und nicht wiederholbare Befehlszustellung bleiben erhalten. Tabwechsel in den Hintergrund, Abmelden und Seitenschließen beenden die lokale Übertragung. Ein beendeter Stream startet nicht automatisch erneut.

Browserbedienung unterstützt Klicks, Textfelder, Formularbestätigung und Scrollen innerhalb dieses POS-Tabs. Passwort-/Karten-/OTP-Felder, fremde Navigation, Browserdialoge und OS-Eingaben bleiben geschützt/lokal. Nicht implementierte Tasten und Neuladen werden als fehlgeschlagen bestätigt statt als ausgeführt gemeldet. Windows verwendet weiterhin seine native Fernhilfe. Dies ist keine vollständige Betriebssystem-Fernsteuerung. Eine echte Freigabe zwischen zwei Kundengeräten muss separat abgenommen werden; simulierte Capture-Tests ersetzen keinen solchen Nachweis.

## Prüfungen

`node server/ai-tests/online-registers.mjs`: tatsächliche SQL-Transaktionen und DOM-Formulare, feste ID, Mandant/Betrieb, Grantor-/Admin-/Sitzungsentzug, Ablauf/Widerruf, Kategorie-/Produktschutz, idempotentes Anlegen, Einstellungen und Audit.

`node server/ai-tests/browser-support.mjs`: simulierte Browsermedien, zwingende Zustimmung, verifizierter eigener Tab, fremder Tab, nur Ansicht, Framebindung, geschützte Felder, Stop/Widerruf und fehlende Browserfähigkeiten.

Die vorhandenen Windows-Fernhilfe-, Input- und Systemzugriffstests laufen zusätzlich. Beide neuen Integrationsprüfungen sind in POS/AI-CI und im bestehenden Netcup-Bereitstellungs-Testlauf eingebunden.
