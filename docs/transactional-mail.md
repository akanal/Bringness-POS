# Automatische Beleg- und Mitarbeiter-E-Mails

Die E-Mail-Adresse wird bei der QR-Bestellung vom Gast angegeben. Die Kassenoberfläche fragt keine E-Mail ab. Die Checkout-API unterstützt weiterhin einen optionalen Belegempfänger; Zahlung, Beleg und Versandauftrag werden dort gemeinsam bestätigt oder zurückgerollt. Beim Bezahlen bestehender QR-/Tischbestellungen erkennt der Worker die bereits gespeicherte Gast-E-Mail erst nach vollständiger Zahlung. Offene oder stornierte Bestellungen erzeugen keinen Versand.

Mitarbeiter können bei der Anlage eine E-Mail erhalten. Sie bekommen ihre persönliche Stempel-PIN, Rolle, POS-Adresse und Anleitung für Dienstbeginn/Pause/Dienstende. Die PIN erweitert keine Berechtigungen und ist kein eigenständiger POS-Kontologin. Servicekonten haben weiterhin eine separate Einladung mit 48 Stunden Aktivierung, Erstcode und verpflichtendem Codewechsel.

Der PostgreSQL-Versandauftrag bleibt bei Neustart bestehen. Nachrichteninhalte mit PIN/Aktivierungslink werden verschlüsselt und nach erfolgreicher SMTP-Übergabe gelöscht. Verschlüsselung nutzt PASSWORD_PEPPER, alternativ DATABASE_URL; Änderungen daran müssen vorhandene Warteschlangen berücksichtigen. Gleiche Belege erzeugen durch einen eindeutigen Schlüssel keine zweite Nachricht. Verbindungsprobleme vor der Übertragung werden mit wachsendem Abstand bis zu zwölfmal erneut versucht. Unklare Übertragungen nach Beginn des SMTP-Versands stehen auf „Manuell prüfen“, um doppelte Nachrichten zu vermeiden. SMTP-Übergabe ist kein Nachweis der Zustellung im Empfängerpostfach.

Der Superadmin sieht unter Zentrale Steuerung die SMTP-Prüfung sowie Anzahl wartender, übertragener, gesendeter, fehlgeschlagener und zu prüfender Nachrichten. Zugangsdaten und Nachrichteninhalte werden dabei nicht ausgegeben. Öffentlich meldet `/api/v1/mail/availability` ausschließlich den sicheren SMTP-Verfügbarkeitsstatus.

Benötigte bestehende Serverkonfiguration: SMTP_HOST, SMTP_PORT (Standard 587), SMTP_USER, SMTP_PASSWORD, SMTP_FROM sowie PUBLIC_BASE_URL mit HTTPS. Der Absender muss beim gewählten Anbieter freigegeben sein. SPF/DKIM/DMARC und tatsächlicher Postfacheingang benötigen Prüfung beim Anbieter bzw. einen echten Testempfänger. Geheimnisse ausschließlich serverseitig hinterlegen.

Offline-Verkäufe im Windows-Client haben derzeit kein Beleg-E-Mail-Feld; dessen Ergänzung sowie nachträglicher manueller Versand/Wiederholung zweifelhafter Übertragungen bleiben separat offen. Die Live-Zahlungsanbieter- und TSE-Einrichtung bleibt der vereinbarte letzte Schritt.
