// Only installed user media. This is not an offline site/source-code cache.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith('/dofus-local/'))return;
  event.respondWith(caches.open('arena-forge-user-media-v1').then(cache=>cache.match(event.request)).then(response=>response||new Response('User library asset not installed',{status:404,headers:{'Content-Type':'text/plain','X-Content-Type-Options':'nosniff'}})));
});
