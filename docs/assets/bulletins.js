
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
(() => {
  const el = id => document.getElementById(id);
  const currentYear = Number(new Intl.DateTimeFormat("en",{year:"numeric",timeZone:"Europe/Istanbul"}).format(new Date()));
  let page = 1, state = null, busy = false, polling = false, timer;
  const labels = {starting:"Başlatılıyor",running:"Aktarım sürüyor",completed:"Tamamlandı",complete:"Tamamlandı",failed:"Hata",interrupted:"Yarım kaldı",stopped:"Durduruldu",stopping:"Durduruluyor",downloading:"İndiriliyor",extracting:"Ayrıştırılıyor",importing:"Aktarılıyor",pending:"Bekliyor"};
  const kinds = ["mal","yapim","hizmet","danismanlik"];
  function text(tag,value,className) {const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;}
  function dayLabel(day) {return day ? new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",year:"numeric"}).format(new Date(day+"T12:00:00")) : "Henüz yok";}
  function number(value) {return value == null ? "—" : Number(value).toLocaleString("tr-TR");}
  function error(message="") {el("archive-error").textContent=message;el("archive-error").hidden=!message;}
  function controls() {
    const disabled=busy || !state?.can_start;
    for(const id of ["day-start","resume-start"])el(id).disabled=disabled;
    el("bulletin-day").disabled=Boolean(state?.running)||busy;
    el("select-today").disabled=Boolean(state?.running)||busy;
    el("archive-stop").hidden=!state?.running;
    el("archive-stop").disabled=busy||state?.stop_requested;
    el("archive-prev").disabled=polling||page<=1;
    el("archive-next").disabled=polling||!state||page>=state.pages;
  }
  function render(data) {
    state=data;
    el("bulletin-day").max=data.today;
    if(!el("bulletin-day").value)el("bulletin-day").value=data.today;
    el("archive-last-day").textContent=dayLabel(data.last_completed_day);
    el("archive-announcements").textContent=number(data.summary.announcements);
    el("archive-completed-days").textContent=number(data.summary.completed_days);
    el("resume-description").textContent=`${dayLabel(data.resume_from)} tarihinden bugüne kadar kontrol eder. Hatalı veya yarım günleri atlamaz; henüz kapanmamış son günü tekrar kontrol eder.`;
    const job=data.job;
    el("archive-job-status").textContent=job ? `${labels[job.status]||job.status}${job.current_day ? " · "+dayLabel(job.current_day) : ""}` : data.running ? "Başka bir EKAP aktarımı çalışıyor" : "Aktarıma hazır";
    el("archive-job-message").textContent=job?.message||"Seçili günü aktarabilir veya kaldığınız yerden devam edebilirsiniz.";
    const total=job?.total_days||0,done=Math.min(total,job?.done_days||0);
    el("archive-progress").max=total||1;el("archive-progress").value=done;
    el("archive-progress-label").textContent=`${number(done)} / ${number(total)} gün tamamlandı${total ? " · %"+Math.floor(done/total*100) : ""}`;
    el("archive-job-counts").textContent=job ? `${number(job.created)} yeni · ${number(job.updated)} güncellendi · ${number(job.skipped)} değişmeyen · ${number(job.events_created)} durum olayı eklendi` : "";
    el("archive-days").replaceChildren();
    for(const row of data.items) {
      const tr=document.createElement("tr"),dateCell=document.createElement("td"),time=text("time",dayLabel(row.date));time.dateTime=row.date;dateCell.append(time);tr.append(dateCell);
      for(const kind of kinds) {
        const value=row.kinds[kind]||{status:"pending"},td=document.createElement("td");
        const name=({downloaded:"Alındı",not_published:"Yayımlanmadı",failed:"Hata",pending:"Bekliyor"})[value.status]||value.status;
        const badge=text("span",name,`bulletin-kind ${value.status}`);
        if(value.status==="downloaded")badge.append(text("small",`${value.pdfs} PDF`));
        if(value.reason)badge.title=value.reason;
        td.append(badge);tr.append(td);
      }
      tr.append(text("td",number(row.announcements),"numeric"),text("td",number(row.events),"numeric"));
      const status=document.createElement("td");status.append(text("span",labels[row.status]||row.status,`bulletin-row-status ${row.status}`));
      if(row.error) {const details=document.createElement("details");details.append(text("summary","Ayrıntı"),text("p",row.error));status.append(details);}
      tr.append(status);el("archive-days").append(tr);
    }
    el("archive-empty").hidden=data.items.length>0;
    el("archive-page-label").textContent=`${data.page} / ${data.pages} sayfa · ${number(data.total)} gün`;
    if(data.problem)error(data.problem);else error();
    controls();
  }
  async function refresh() {
    if(polling)return;
    clearTimeout(timer);polling=true;
    try {
      const month=el("archive-month").value;
      const response=await IhaleApp.fetch(`/api/local/ekap/bulletins/${el("archive-year").value}?page=${page}${month ? "&month="+month : ""}`,{cache:"no-store",signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(response.status===401||response.status===403 ? "Yönetici hesabıyla giriş yapmalısınız." : "Bülten durumu alınamadı.");
      render(await response.json());
    } catch(err) {error(err.name==="TimeoutError" ? "Sunucuya ulaşılamıyor. Biraz sonra yenileyin." : err.message);state=null;}
    finally {polling=false;controls();timer=setTimeout(refresh,state?.running ? 3000 : 15000);}
  }
  async function command(action,payload) {
    if(busy)return;busy=true;controls();error();
    try {
      const response=await IhaleApp.fetch(`/api/local/ekap/bulletins/${action}`,{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"IhaleListele"},body:payload ? JSON.stringify(payload) : undefined});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.detail==="string" ? data.detail : "Aktarım isteği işlenemedi.");
      page=1;el("archive-year").value=String(data.year);el("archive-month").value="";render(data);
    } catch(err) {error(err.message);}
    finally {busy=false;controls();}
  }
  for(let year=currentYear;year>=2000;year--){const option=text("option",String(year));option.value=year;el("archive-year").append(option);}
  for(let month=1;month<=12;month++){const option=text("option",new Intl.DateTimeFormat("tr-TR",{month:"long"}).format(new Date(2026,month-1,1)));option.value=month;el("archive-month").append(option);}
  for(const id of ["archive-year","archive-month"])el(id).addEventListener("change",()=>{page=1;refresh();});
  el("bulletin-form").addEventListener("submit",event=>{event.preventDefault();if(el("bulletin-day").reportValidity())command("start",{mode:"day",day:el("bulletin-day").value});});
  el("resume-start").addEventListener("click",()=>command("start",{mode:"resume"}));
  el("archive-stop").addEventListener("click",()=>command("stop"));
  el("select-today").addEventListener("click",()=>{el("bulletin-day").value=state?.today||"";});
  el("archive-refresh").addEventListener("click",refresh);
  el("archive-prev").addEventListener("click",()=>{page--;refresh();});el("archive-next").addEventListener("click",()=>{page++;refresh();});
  refresh();
})();

});
