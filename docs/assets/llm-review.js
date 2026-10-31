"use strict";
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
const el = id => document.getElementById(id);
const root = "/api/local/llm/reviews";
const fieldLabels = {city: "Şehir", sector: "Sektör"};
const reasons = {uncertain:"Yeterli bilgi yok veya model emin değil.", unsupported_evidence:"Modelin dayandığı ifade iş/teslim yeri metninde bulunamadı.", multiple_provinces:"Birden fazla il belirtilmiş; tek bir şehir seçilemedi.", conflicting_province:"Modelin seçtiği il kaynak metniyle çelişiyor.", record_changed:"Kayıt veya işleme koşulları değişmiş."};
let items = [], selected = null, detail = null, options = null, page = 1, pages = 0;
let loading = false, saving = false, stale = false, detailRequest = null, queueRequest = null;
const filterIds = {q:"review-query",field:"review-field",activity:"review-activity",source_id:"review-source"};
function node(tag, text, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
function message(id, text) { el(id).textContent = text; el(id).hidden = !text; }
async function request(path, settings = {}) {
  const response = await IhaleApp.fetch(path, {cache:"no-store", ...settings});
  const body = await response.json();
  if (!response.ok) { const error = new Error(typeof body.detail === "string" ? body.detail : "İstek tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin."); error.status = response.status; throw error; }
  return body;
}
function params() { const p = new URLSearchParams(); for (const [key,id] of Object.entries(filterIds)) if (el(id).value) p.set(key,el(id).value); p.set("page", page); return p; }
function buttons() {
  for (const input of el("review-filters").elements) input.disabled = loading || saving;
  el("page-prev").disabled = loading || saving || page <= 1;
  el("page-next").disabled = loading || saving || page >= pages;
  for (const button of document.querySelectorAll(".queue-open")) button.disabled = loading || saving;
}
function date(value) { return value ? new Intl.DateTimeFormat("tr-TR", {dateStyle:"medium", ...(value.includes("T") ? {timeStyle:"short"} : {}),timeZone:"Europe/Istanbul"}).format(new Date(value.includes("T") ? value : value+"T12:00:00+03:00")) : "Belirtilmemiş"; }
function renderList() {
  if (!items.length) { el("review-list").replaceChildren(node("p", "Bu filtrelerde inceleme bekleyen kayıt yok.", "message")); return; }
  const table = node("table",null,"queue-table"), head = node("thead"), header = node("tr");
  header.append(node("th","İHALE"),node("th","İNCELEME")); head.append(header); table.append(head);
  const body = node("tbody");
  for (const item of items) {
    const row = node("tr"); row.setAttribute("aria-selected",String(item.id === selected));
    const title = node("td"), fields = node("td"), button = node("button",item.title,"queue-open");
    button.type = "button"; button.setAttribute("aria-controls","review-detail");
    button.addEventListener("click",()=>{if (!saving) open(item.id,true);});
    title.append(button,node("p",`${item.registration_number || item.external_id || "İKN yok"} · ${item.source_name}`,"queue-subtitle"),node("p",item.buyer || "Kurum belirtilmemiş","queue-subtitle"));
    for (const [field,needed] of Object.entries(item.needs)) if (needed) fields.append(node("span",fieldLabels[field],"field-chip"));
    row.append(title,fields); body.append(row);
  }
  table.append(body); el("review-list").replaceChildren(table); buttons();
}
function modelSection(kind, attempts) {
  const box = node("section",null,"review-model"); box.append(node("h3",`${fieldLabels[kind]} · Son model denemesi`));
  if (!attempts?.length) {box.append(node("p","Saklanmış model ayrıntısı bulunmuyor.")); return box;}
  const last = attempts[0];
  const explanation = last.reason ? (reasons[last.reason] || "Sonuç kaydedilmedi.") : last.outcome === "failed" ? "Model çağrısı tamamlanamadı." : last.outcome === "saved" ? "Model bir öneri kaydetti; bu alan hâlâ inceleme bekliyor." : "Model kullanılabilir bir sonuç üretemedi.";
  box.append(node("p",explanation));
  const prediction = last.city || last.category;
  if (prediction) box.append(node("p",`Modelin önerisi: ${prediction}${typeof last.confidence === "number" ? " · Güven: %" + Math.round(last.confidence*100) : ""}`));
  if (last.evidence) box.append(node("blockquote", typeof last.evidence === "string" ? last.evidence : JSON.stringify(last.evidence)));
  box.append(node("p",`${date(last.at)} · ${last.model || "Model bilgisi yok"}`,"queue-help"));
  const history = node("details"); history.append(node("summary",`Saklanan denemeler (${attempts.length})`),node("pre",JSON.stringify(attempts,null,2))); box.append(history); return box;
}
function renderDetail(item, focus) {
  stale = false;
  const panel = node("article",null,"review-panel"); panel.tabIndex = -1;
  const navigation = node("div",null,"detail-navigation"), index = items.findIndex(t=>t.id===item.id);
  const previous = node("button","← Önceki","text-button"); previous.type="button"; previous.disabled=index<=0; previous.addEventListener("click",()=>open(items[index-1].id,true));
  navigation.append(previous,node("span",`${index+1}. kayıt · ${items.length} satırlık sayfa`)); panel.append(navigation);
  panel.append(node("span",item.source_name,"source-tag"),node("h2",item.title),node("p",item.buyer || "Kurum belirtilmemiş","detail-buyer"));
  const facts = node("dl",null,"review-facts");
  for (const [label,value] of [["İKN",item.registration_number||item.external_id||"Belirtilmemiş"],["İhale durumu",{active:"Aktif",inactive:"Pasif",unknown:"Belirsiz"}[item.activity_status]],["İhale tarihi",date(item.tender_at||item.tender_date)],["Son teklif tarihi",date(item.deadline)],["Kaynak kategorisi",item.source_category||"Belirtilmemiş"],["Yayın tarihi",date(item.published_at)]]) {
    const part=node("div");part.append(node("dt",label),node("dd",value));facts.append(part);
  }
  panel.append(facts);
  const links=node("div",null,"review-links");
  for (const [label,url] of [["Kaynak ilanı aç ↗",item.source_url],["Uygulamada görüntüle ↗",IhaleApp.href(`/tenders/${item.id}`)]]) if (url) {
    const link=node("a",label);link.href=url;link.target="_blank";link.rel="noopener noreferrer";links.append(link);
  }
  panel.append(links);
  const location=node("section",null,"review-location");location.append(node("h3","İşin yapılacağı / teslim edileceği yer"),node("p",item.location_text||"Kaynakta teslim yeri bilgisi bulunmuyor."));panel.append(location);
  for (const kind of ["city","sector"]) if(item.needs[kind]) panel.append(modelSection(kind,item.attempts[kind]));
  const raw=node("details",null,"raw-data");raw.append(node("summary","Ham veri · Saklanan kaynak alanları"),node("p","Sistemde kayıtlı kaynak alanlarıdır; orijinal sayfanın veya PDF’nin tamamı değildir."),node("pre",JSON.stringify(item.raw,null,2)));panel.append(raw);
  const form=node("form",null,"review-form");form.id="manual-review-form";
  form.append(node("p","Yalnızca emin olduğunuz alanı seçin. Boş bıraktığınız alan değişmez.","queue-help"));
  const fields=node("div",null,"manual-fields");
  for(const [kind,list,current] of [["city",options.cities,item.city],["sector",options.categories,item.proposed_category]]) {
    const wrapper=node("div"),label=node("label",fieldLabels[kind]);label.htmlFor=`manual-${kind}`;wrapper.append(label);
    if(item.needs[kind]) {
      const select=node("select");select.id=`manual-${kind}`;const blank=node("option","Değiştirme / boş bırak");blank.value="";select.append(blank);
      for(const name of list){const option=node("option",name);option.value=name;select.append(option);}
      wrapper.append(select);
      if(current)wrapper.append(node("p",`Mevcut öneri: ${current}`,"queue-help"));
    } else wrapper.append(node("p",current||"Belirtilmemiş","manual-current"));
    fields.append(wrapper);
  }
  const label=node("label","İnceleme notu (isteğe bağlı)");label.htmlFor="manual-reason";
  const reason=node("textarea");reason.id="manual-reason";reason.rows=2;reason.maxLength=2000;
  const actions=node("div",null,"review-actions"),save=node("button","Kaydet ve sonraki →","primary"),skip=node("button","Kaydetmeden geç →","text-button");
  save.type="submit";save.id="manual-save";save.disabled=true;skip.type="button";skip.id="manual-skip";skip.disabled=index===items.length-1&&page>=pages;
  skip.addEventListener("click",next);actions.append(save,skip);
  form.append(fields,label,reason,actions);
  form.addEventListener("change",()=>{save.disabled=stale || !form.querySelector("select:not([disabled]) option:checked:not([value=''])");});
  form.addEventListener("submit",event=>{event.preventDefault();saveItem(item);});panel.append(form);el("review-detail").replaceChildren(panel);
  if(focus)panel.focus({preventScroll:false});
}
async function open(id, focus=false) {
  if(saving)return;
  if(detailRequest)detailRequest.abort();
  const controller=new AbortController();detailRequest=controller;selected=id;detail=null;renderList();
  el("review-detail").replaceChildren(node("p","İhale bilgileri yükleniyor…","message"));
  try {
    const item=await request(`${root}/${id}`,{signal:controller.signal});
    if(controller.signal.aborted)return;detail=item;renderDetail(item,focus);
  } catch(error){if(error.name!=="AbortError")el("review-detail").replaceChildren(node("p",error.message,"review-error"));}
  finally{if(detailRequest===controller)detailRequest=null;}
}
async function load({preserve=false}={}) {
  if(saving)return;
  if(queueRequest)queueRequest.abort();if(detailRequest)detailRequest.abort();
  const controller=new AbortController();queueRequest=controller;loading=true;buttons();message("review-error","");if(!preserve)message("review-notice","");
  el("review-detail").replaceChildren(node("p","İhale bilgileri yükleniyor…","message"));
  try {
    const data=await request(`${root}?${params()}`,{signal:controller.signal});if(controller.signal.aborted)return;
    if(!data.items.length&&page>1&&page>data.pages){page=Math.max(1,data.pages);loading=false;queueRequest=null;return load({preserve:true});}
    items=data.items;pages=data.pages;el("queue-total").textContent=data.total.toLocaleString("tr-TR");el("page-label").textContent=`${page} / ${pages} sayfa`;
    el("review-pagination").hidden=pages<=1;renderList();history.replaceState(null,"",`${location.pathname}?${params()}`);
    const id=items.find(t=>t.id===selected)?.id||items[0]?.id;
    if(id)await open(id);else {selected=null;detail=null;el("review-detail").replaceChildren(node("p","Bu filtrelerde bekleyen kayıt kalmadı.","message"));}
  } catch(error){if(error.name!=="AbortError"){items=[];selected=null;detail=null;renderList();el("review-detail").replaceChildren();message("review-error",error.message);}}
  finally{if(queueRequest===controller){queueRequest=null;loading=false;buttons();}}
}
async function next(){if(saving)return;const i=items.findIndex(t=>t.id===selected);if(items[i+1])await open(items[i+1].id,true);else if(page<pages){page++;selected=null;await load();}}
async function saveItem(item){
  if(saving||stale||loading||detailRequest||detail?.id!==item.id)return;
  const payload={version:item.version,reason:el("manual-reason").value.trim()||null};
  if(el("manual-city")?.value)payload.city=el("manual-city").value;
  if(el("manual-sector")?.value)payload.category=el("manual-sector").value;
  if(!payload.city&&!payload.category)return;
  saving=true;buttons();for(const control of el("manual-review-form").elements)control.disabled=true;message("review-error","");
  const index=items.findIndex(t=>t.id===item.id), nextId=items[index+1]?.id||items[index-1]?.id||null;
  try{
    await request(`${root}/${item.id}/resolve`,{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"IhaleListele"},body:JSON.stringify(payload)});
    message("review-notice",`${payload.city ? "Şehir: "+payload.city : ""}${payload.city&&payload.category ? " · " : ""}${payload.category ? "Sektör: "+payload.category : ""} kaydedildi. Diğer alanlar korundu.`);
    selected=nextId;saving=false;await load({preserve:true});
  }catch(error){
    message("review-error",error.status===409?"Kayıt bu sırada değişti. Yenile düğmesine basıp güncel bilgileri inceleyin.":error.message);
    saving=false;buttons();for(const control of el("manual-review-form").elements)control.disabled=false;
    if(error.status===409||error.status===404){stale=true;el("manual-save").disabled=true;}
  }
}
el("review-filters").addEventListener("submit",event=>{event.preventDefault();page=1;selected=null;load();});
el("review-reload").addEventListener("click",()=>options ? load() : init());
for(const id of ["review-field","review-activity","review-source"])el(id).addEventListener("change",()=>{page=1;selected=null;load();});
el("page-prev").addEventListener("click",()=>{page--;selected=null;load();});el("page-next").addEventListener("click",()=>{page++;selected=null;load();});
async function init(){try{
  options=await request(`${root}/options`);
  for(const source of options.sources){const option=node("option",source.name);option.value=source.id;el("review-source").append(option);}
  const search=new URLSearchParams(location.search);for(const [key,id]of Object.entries(filterIds)){if(search.has(key))el(id).value=search.get(key);}
  for(const [id,fallback]of [["review-field","all"],["review-activity","active"]])if(!el(id).value)el(id).value=fallback;
  const requested=Number(search.get("page")||1);page=Number.isInteger(requested)&&requested>=1&&requested<=100000?requested:1;
  await load();
}catch(error){message("review-error",error.message);}}
init();
});
