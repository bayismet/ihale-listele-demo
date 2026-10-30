
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
async function refreshArchive() {
  const el = id => document.getElementById(id);
  const labels = {downloading:"İndiriliyor",extracting:"Ayrıştırılıyor",importing:"Aktarılıyor",complete:"Tamamlandı",failed:"Hata",needs_review:"İnceleme gerekli"};
  try {
    const response = await IhaleApp.fetch("/api/local/ekap/bulletins/2026",{cache:"no-store"});
    if (!response.ok) throw new Error("Bülten durumunu görmek için yönetici girişi yapın.");
    const data = await response.json();
    const complete = data.months.filter(m=>m.status==="complete").length;
    const count = data.as_of ? Number(data.as_of.slice(5,7)) : 10;
    el("archive-progress").max = count;
    el("archive-progress").value = complete;
    el("archive-status").textContent = `${complete} / ${count} ay tamamlandı · ${data.status === "complete" ? "Aktarım tamamlandı" : data.status === "incomplete" ? "Bazı aylar kontrol gerektiriyor" : "Aktarım sürüyor"}`;
    el("archive-months").replaceChildren();
    for (const month of data.months) {
      const tr = document.createElement("tr");
      for (const value of [month.month,labels[month.status]||month.status,month.summary.downloaded||0,month.summary.not_published||0,month.imported.created||0,month.imported.updated||0,month.imported.rejected||0]) {
        const td = document.createElement("td"); td.textContent = value; tr.append(td);
      }
      el("archive-months").append(tr);
    }
    el("archive-total").textContent = "Tamamlanan aylardaki kayıtlar sisteme kaydedilmiştir. İşlem bu sayfa kapalıyken de sürer.";
    el("archive-error").textContent = data.months.filter(m=>m.error).map(m=>`${m.month}: ${m.error}`).join(" · ");
  } catch (error) { el("archive-error").textContent = error.message; }
}
refreshArchive(); setInterval(refreshArchive,5000);

});
