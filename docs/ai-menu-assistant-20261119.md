# Speisekartenassistenz: Umsetzung und verbleibender Umfang

Stand: 19.11.2026. Auftrag: bestehende AI-Funktionen sauber abgleichen; Speisekarten gestalten und datenbasierte Änderungen ausschließlich nach ausdrücklicher Betreiberfreigabe übernehmen. Dieses Dokument trennt vorhandenen Code, neue Entwicklung und Veröffentlichung.

## Vorhandene Bausteine

| Funktion | Quelle | Aussagegrenze |
|---|---|---|
| Mehrjähriges Lernen | ai-learning-history.js; ai-multiyear-kitchen-assistant-20261119.md | Vorheriger Live-Nachweis im Paketdokument; keine hier erneut geprüfte Modellgüte |
| Verderbvermeidung und Vorbereitung | ai-kitchen-assistant.js | Zwei getrennte standardmäßig ausgeschaltete Standortschalter |
| Wetter-, Veranstaltungs- und Nachfrageprognosen | ai-forecast.js; ai-planning.js | Vorhandene Daten-/Qualitätsgrenzen gelten |
| Verkaufsabhängiger Bestand und Reservierung | ai-recipes.js; ai-stock-lifecycle.js | Autorisierte Anbindung, korrekte Zuordnung und Verbrauchsmodus erforderlich |
| Bestandswarnungen | ai-inventory.js | Keine physische Lagerprüfung |
| Einkaufslisten und Beschaffung | ai-procurement.js; ai-auto-procurement.js | Bestehende betriebliche Einkaufsfreigaben unverändert |
| Rezeptkalkulation | ai-recipe-cost-core.js | Letzte bestätigte Nettowarenpreise, ohne Gemeinkosten |

Die früher mündlich als „Umsetzung ungeprüft“ bezeichneten Funktionen sind damit nicht pauschal fehlend. Aktuelle Live-Version und fachliche Abnahme bleiben von diesem Codebefund getrennt.

## Neuer erster Baustein

Eigener Einstieg unter Lager & Küche → Speisekartenassistenz. Je Standort Assistenz/Rezepte, Einkaufspreise und freier Bestand getrennt freigeben; alle drei Schalter anfangs aus. Kein neuer externer KI-Dienst und keine Datenübertragung an einen Modellanbieter. Der erste Baustein ist eine regelbasierte Karten- und Kalkulationsassistenz, kein frei formulierender KI-Designer.

Aus bestehenden Standortrezepten eine Kartenfassung mit Namen, Kategorien, Beschreibungen, Bruttopreisen, Sichtbarkeit und Reihenfolge im Entwurf erstellen. Bestehende freigegebene AI-Fassung oder gespeicherten Entwurf erneut bearbeiten. Rezepte/Allergene/Zutatenbeschreibungen/Steuern werden nicht erfunden. Fehlende Preise bleiben offen; sichtbare Gerichte ohne bestätigten Bruttopreis sind nicht freigabefähig. Einkaufspreise ergeben nur gekennzeichnete Nettowarenkosten; keine frei erfundene Zielmarge oder Steuerumrechnung. Bei freigegebenem Bestand knappe unreservierte Zutaten markieren.

Entwurf speichern verändert weder die freigegebene Karte noch POS-Artikel, Rezepte, Bestände, Zahlungen oder Bestellungen. Nur aktive Restaurantkonten desselben Standortes können ausdrücklich bestätigen und entscheiden. Sitzung innerhalb der Transaktion erneut prüfen; Konto/Standort serialisieren. Genehmigung übernimmt ausschließlich die gespeicherte geprüfte AI-Kartenfassung. Abgelehnte/angenommene Entwürfe bleiben nachvollziehbar, identische Entscheidungen wiederholbar; widersprüchliche Wiederholung409.

Geänderte Rezept-/Kosten-/Bestandsgrundlage, geänderte Zugriffsrechte oder eine inzwischen freigegebene andere Kartenfassung sperren die Übernahme veralteter Entwürfe. Erneut gestalten und prüfen. Ausschalten stoppt Erstellen/Freigeben und Quellabrufe, erhält bestehende Entwürfe/AI-Karten. Maximal100 Gerichte je Entwurf,500 Rezepte im Quellkontext,100 offene Entwürfe je Standort, Anzeige der letzten50 Vorgänge.

## Noch nicht umgesetzt

- Verbindung der Kartenempfehlungen mit den vorhandenen Verkaufs-/Mehrjahres-/Vorbereitungsprognosen, einschließlich eigener Datennutzungsfreigabe.
- Automatische begründete Vorschläge für Absatz-/Vorbereitungsmengen, Preisänderungen anhand bestätigter Kostenentwicklung und Betreiber-Zielkalkulation sowie gezielte Bewerbung prüfbarer Überbestände.
- Übernahme einer ausdrücklich freigegebenen Änderung in die tatsächlich angebundenen POS-Artikel/QR-Speisekarte. Die neue AI-Kartenfassung ist kein Nachweis einer solchen Veröffentlichung.
- Mehrere Gestaltungsvorlagen, druckfertiger Export und freie sprachliche Gestaltung.

Diese Punkte sind offene Entwicklung, keine Zugangsblocker. Dieser erste Baustein darf nicht als vollständige Erledigung des gesamten neuen Auftrags bezeichnet werden.

## Prüfung und Veröffentlichung

Lokal:772 allgemeine Unit-Tests ohne Fehler/Skip, Datenbankprüfung mit PGlite und eigene DOM-Prüfung erfolgreich. Vollständiger bestehender HTTP-/DOM-Ablauf einschließlich neuer authentifizierter Karten-API erfolgreich. PostgreSQL16-Prüfung im POS/AI-Workflow ergänzt: konkurrierende Kartenfreigaben und gesperrtes Konto während wartender Anforderung. CI-Ergebnisse sind getrennt von lokalen Ergebnissen zu erfassen.

Noch kein Merge und keine Livebereitstellung dieses Bausteins. Bestehende produktive Restaurantdaten nicht zur Abnahme verändern; Windows/Offline unverändert lassen. Erst nach allen notwendigen Prüfungen und vollständigem beauftragtem Funktionsumfang veröffentlichen.
