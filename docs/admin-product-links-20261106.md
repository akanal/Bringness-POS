# Getrennte Adminbereiche, 6. November 2026

Die Kopfzeilen der Marktplatzverwaltung, POS-Verwaltung und verwalteten AI-Oberfläche enthalten dieselben drei Links: Markt `/superadmin/`, POS `/admin/` und AI `/admin/ai-workspace.html?admin=1`. Der aktive Bereich ist hervorgehoben; alle Links bleiben auch auf schmalen Bildschirmen sichtbar. Bestehender Marktplatz-Entwurfsschutz beim Verlassen bleibt erhalten.

Dies verknüpft nur die Verwaltungsseiten. Die bestehenden Sitzungen und Berechtigungsprüfungen werden weder kopiert noch erweitert. Marktplatz-Lizenzen und POS-/AI-Geschäftslogik bleiben getrennt. Die öffentliche AI-Kundenoberfläche erhält keine Adminnavigation.

Lokal: 699 allgemeine Tests sowie 11 gezielte Marktplatz-/AI-Gatewayprüfungen erfolgreich. Der bestehende native Marktplatz-Browserlauf prüft den tatsächlichen Wechsel zwischen allen drei Seiten bei 390/768/1280 px, aktive Kennzeichnung, nicht überlappende Links und Berührungsflächen. Veröffentlichung und Live-Prüfung werden nach erfolgreicher CI dokumentiert.
