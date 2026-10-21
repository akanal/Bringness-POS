# 24-Stunden-Eingaben: weiterer Entwicklungsblock

Die bereits umgestellte AI-Planung wird um die übrigen nativen Zeiteingaben ergänzt: POS-Artikelverfügbarkeit, Dienstplan, nachvollziehbare Stempelkorrektur und administrative AI-Werbezeiträume. Uhrzeiten sind explizite HH:MM-Felder statt vom Browsergebiet abhängiger AM/PM-Widgets. Bei Zeitpunkten bleiben Datum und Uhrzeit getrennt sichtbar und werden wie bisher in der Gerätezeitzone nach ISO/UTC umgewandelt.

Artikelverfügbarkeit prüft die Eingabegültigkeit auch bei ihrem Speichern-Button außerhalb eines Formulars. Frühstücks-/Mittags-/Saisonvorgaben bleiben erhalten. Serverseitige Rechte, Stempelprotokoll, Angebotsbestätigung und Zahlungsvoraussetzungen werden nicht geändert.

Ausgeführt: JavaScript-Syntaxprüfung und Patch-/Whitespace-Prüfung. Weitere Funktions- und Geräteprüfungen wurden auf Wunsch des Inhabers zurückgestellt und stehen zusammen in test-backlog.md (T02). Dies ist ein Entwicklungsstand, keine Behauptung bestandener Abnahme oder Live-Veröffentlichung. Vor Veröffentlichung die bestehenden Personal-/Dienstplan-/Werbe-Oberflächentests und den praktischen 24-Stunden-Durchlauf abschließen.
