(()=>{
  if(document.getElementById('bringness-help-button'))return;
  const isService=location.pathname.startsWith('/service');
  const topics=[
  {
    "role": "owner",
    "title": "Betrieb oder Kasse anlegen",
    "terms": "betrieb kasse restaurant anlegen erstellen neuer betrieb",
    "answer": "Melde dich als Inhaber in der Online-Kasse an. Oben bei „Betrieb“ gibst du einen Namen ein und wählst „+ Betrieb“. Danach kannst du die Betriebsart in den Einstellungen auswählen.",
    "view": "einstellungen",
    "id": "topic-1"
  },
  {
    "role": "owner",
    "title": "Kellner einladen",
    "terms": "kellner mitarbeiter einladen email aktivierung erstcode service",
    "answer": "Wähle zuerst deinen Betrieb. Öffne die Einstellungen und dort „Kellner & Mitarbeiterzugänge“. Trage Name und E-Mail ein. Der Kellner erhält einen Bestätigungslink und einen sechsstelligen Erstcode. Falls die E-Mail nicht ankommt, prüfe auch den Spamordner.",
    "view": "einstellungen",
    "id": "topic-2"
  },
  {
    "role": "owner",
    "title": "Tisch und QR-Code",
    "terms": "tisch tische qr code nfc tag bestellen zuweisen",
    "answer": "Öffne „Tische“, lege einen Tisch an und öffne seine Tisch-QR-Ansicht. Den Link kannst du auch auf einen NFC-Tag schreiben. Für Tischbestellungen müssen die passenden Restaurant- und QR-Funktionen aktiviert sein.",
    "view": "tische",
    "id": "topic-3"
  },
  {
    "role": "owner",
    "title": "Artikel und Speisekarte",
    "terms": "artikel speisen speisekarte produkt kategorie preis",
    "answer": "Öffne „Mehr“ → „Artikel“. Dort kannst du Kategorien und Produkte für den ausgewählten Betrieb pflegen.",
    "view": "artikel",
    "id": "topic-4"
  },
  {
    "role": "owner",
    "title": "Beleg finden",
    "terms": "beleg bon rechnung qr quittung pdf herunterladen",
    "answer": "Öffne „Mehr“ → „Belege“. Dort findest du die gespeicherten Belege und kannst ein PDF herunterladen.",
    "view": "belege",
    "id": "topic-5"
  },
  {
    "role": "owner",
    "title": "TSE-Status prüfen",
    "terms": "tse signatur fiskal status steuer zertifiziert",
    "answer": "Öffne „Mehr“ → „TSE“. Die Ansicht zeigt den tatsächlichen Verbindungs- und Signaturstatus. Ein vorbereiteter Beleg allein ist noch keine TSE-Signatur.",
    "view": "tse",
    "id": "topic-6"
  },
  {
    "role": "owner",
    "title": "Lizenz und Abo",
    "terms": "abo lizenz preis rechnung kündigung zahlung modul",
    "answer": "Die Übersicht „Lizenz & Abo“ zeigt die verfügbaren Module, ihren Status und Rechnungen. Prüfe dort, ob das Restaurant-Modul für Tische und Service aktiviert ist.",
    "view": "lizenz",
    "id": "topic-7"
  },
  {
    "role": "waiter",
    "title": "Erstcode und Anmeldung",
    "terms": "login anmelden code passwort erstcode aktivierung email auge",
    "answer": "Öffne den Bestätigungslink aus deiner E-Mail. Melde dich dann im Servicebereich mit deiner E-Mail und dem sechsstelligen Erstcode an. Beim ersten Login legst du einen eigenen sechsstelligen Code fest. Mit dem Auge kannst du die Eingabe anzeigen.",
    "href": "/service/",
    "id": "topic-8"
  },
  {
    "role": "waiter",
    "title": "Meine Tische fehlen",
    "terms": "tisch tische bereich zuweisung fehlen nicht sichtbar",
    "answer": "Im Servicebereich siehst du nur Tische, die dir zugewiesen wurden. Bitte den Inhaber oder die Restaurantverwaltung, dir einen Bereich oder einzelne Tische zuzuordnen.",
    "id": "topic-9"
  },
  {
    "role": "waiter",
    "title": "Bestellung aufnehmen",
    "terms": "bestellung bestellen speisen artikel senden aufnahme",
    "answer": "Öffne einen zugewiesenen Tisch, wähle die Artikel und Mengen und tippe auf „Bestellung aufnehmen“. Prüfe die Rückmeldung, bevor du erneut sendest.",
    "id": "topic-10"
  },
  {
    "role": "waiter",
    "title": "Bestellung korrigieren",
    "terms": "korrektur ändern menge stornieren falsch bestellt",
    "answer": "Öffne den betroffenen Tisch und die offene Bestellung. Bei einer Korrektur gibst du die neue Menge und einen Grund an. Wenn die Aktion dort nicht angeboten wird, wende dich an den Inhaber.",
    "id": "topic-11"
  },
  {
    "role": "both",
    "title": "Verbindung prüfen",
    "terms": "offline online verbindung funktioniert nicht laden fehler",
    "answer": "Prüfe zuerst die Internetverbindung und lade die Seite neu. Wenn die Meldung bleibt, notiere den Wortlaut und den betroffenen Betrieb für den Support.",
    "id": "topic-12"
  }
];
  const visible=topics.filter(t=>t.role==='both'||t.role===(isService?'waiter':'owner'));
  const normalize=s=>String(s).toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const button=document.createElement('button');button.id='bringness-help-button';button.type='button';button.textContent='? Hilfe';button.setAttribute('aria-label','Bringness Hilfe öffnen');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','bringness-help-panel');
  const panel=document.createElement('section');panel.id='bringness-help-panel';panel.className='bringness-help';panel.hidden=true;panel.setAttribute('aria-label','Bringness Support-Assistent');
  panel.innerHTML='<header><strong>Bringness Hilfe</strong><button type="button" aria-label="Hilfe schließen">×</button></header><div class="help-log" role="log" aria-live="polite"></div><div class="help-topics" aria-label="Häufige Fragen"></div><form><input type="search" maxlength="2000" aria-label="Frage eingeben" placeholder="Deine Frage …" required><button type="submit">Fragen</button></form><footer>Antworten aus der Bringness-Schnellhilfe · <button type="button" id="supportHistory">Verlauf</button> <button type="button" id="supportNew">Neue Anfrage</button> <button type="button" id="supportEscalate">An Support weitergeben</button><p id="supportNotice">Angemeldete Supportgespräche werden für die Bearbeitung und Problemanalyse gespeichert. Bitte keine Passwörter eingeben.</p></footer>';
  document.body.append(button,panel);
  const log=panel.querySelector('.help-log'),input=panel.querySelector('input'),chips=panel.querySelector('.help-topics');
  function message(value,who='bot',topic){const item=document.createElement('div');item.className='help-message '+who;item.textContent=value;if(topic){const action=topic.view&&!isService?document.querySelector('[data-view="'+topic.view+'"], [data-user-view="'+topic.view+'"]'):null;const link=document.createElement(action?'button':'a');link.textContent=action?'Bereich öffnen →':topic.href?'Servicebereich öffnen →':'';if(action){link.type='button';link.style.cssText='display:block;margin-top:9px;border:0;background:transparent;color:#075a81;font:700 14px system-ui;cursor:pointer;padding:0';link.onclick=()=>{action.click();close()}}else if(topic.href){link.href=topic.href;link.style.display='block';link.style.marginTop='9px'}if(link.textContent)item.append(link)}log.append(item);log.scrollTop=log.scrollHeight}
  function close(){panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus()}
  let conversationId=null,lastToken=null,busy=false;
  const authToken=()=>localStorage.getItem(isService?'bringness-waiter-token':'bringness-pos-token');
  async function request(path,body){const r=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+(authToken()||'')},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||'Support konnte nicht geladen werden.');return j}
  function identity(){const current=authToken();if(current!==lastToken){lastToken=current;conversationId=null;log.replaceChildren()}return current}
  button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){identity();if(!log.childElementCount)message('Hallo! Ich bin der automatische Bringness-Supportassistent. Häufige Fragen beantworte ich sofort. Spezielle Fragen übernimmt unser Supportteam.');input.focus()}};
  panel.querySelector('header button').onclick=close;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)close()});
  async function ask(question){if(busy)return;identity();busy=true;panel.querySelector('form button').disabled=true;message(question,'user');try{if(authToken()){const j=await request('/support/message',{question,conversationId});conversationId=j.conversationId;message('Automatische Antwort: '+j.answer,'bot',j.topic)}else{const topic=visible.find(t=>t.title===question);message(topic?topic.answer:'Bitte melde dich an, damit wir diese Frage speichern und an das Supportteam weitergeben können.','bot',topic)}}catch(error){message(error.message)}finally{busy=false;panel.querySelector('form button').disabled=false}}
  for(const topic of visible){const chip=document.createElement('button');chip.type='button';chip.textContent=topic.title;chip.onclick=()=>ask(topic.title);chips.append(chip)}
  panel.querySelector('form').onsubmit=event=>{event.preventDefault();const question=input.value.trim();if(question&&!busy){input.value='';ask(question)}};
  async function openConversation(id){const j=await request('/support/conversations/'+id);conversationId=id;log.replaceChildren();message('Status: '+({open:'offen',needs_admin:'beim Supportteam',answered:'beantwortet',closed:'abgeschlossen'}[j.conversation.status]||j.conversation.status));for(const m of j.messages)message((m.author_kind==='auto'?'Automatische Antwort: ':m.author_kind==='admin'?'Bringness Support: ':'')+m.content,m.author_kind==='customer'?'user':'bot');}
  panel.querySelector('#supportHistory').onclick=async()=>{if(busy)return;identity();try{const j=await request('/support/conversations');log.replaceChildren();message('Verlauf – wähle eine Anfrage. Über „Fragen“ kannst du anschließend weiterschreiben.');conversationId=null;for(const c of j.conversations){const b=document.createElement('button');b.type='button';b.textContent=c.subject+' · '+new Date(c.updated_at).toLocaleDateString('de-DE');b.onclick=()=>openConversation(c.id).catch(e=>message(e.message));log.append(b)}if(!j.conversations.length)message('Noch keine gespeicherten Anfragen.')}catch(e){message(e.message)}};
  panel.querySelector('#supportEscalate').onclick=async()=>{identity();if(!conversationId)return message('Bitte stelle zuerst deine Frage und melde dich an.');try{const j=await request('/support/conversations/'+conversationId+'/escalate',{});message(j.message)}catch(e){message(e.message)}};
  panel.querySelector('#supportNew').onclick=()=>{if(busy)return;identity();conversationId=null;log.replaceChildren();message('Wobei können wir helfen? Häufige Fragen beantwortet der automatische Assistent.');input.focus()};
  if(new URLSearchParams(location.search).get('support')==='open')button.click();
})();
