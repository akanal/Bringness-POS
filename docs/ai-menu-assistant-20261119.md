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

## Ergänzter beauftragter Umfang

- Zwei weitere standardmäßig ausgeschaltete Standortfreigaben: Verkaufs-/Prognosedaten und angebundene POS-Karte. Betreiber legt optional den Ziel-Wareneinsatz selbst in Prozent des Nettoverkaufspreises fest. Ohne Ziel, aktuelle bestätigte Kosten und vorhandenen POS-Steuersatz bleibt der Preisvorschlag offen. Vergleich der aktuellen mit jeweils vorletzten bestätigten Zutatenpreisen ist ausdrücklich kein historischer Verkaufspreisvergleich.
- Bestehende Mehrjahres-/Tagesprognose und archivierte Artikelmengen liefern Vorbereitung für heute und die vorhandenen Folgetage mit Zeitaufteilung vor/ab17Uhr. Fehlende Daten erzeugen keine erfundenen Mengen. Aktueller Konto-/Sitzungs-/Quell-/Einstellungsabgleich nach der Prognose. Rechnerischer Überschuss im verfügbaren Planzeitraum wird mit freiem Bestand und Planverbrauch gezeigt; Haltbarkeit, Zustand und andere Verbräuche muss der Betreiber vor Bewerbung prüfen. Keine automatische Verwendungsfreigabe, Bestellung, Reservierung oder Lagerbuchung.
- Genau eine aktive POS-Anbindung für Kartenübernahme; aktuelle Inhaberberechtigung wird auf der POS-Seite gesperrt geprüft. Gerichte müssen über Rezept-Artikelcodes eindeutig zu vorhandenen Artikeln desselben Betriebs passen. Entwurf bindet den sichtbaren POS-Stand; Änderungen seit der Vorschau oder nach Entwurf sperren eine neue Übernahme.
- AI-Karte freigeben und POS übernehmen sind zwei ausdrückliche Schritte. Vorher-/Nachher-Vergleich und eigenes Pflichtkästchen für die reale POS-/QR-Änderung. Nur enthaltene Artikel: Name, Beschreibung, Bruttopreis, Sichtbarkeit und eindeutig bestehende aktive Kategorie. Nicht enthaltene Artikel bleiben bestehen. Keine Änderung von Steuern, Bildern, Extras, Übersetzungen, Rezepturen, Produktreihenfolge, Bestellungen oder historischen Belegen. Übersetzte Beschreibungen bleiben separat erhalten und müssen bei Bedarf gesondert gepflegt werden.
- POS-Änderungen und dauerhafter Übernahmenachweis liegen in derselben POS-Transaktion. Die getrennte AI-Datenbank speichert anschließend das Ergebnis. Bei verlorener Antwort/AI-Bestätigung liefert dieselbe Entwurfskennung den POS-Nachweis wieder, ohne spätere Artikeländerungen erneut zu überschreiben. Aktuelle Berechtigung auch beim Wiederabruf erforderlich. Kein Anspruch auf eine verteilte Gesamttransaktion.

Mehrere Gestaltungsvorlagen, druckfertiger Export und freie sprachliche KI-Gestaltung sind weiterhin zusätzliche, hier nicht beauftragte Erweiterungen. Der jetzige Baustein ist eine regelbasierte Assistenz mit vorhandenen Prognosen; kein neuer externer KI-Dienst und keine automatische Veröffentlichung von Restaurantkarten.

## Prüfung und Veröffentlichung

Lokal: 773 allgemeine Unit-Tests; gezielte Datenbank- und DOM-Prüfung einschließlich POS-Übernahme, geändertem Vorschau-/Artikelstand, widerrufener Inhaberberechtigung, verlorenem AI-Nachweis und Wiederholung ohne Überschreiben sowie verkaufsbasierter Vorbereitung bestanden. Vollständiger bestehender HTTP-/DOM-Ablauf mit migriertem produktivem Router bestanden. Die POS/AI-Prüfung führt dieselben Datenbankfälle auf PostgreSQL16 aus; der bestehende AI-Bereitstellungsworkflow verlangt sie nun ebenfalls vor der Serveroperation.

CI, Merge, technische Livebereitstellung und Live-Abgleich sind getrennt nachzuweisen und werden nach tatsächlichem Erfolg ergänzt. Produktive Restaurantdaten nicht zur Abnahme verändern; Windows/Offline bleiben unverändert. Bereitstellungsziel ausschließlich vorhandenes AI-Ziel mit Sicherung/Rückfall. Keine Betreiberfreigabe oder tatsächliche Kartenänderung aus einer technischen Bereitstellung ableiten.
