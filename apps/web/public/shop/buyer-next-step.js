export function buyerNextStep(order){
 if(order.testPayment?.mode==='test')return {title:'Testvorgang – keine Warenfreigabe',text:'Dieser Test-Zahlungsstand ist keine echte Zahlung und gibt keine Ware frei. Für eine reale Bestellung ist ein gesondert freigegebener Ablauf erforderlich.'};
 if(order.status==='received')return {title:'Der Händler prüft deine Bestellung',text:'Die Bestellung ist eingegangen, aber noch nicht angenommen. Warte auf den nächsten bestätigten Händlerstatus. Es ist noch kein Versand- oder Abholtermin zugesagt.'};
 if(order.status==='accepted')return order.method==='pickup'
  ?{title:'Auf die Abholfreigabe warten',text:'Der Händler hat die Bestellung angenommen. Warte auf „Abholbereit“, bevor du dich auf den Weg machst. Prüfe anschließend die gespeicherten Abholhinweise.'}
  :{title:'Auf die Versandmeldung warten',text:'Der Händler hat die Bestellung angenommen. Der nächste Schritt ist die Versandmeldung des Händlers. Eine Annahme ist noch kein Versandnachweis; ein Liefertermin wird hier nicht errechnet.'};
 if(order.status==='ready_for_pickup')return {title:'Abholhinweise prüfen',text:'Der Händler hat die Bestellung als abholbereit markiert. Prüfe Ort und Hinweise in der Bestellung und kläre offene Fragen direkt mit dem Händler. Dieser Status bestätigt keine Zahlung.'};
 if(order.status==='shipped')return {title:'Versandangaben prüfen',text:order.tracking?'Der Händler hat den Versand gemeldet. Prüfe die angegebenen Sendungsdaten; eine Händlerangabe bestätigt noch keine Zustellung.':'Der Händler hat den Versand gemeldet. Eine Sendungsnummer liegt im geladenen Stand nicht vor. Frage bei Bedarf beim Händler nach; eine Zustellung ist hier nicht bestätigt.'};
 if(order.status==='rejected')return {title:'Bestellung wurde abgelehnt',text:'Der Händler hat diese Bestellung abgelehnt. Für diesen Vorgang ist keine Lieferung oder Abholung vorgesehen. Eine neue Bestellung ist eine eigene Entscheidung.'};
 if(order.status==='cancelled')return {title:'Bestellung wurde storniert',text:'Für diesen Vorgang ist keine weitere Lieferung oder Abholung vorgesehen. Der Status ist kein Erstattungsnachweis. Kläre offene Fragen direkt mit dem Händler.'};
 return {title:'Bestellstand erneut prüfen',text:'Ein nächster Schritt ist aus diesem Stand nicht sicher ableitbar. Lade den aktuellen Bestellstand; bei offenen Fragen nutze das Händlerprofil.'};
}
