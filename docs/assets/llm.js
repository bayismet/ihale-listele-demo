
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
const el = id => document.getElementById(id);
let busy = false, requestPending = false;
let currentCounts = {sector: 0, city: 0, city_retry: 0};
const labels = {running:"Çalışıyor",stopping:"Durduruluyor",completed:"Tamamlandı",stopped:"Durduruldu",interrupted:"Yeniden başlatma sırasında kesildi",failed:"İşlem başarısız"};
const skipLabels = {uncertain:"Yeterli bilgi yok veya model emin değil",unsupported_evidence:"Modelin kanıtı iş/teslim yeri metninde bulunamadı",multiple_provinces:"Birden fazla il belirtilmiş",conflicting_province:"Modelin seçtiği il kaynak metniyle çelişiyor",record_changed:"Kayıt veya işleme koşulları değişti"};
function error(text) { el("llm-error").textContent = text; el("llm-error").hidden = !text; }
function updateButtons() {
  el("sector-start").disabled = busy || requestPending || !currentCounts.sector;
  const cityTotal = currentCounts.city + (el("city-retry").checked ? currentCounts.city_retry : 0);
  el("city-start").disabled = busy || requestPending || !cityTotal;
  const total = (currentCounts.combined || 0) + (el("city-retry").checked ? currentCounts.combined_retry || 0 : 0);
  const both = (el("city-retry").checked ? currentCounts.combined_both_retry : currentCounts.combined_both) || 0;
  el("combined-count").textContent = total.toLocaleString("tr-TR");
  el("combined-overlap").textContent = `${both.toLocaleString("tr-TR")} kayıtta iki alan birlikte, kalan ${(total - both).toLocaleString("tr-TR")} kayıtta yalnızca eksik alan işlenir.`;
  el("combined-start").disabled = busy || requestPending || !total;
  el("city-retry").disabled = busy || requestPending;
}
async function refresh() {
  try {
    const response = await IhaleApp.fetch("/api/local/llm/status", {cache:"no-store"});
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Yönetici hesabıyla giriş yapmalısınız." : "İşlem durumu alınamadı.");
    const data = await response.json();
    currentCounts = {...data.counts, city_retry: data.counts.city_retry || 0};
    el("sector-count").textContent = data.counts.sector;
    el("city-count").textContent = data.counts.city;
    el("city-retry-count").textContent = currentCounts.city_retry;
    el("city-retry-note").hidden = !currentCounts.city_retry;
    busy = data.job && ["running", "stopping"].includes(data.job.status);
    updateButtons();
    el("job-stop").hidden = !busy;
    const job = data.job;
    el("job-status").textContent = job ? `${job.kind === "combined" ? "Şehir ve kategori" : job.kind === "city" ? "Şehir" : job.kind === "sector_migration" ? "Kategori geçişi" : "Kategori"} · ${labels[job.status] || job.status}` : "Henüz işlem başlatılmadı.";
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
      el("job-remaining").textContent = busy ? "İlk kayıt işleniyor; kalan süre hesaplanıyor…" : job ? `${job.saved || 0} kayıt güncellendi. İlerleme yüzdesi, incelenen kayıtları gösterir.` : "İşlem başladığında ilerleme burada görünecek.";
    }
    el("job-field-counts").hidden = job?.kind !== "combined";
    if (job?.kind === "combined") {
      const saved = job.fields_saved || {}, skipped = job.fields_skipped || {}, failed = job.fields_failed || {};
      el("job-field-counts").textContent = `Kategori: ${saved.sector || 0} kaydedildi, ${skipped.sector || 0} atlandı, ${failed.sector || 0} hata · Şehir: ${saved.city || 0} kaydedildi, ${skipped.city || 0} atlandı, ${failed.city || 0} hata · ${job.llm_calls || 0} model çağrısı (${job.combined_calls || 0} birleşik). Kaydedilen kayıt sayısı, en az bir alanı güncellenen ihaleleri gösterir.`;
    }
    const reasons = Object.entries(job?.skip_reasons || {});
    el("job-skip-reasons").replaceChildren(...reasons.map(([reason, count]) => {
      const item = document.createElement("li");
      item.textContent = `${count} kayıt: ${skipLabels[reason] || "Diğer nedenler"}`;
      return item;
    }));
    el("job-skip-reasons").hidden = !reasons.length;
    if (job) {
      el("job-counts").textContent = `${job.done}/${job.total} işlendi · ${job.saved} kaydedildi · ${job.skipped} atlandı · ${job.failed} hata · ${job.seconds_per_record} sn/kayıt`;
      el("job-note").textContent = job.message || "";
    }
  } catch (err) { error(err.message); for (const kind of ["sector", "city", "combined"]) el(`${kind}-start`).disabled = true; }
}
async function command(action, payload) {
  requestPending = true;
  el("sector-start").disabled = el("city-start").disabled = el("combined-start").disabled = true;
  error("");
  try {
    const response = await IhaleApp.fetch(`/api/local/llm/${action}`, {method:"POST",headers:{"Content-Type":"application/json","X-Requested-With":"IhaleListele"},body:payload ? JSON.stringify(payload) : undefined});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "İşlem başlatılamadı.");
    if (action === "stop") el("job-note").textContent = "Devam eden kayıt tamamlandıktan sonra duracak.";
  } catch (err) { error(err.message); }
  finally { requestPending = false; await refresh(); }
}
for (const kind of ["sector", "city", "combined"]) el(`${kind}-start`).addEventListener("click", () => {
  const input = el("batch-limit");
  if (!input.reportValidity() || !Number.isInteger(Number(input.value))) return;
  command("start", {kind,limit:Number(input.value),retry_skipped:["city", "combined"].includes(kind) && el("city-retry").checked});
});
el("city-retry").addEventListener("change", updateButtons);
el("job-stop").addEventListener("click", () => command("stop"));
refresh();
setInterval(refresh, 2500);

});
