"use strict";
IhaleApp.adminReady.then(allowed => {
  if (!allowed) return;
  const el = id => document.getElementById(id);
  const endpoint = "/api/local/ekap/direct-procurements";
  const labels = {starting:"Başlatılıyor", collecting:"Önizleme hazırlanıyor", ready:"Önizleme hazır", importing:"Aktarılıyor", completed:"Aktarım tamamlandı", stopped:"Durduruldu", interrupted:"İşlem kesildi", failed:"İşlem tamamlanamadı"};
  let page = 1, latest = null, pending = false, actionPending = false;
  const provinces = ["Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın","Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"];
  const year = Number(new Intl.DateTimeFormat("en", {year:"numeric", timeZone:"Europe/Istanbul"}).format(new Date()));
  for (let y = year; y >= 2022; y--) el("dt-year").add(new Option(String(y), String(y)));
  provinces.map((name,index) => ({name,code:String(index+1)})).sort((a,b) => a.name.localeCompare(b.name,"tr")).forEach(city => el("dt-city").add(new Option(city.name,city.code)));
  function error(text) { el("dt-error").hidden = !text; el("dt-error").textContent = text || ""; }
  function dateText(value, withTime = false) {
    if (!value) return "Belirtilmemiş";
    return new Intl.DateTimeFormat("tr-TR", {day:"2-digit",month:"2-digit",year:"numeric", ...(withTime ? {hour:"2-digit",minute:"2-digit"} : {}),timeZone:"Europe/Istanbul"}).format(new Date(withTime ? value : `${value}T12:00:00+03:00`));
  }
  function options() {
    return {year:Number(el("dt-year").value),kind:el("dt-kind").value,city_code:el("dt-city").value,deadline_from:el("dt-from").value || null,deadline_to:el("dt-to").value || null,start_page:Number(el("dt-start-page").value),max_pages:Number(el("dt-max-pages").value)};
  }
  function render(data) {
    latest = data;
    const job = data.job, busy = data.busy || actionPending;
    error(data.problem);
    el("dt-status").textContent = labels[job?.status] || "İlk önizlemenizi hazırlayın";
    el("dt-message").textContent = job?.message || "Arama seçeneklerini belirleyip başlayın.";
    el("dt-preview").disabled = busy || data.can_preview === false;
    el("dt-form").querySelectorAll("input,select").forEach(input => { input.disabled = busy; });
    el("dt-stop").hidden = !data.busy;
    el("dt-import").disabled = busy || data.problem || job?.status !== "ready" || !data.total;
    el("dt-import").textContent = data.total ? `${data.total.toLocaleString("tr-TR")} kaydı aktar →` : "Önizlemeyi aktar";
    el("dt-next-batch").hidden = busy || !job?.next_page || !["ready","completed"].includes(job?.status);
    const importing = job?.mode === "import";
    const max = importing ? job?.records : job?.options?.max_pages;
    const value = importing ? job?.processed : job?.done_pages;
    el("dt-progress").max = Math.max(1,max || 1); el("dt-progress").value = value || 0;
    el("dt-progress-label").textContent = job ? `${value || 0} / ${max || 0} ${importing ? "kayıt işlendi" : "sayfa okundu"}` : "Henüz işlem yok";
    el("dt-counts").textContent = job ? `${job.records || 0} tekil kayıt · ${job.created || 0} yeni · ${job.updated || 0} güncellendi · ${job.skipped || 0} değişmedi` : "";
    el("dt-result-note").textContent = data.total ? `${data.total.toLocaleString("tr-TR")} kayıt · ${job?.limited ? "Seçilen sayfa sınırına ulaşıldı; daha fazla kayıt olabilir." : "Aramanın sonuna ulaşıldı."}` : "Görüntülenecek önizleme bulunmuyor.";
    el("dt-rows").replaceChildren();
    for (const item of data.items) {
      const row = document.createElement("tr");
      const subject = document.createElement("td"), id = document.createElement("strong");
      id.textContent = item.external_id; subject.append(id,document.createTextNode(item.title)); row.append(subject);
      for (const value of [item.buyer,item.city,item.source_category?.replace("Doğrudan temin · ","")]) {
        const cell = document.createElement("td"); cell.textContent = value || "—"; row.append(cell);
      }
      const cutoff = document.createElement("td"); cutoff.textContent = dateText(item.tender_at || item.deadline, Boolean(item.tender_at)); row.append(cutoff);
      const source = document.createElement("td"), link = document.createElement("a");
      link.href = item.source_url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "EKAP ↗"; source.append(link); row.append(source);
      el("dt-rows").append(row);
    }
    el("dt-prev").disabled = page <= 1; el("dt-next").disabled = page >= data.pages;
    el("dt-page-label").textContent = data.total ? `${page} / ${data.pages}` : "";
    el("dt-history").replaceChildren();
    for (const item of data.history) {
      const row = document.createElement("div"), title = document.createElement("div"), summary = document.createElement("span");
      row.className = "dt-history-row";
      title.textContent = `${item.mode === "preview" ? "Önizleme" : "Aktarım"} · ${labels[item.status] || item.status} · ${dateText(item.started_at,true)}`;
      summary.textContent = item.mode === "import" ? `${item.created || 0} yeni · ${item.updated || 0} güncellendi · ${item.skipped || 0} değişmedi` : `${item.records || 0} kayıt`;
      row.append(title,summary); el("dt-history").append(row);
    }
  }
  async function load() {
    if (pending || actionPending) return;
    pending = true;
    try {
      const response = await IhaleApp.fetch(`${endpoint}/status?page=${page}`,{cache:"no-store"});
      if (!response.ok) throw new Error("Aktarım durumu alınamadı. Yönetici girişinizi kontrol edin.");
      render(await response.json());
    } catch (err) { error(err.message === "Failed to fetch" ? "Sunucuya ulaşılamıyor. Bağlantınızı kontrol edip yenileyin." : err.message); }
    finally { pending = false; }
  }
  async function action(path, body = {}) {
    if (actionPending || pending) return;
    actionPending = true; error("");
    el("dt-preview").disabled = true; el("dt-import").disabled = true; el("dt-next-batch").disabled = true;
    try {
      const response = await IhaleApp.fetch(endpoint+path,{method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"IhaleListele"},body:JSON.stringify(body)});
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Arama seçeneklerini kontrol edin.");
      page = 1; actionPending = false; render(data);
    } catch (err) { actionPending = false; if (latest) render(latest); error(err.message); }
    finally { actionPending = false; el("dt-next-batch").disabled = false; }
  }
  el("dt-form").addEventListener("submit",event => { event.preventDefault(); action("/preview",options()); });
  el("dt-import").addEventListener("click",() => action("/import",{preview_id:latest?.job?.id}));
  el("dt-stop").addEventListener("click",() => action("/stop"));
  el("dt-next-batch").addEventListener("click",() => {
    const job = latest?.job;
    if (!job?.next_page) return;
    const next = {...job.options,start_page:job.next_page};
    el("dt-start-page").value = next.start_page;
    action("/preview",next);
  });
  el("dt-refresh").addEventListener("click",load);
  el("dt-prev").addEventListener("click",() => {page--;load();});
  el("dt-next").addEventListener("click",() => {page++;load();});
  load(); setInterval(() => {if (!document.hidden) load();},3000);
});
