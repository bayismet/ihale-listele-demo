"use strict";
IhaleApp.memberReady.then(allowed => {
if (!allowed) return;
const el=id=>document.getElementById(id);
let page=1,pages=0,busy=false,enabled=true,unread=0,preferencesReady=false;
function node(tag,text,cls){const item=document.createElement(tag);if(text!=null)item.textContent=text;if(cls)item.className=cls;return item;}
function error(text){el("notifications-error").textContent=text;el("notifications-error").hidden=!text;}
function changed(){window.dispatchEvent(new Event("ihale-notifications-changed"));}
async function request(path,options={}){
 let response;
 try{response=await IhaleApp.fetch(path,{cache:"no-store",...options});}
 catch(_){throw new Error("Sunucuya ulaşılamıyor. Bağlantınızı kontrol edip yeniden deneyin.");}
 if(!response.ok)throw new Error(response.status===401?"Bildirimler için giriş yapmalısınız.":"İşlem tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.");
 return response.json();
}
function date(value,exact=false){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"long",...(exact?{timeStyle:"short"}:{}),timeZone:"Europe/Istanbul"}).format(new Date(value.includes("T")?value:value+"T12:00:00+03:00"));}
function controls(){el("only-unread").disabled=busy;el("notifications-enabled").disabled=busy||!preferencesReady;el("read-all").disabled=busy||!unread;for(const button of document.querySelectorAll(".notification-read"))button.disabled=busy;el("notifications-prev").disabled=busy||page<=1;el("notifications-next").disabled=busy||page>=pages;}
async function load(){
 if(busy)return;busy=true;controls();error("");el("notifications-list").setAttribute("aria-busy","true");
 try{
  const data=await request(`/api/me/notifications?page=${page}&unread_only=${el("only-unread").checked}`);
  if(!data.items.length&&page>1&&page>data.pages){page=Math.max(1,data.pages);busy=false;return load();}
  unread=data.unread_count;pages=data.pages;el("unread-summary").textContent=`${data.unread_count} okunmamış`;
  el("read-all").disabled=!data.unread_count;
  el("notifications-pagination").hidden=pages<=1;el("notifications-page").textContent=`${page} / ${pages} sayfa`;
  const cards=data.items.map(item=>{
   const card=node("article",null,`personal-card notification-card${item.read?" is-read":""}`);
   const link=node("a",null,"personal-card-link");link.href=IhaleApp.href(`/tenders/${item.tender_id}`);
   link.append(node("span",item.kind==="24_hours"?"Son 24 saat":"Son 7 gün",`notification-kind${item.kind==="24_hours"?" urgent":""}`),node("h2",item.title));
   link.append(node("p",`${item.exact_time?"Son teklif tarihi ve saati":"Son teklif günü"}: ${date(item.exact_time?item.deadline_at:item.deadline,item.exact_time)}`));
   link.append(node("p",`Oluşturulma: ${date(item.created_at,true)}`,"notification-created"));
   link.addEventListener("click",async event=>{
    if(item.read||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    try{await request(`/api/me/notifications/${item.id}/read`,{method:"POST",headers:{"X-Requested-With":"IhaleListele"}});}catch(_){}
    location.assign(link.href);
   });
   card.append(link);
   if(item.read)card.append(node("span","Okundu","notification-read-label"));
   else{const read=node("button","Okundu işaretle","notification-read");read.type="button";read.addEventListener("click",()=>mark(item.id));card.append(read);}
   return card;
  });
  if(!cards.length){const empty=node("div",null,"message");empty.append(node("h3",!enabled?"Hatırlatmalar kapalı":el("only-unread").checked?"Okunmamış bildirim yok":"Şu anda yaklaşan son tarih bildirimi yok"),node("p",enabled?"Favori ihaleleriniz son haftaya veya son 24 saate girdiğinde burada görünür.":"Site içi hatırlatmaları yukarıdaki tercihten açabilirsiniz."));const link=node("a","Favorilerimi incele →");link.href=IhaleApp.href("/favorites");empty.append(link);cards.push(empty);}
  el("notifications-list").replaceChildren(...cards);changed();
 }catch(err){unread=0;error(err.message);el("read-all").disabled=true;}
 finally{busy=false;controls();el("notifications-list").setAttribute("aria-busy","false");}
}
async function mark(id){if(busy)return;busy=true;controls();try{
 await request(id?`/api/me/notifications/${id}/read`:"/api/me/notifications/read-all",{method:"POST",headers:{"X-Requested-With":"IhaleListele"}});
 busy=false;await load();
}catch(err){error(err.message);busy=false;controls();}}
el("read-all").addEventListener("click",()=>mark(null));
el("only-unread").addEventListener("change",()=>{page=1;load();});
el("notifications-prev").addEventListener("click",()=>{page--;load();});el("notifications-next").addEventListener("click",()=>{page++;load();});
el("notifications-enabled").addEventListener("change",async()=>{
 if(busy)return;busy=true;controls();error("");
 try{const result=await request("/api/me/notifications/preferences",{method:"PATCH",headers:{"Content-Type":"application/json","X-Requested-With":"IhaleListele"},body:JSON.stringify({enabled:el("notifications-enabled").checked})});enabled=result.enabled;el("preference-status").textContent=enabled?"Site içi hatırlatmalar açıldı.":"Site içi hatırlatmalar kapatıldı.";el("preference-status").hidden=false;page=1;busy=false;await load();}
 catch(err){el("notifications-enabled").checked=enabled;error(err.message);busy=false;controls();}
});
async function init(){try{const preferences=await request("/api/me/notifications/preferences");preferencesReady=true;enabled=preferences.enabled;el("notifications-enabled").checked=enabled;await load();}catch(err){error(err.message);}}
init();
setInterval(()=>{if(!document.hidden&&!busy){if(preferencesReady)load();else init();}},60000);
});
