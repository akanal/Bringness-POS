// Application-owned templates: Brevo transports the rendered message over SMTP.
export const supportAddress='info@bringness.de';
export const supportFooter='Bei Fragen schreiben Sie bitte an '+supportAddress+'.';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function formatMail(message){
 const text=String(message.text||'')+(String(message.text||'').includes(supportFooter)?'':'\n\n'+supportFooter);
 const footer='<p style="margin-top:28px">Bei Fragen schreiben Sie bitte an <a href="mailto:'+supportAddress+'">'+supportAddress+'</a>.</p>';
 const html=message.html?message.html+footer:'<div lang="de" style="font-family:Arial,sans-serif;color:#243746;font-size:16px;line-height:1.6;max-width:600px">'+text.split('\n\n').map(p=>'<p>'+escape(p).replace(/https:\/\/[^\s<]+/g,url=>'<a href="'+url+'">'+url+'</a>').replaceAll('\n','<br>')+'</p>').join('')+'</div>';
 return {...message,text,html,replyTo:message.replyTo||supportAddress};
}
export function accessMail(kind,{restaurant='Ihr Betrieb',link}){
 if(!/^https:\/\//.test(String(link)))throw Error('HTTPS_LINK_REQUIRED');
 const invitation=kind==='invitation';
 if(!['invitation','password','pin'].includes(kind))throw Error('UNKNOWN_MAIL_TEMPLATE');
 return {subject:invitation?'Bringness – Ihren Kellnerzugang einrichten':kind==='pin'?'Bringness – Stempel-PIN zurücksetzen':'Bringness – Passwort zurücksetzen',text:invitation?
 `Guten Tag,\n\n${restaurant} hat Sie zum Bringness-Service eingeladen. Über den folgenden Link können Sie Ihren Zugang innerhalb von 48 Stunden einrichten:\n${link}\n\nGeben Sie Ihren Namen ein und legen Sie Ihr eigenes Passwort fest. Danach richten Sie Ihre separate vierstellige Stempel-PIN mit Bestätigung ein. Einstempeln ist ausschließlich an der Kasse im Betrieb möglich.\n\nFalls Sie keine Einladung erwartet haben, ignorieren Sie bitte diese Nachricht.`:
 `Guten Tag,\n\nSie können über den folgenden Link ${kind==='pin'?'Ihre vierstellige Stempel-PIN':'Ihr Passwort'} neu festlegen:\n${link}\n\nDer Link gilt 30 Minuten und kann einmal verwendet werden. Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie bitte diese Nachricht.`};
}
export function billingMail(kind,z,link){
 if(!Number.isSafeInteger(z.amount_cents)||z.amount_cents<=0||z.currency!=='EUR')throw Error('INVALID_BILLING_AMOUNT');
 const amount=(z.amount_cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 if(kind==='invoice')return {subject:'Bringness – Rechnung '+z.invoice_number,text:`Guten Tag,\n\nvielen Dank für Ihre Zahlung. Ihre Rechnung ${z.invoice_number} über ${amount} finden Sie als PDF im Anhang. Die Zahlung wurde bereits bestätigt.\n\nIhre Rechnungen stehen auch in Ihrem Bringness-Kundenkonto bereit:\n${link}`};
 return {subject:'Bringness – Zahlungserinnerung zu Ihrem Abonnement',text:`Guten Tag,\n\ndie automatische Zahlung für Ihr Bringness-Abonnement über ${amount} konnte nicht abgeschlossen werden. Bitte prüfen Sie Ihren Zahlungsstatus in Ihrem Bringness-Kundenkonto:\n${link}\n\nBitte kontaktieren Sie uns, damit wir den offenen Zahlungsvorgang gemeinsam klären können. Falls Sie den Betrag inzwischen auf anderem Weg bezahlt haben, teilen Sie uns dies bitte mit. Diese Nachricht löst keine zusätzliche Abbuchung aus.`};
}
