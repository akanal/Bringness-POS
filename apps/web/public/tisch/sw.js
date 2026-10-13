self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch{}
  const url=typeof data.url==='string'&&data.url.startsWith('/tisch/?')?data.url:'/tisch/';
  event.waitUntil(self.registration.showNotification(data.title||'Bringness · Abholbereit',{body:data.body||'Ihre Bestellung ist fertig. Bitte am Tresen abholen.',tag:data.tag||'bringness-pickup',requireInteraction:true,vibrate:[300,100,300,100,500],data:{url}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(new URL(client.url).pathname.startsWith('/tisch/')){await client.navigate(event.notification.data.url);return client.focus()}}return self.clients.openWindow(event.notification.data.url)})())});
