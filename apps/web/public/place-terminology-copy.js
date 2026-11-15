// Only fixed interface copy is passed here; names and business/customer data stay untouched.
window.bnPlaceCopy=(text,terms)=>{
 const singular=terms?.singular||'Tisch',plural=terms?.plural||'Tische';
 if(singular==='Tisch'&&plural==='Tische')return text;
 const copy=String(text).replace(/Ersten Tisch anlegen/g,singular+' anlegen').replace(/einen freien Tisch/g,'ein freies Ziel').replace(/am ursprünglichen Tisch/g,'am ursprünglichen Ziel').replace(/für diesen Tisch/g,'für dieses Bestellziel').replace(/Dieser Tisch/g,'Dieses Bestellziel').replace(/einen Tisch auswählen/g,'das Bestellziel auswählen').replace(/deinen Tisch/g,'deine Auswahl').replace(/zum Tisch bringen/g,'zum Bestellziel bringen').replace(/QR scannen oder NFC am Tisch berühren/g,'QR scannen oder NFC berühren').replace(/am Tisch abgerechnet/g,'hier abgerechnet');
 return copy.replace(/Tisch(?:bestellungen|bestellung|zuweisung|verwaltung|zahlung|übergabe|namen|name|plan|link|en|e)?/g,word=>{
  const suffix=word.slice(5);
  if(suffix==='e'||suffix==='en')return plural;
  if(suffix==='name'||suffix==='namen')return singular+'name'+(suffix==='namen'?'n':'');
  if(suffix)return singular+suffix;
  return singular;
 });
};
