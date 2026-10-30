
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
const el = id => document.getElementById(id);
let busy = false, requestPending = false;
const labels = {running:"Çalışıyor",stopping:"Durduruluyor",completed:"Tamamlandı",stopped:"Durduruldu",interrupted:"Yeniden başlatma sırasında kesildi",failed:"İşlem başarısız"};
function error(text) { el("llm-error").textContent = text; el("llm-error").hidden = !text; }
async function refresh() {
  try {
    const response = await IhaleApp.fetch("/api/local/llm/status", {cache:"no-store"});
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Yönetici hesabıyla giriş yapmalısınız." : "İşlem durumu alınamadı.");
    const data = await response.json();
    el("sector-count").textContent = data.counts.sector;
    el("city-count").textContent = data.counts.city;
    busy = data.job && ["running", "stopping"].includes(data.job.status);
    for (const kind of ["sector", "city"]) el(`${kind}-start`).disabled = busy || requestPending || !data.counts[kind];
    el("job-stop").hidden = !busy;
    const job = data.job;
    el("job-status").textContent = job ? `${job.kind === "city" ? "Şehir" : "Sektör"} · ${labels[job.status] || job.status}` : "Henüz işlem başlatılmadı.";
    const total = Math.max(0, Number(job?.total) || 0);
    const done = Math.min(total, Math.max(0, Number(job?.done) || 0));
    const percent = total ? Math.floor(done / total * 100) : job?.status === "completed" ? 100 : 0;
    el("job-progress").max = total || 1;
    el("job-progress").value = total ? done : percent / 100;
    el("job-percent").textContent = `%${percent}`;
    el("job-progress-label").textContent = `${done.toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")} kayıt işlendi`;
    el("job-progress").setAttribute("aria-valuetext", `%${percent}, ${done} / ${total} kayıt`);
    if (busy && done > 0 && job.seconds_per_record > 0) {
      const seconds = Math.ceil((total - done) * job.seconds_per_record);
      const minutes = Math.ceil(seconds / 60);
      el("job-remaining").textContent = seconds < 60 ? "Tahmini kalan süre: 1 dakikadan az" : `Tahmini kalan süre: ${minutes.toLocaleString("tr-TR")} dakika`;
    } else {
      el("job-remaining").textContent = busy ? "İlk kayıt işleniyor; kalan süre hesaplanıyor…" : job ? "İşlenen kayıtlar kaydedildi." : "İşlem başladığında ilerleme burada görünecek.";
    }
    if (job) {
      el("job-counts").textContent = `${job.done}/${job.total} işlendi · ${job.saved} kaydedildi · ${job.skipped} atlandı · ${job.failed} hata · ${job.seconds_per_record} sn/kayıt`;
      el("job-note").textContent = job.message || "";
    }
  } catch (err) { error(err.message); for (const kind of ["sector", "city"]) el(`${kind}-start`).disabled = true; }
}
async function command(action, payload) {
  requestPending = true;
  el("sector-start").disabled = el("city-start").disabled = true;
  error("");
  try {
    const response = await IhaleApp.fetch(`/api/local/llm/${action}`, {method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"IhaleListele"},body:payload ? JSON.stringify(payload) : undefined});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "İşlem başlatılamadı.");
    if (action === "stop") el("job-note").textContent = "Devam eden kayıt tamamlandıktan sonra duracak.";
  } catch (err) { error(err.message); }
  finally { requestPending = false; await refresh(); }
}
for (const kind of ["sector", "city"]) el(`${kind}-start`).addEventListener("click", () => {
  const input = el("batch-limit");
  if (!input.reportValidity() || !Number.isInteger(Number(input.value))) return;
  command("start", {kind,limit:Number(input.value)});
});
el("job-stop").addEventListener("click", () => command("stop"));
refresh();
setInterval(refresh, 2500);

});
