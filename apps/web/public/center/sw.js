self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Bringness · Abholbereit',{
 body:data.body||'Deine Bestellung ist abholbereit.',tag:data.tag||'center-ready',
 data:{url:data.url||'/center/status.html'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||'/center/status.html',self.location.origin);
 if(target.origin!==self.location.origin||target.pathname!=='/center/status.html')return;
 event.waitUntil(clients.openWindow(target.href));
});
