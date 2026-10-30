
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
const $ = id => document.getElementById(id);
const numbers = new Intl.NumberFormat("tr-TR");
const calendar = new Intl.DateTimeFormat("tr-TR", {day:"numeric", month:"long", year:"numeric", timeZone:"Europe/Istanbul"});
const clock = new Intl.DateTimeFormat("tr-TR", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", timeZone:"Europe/Istanbul"});
const descriptions = {
  recent:"İlk 10 sayfayı tarar. Yeni ilanları ekler, değişen kayıtları günceller.",
  full:"İhale listesini ilk sayfadan son sayfaya kadar tarar. Kayıtlı ilanları günceller; kopya oluşturmaz.",
  resume:"Son kaydedilen sayfanın ardından devam eder. Önceki sayfaları yeniden taramaz."
};
const labels = {
  idle:"Aktarıma hazır", starting:"Başlatılıyor", loading:"Aktarım sürüyor", succeeded:"Aktarım sürüyor",
  completed:"Tamamlandı", stopped:"Durduruldu", interrupted:"Çalışma yarım kaldı",
  verification_required:"Doğrulama gerekiyor", rate_limited:"İstek sınırına ulaşıldı",
  source_error:"Kaynağa erişilemedi", layout_changed:"Kaynak değişti", wrong_page:"Kaynak değişti",
  collector_error:"Aktarım tamamlanamadı", blocked:"Kaynak kontrol edilmeli"
};
let latest;
let busy = false;
let timer;

function controls() {
  $("start-transfer").disabled = busy || !latest?.can_start;
  $("stop-transfer").disabled = busy || !latest?.running || latest?.stop_requested;
  $("transfer-mode").disabled = busy || !latest?.can_start;
  $("resume-option").disabled = !latest?.can_resume;
  $("refresh-status").disabled = busy;
}
function render(state) {
  latest = state;
  $("total-records").textContent = numbers.format(state.total_records);
  $("newest-publication").textContent = state.newest_publication ? calendar.format(new Date(`${state.newest_publication}T12:00:00+03:00`)) : "Henüz yok";
  $("last-page").textContent = state.last_page_number ? numbers.format(state.last_page_number) : "—";
  $("last-checked").textContent = state.checked_at ? clock.format(new Date(state.checked_at)) : "Henüz yok";
  if (state.checked_at) $("last-checked").dateTime = state.checked_at;
  $("progress-heading").textContent = state.stop_requested ? "Durduruluyor" : labels[state.status] || "Durum kontrol ediliyor";
  if ($("job-message").textContent !== state.message) $("job-message").textContent = state.message;
  $("state-dot").dataset.state = state.running ? "running" : state.status === "completed" ? "completed" : ["idle", "stopped"].includes(state.status) ? "idle" : "error";
  for (const [id, key] of [["pages", "pages_completed"], ["created", "created"], ["updated", "updated"], ["skipped", "skipped"]]) {
    $(`batch-${id}`).textContent = state.batch[key] === undefined ? "—" : numbers.format(state.batch[key]);
  }
  if (state.source_id) $("bik-tenders").href = IhaleApp.href(`/tenders?source_id=${encodeURIComponent(state.source_id)}`);
  $("batch-details").textContent = state.batch.details_completed === undefined ? "" : `Kontrol edilen ilan ayrıntısı: ${numbers.format(state.batch.details_completed)}`;
  if (!state.can_resume && $("transfer-mode").value === "resume") $("transfer-mode").value = "recent";
  $("mode-description").textContent = descriptions[$("transfer-mode").value];
  controls();
}
function schedule() {
  clearTimeout(timer);
  if (!document.hidden) timer = setTimeout(() => request("status"), latest?.running ? 3000 : 15000);
}
async function request(action, mode) {
  if (busy) return;
  clearTimeout(timer);
  busy = true;
  controls();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await IhaleApp.fetch(`/api/local/bik/${action}`, {
      method:action === "status" ? "GET" : "POST", cache:"no-store", signal:abort.signal,
      headers:{Accept:"application/json", "Content-Type":"application/json", "X-Requested-With":"IhaleListele"},
      ...(action === "start" ? {body:JSON.stringify({mode})} : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "İşlem tamamlanamadı. Durumu yenileyip tekrar deneyin.");
    render(result);
    $("control-error").hidden = true;
  } catch (error) {
    $("control-error").textContent = error instanceof TypeError || error.name === "AbortError" ? "Uygulamaya ulaşılamıyor. Bağlantıyı kontrol edip durumu yenileyin." : error.message;
    $("control-error").hidden = false;
    // Do not offer controls based on a stale snapshot. Refresh remains available.
    latest = undefined;
  } finally {
    clearTimeout(timeout);
    busy = false;
    controls();
    schedule();
  }
}
$("transfer-form").addEventListener("submit", event => {event.preventDefault(); request("start", $("transfer-mode").value);});
$("transfer-mode").addEventListener("change", () => {$("mode-description").textContent = descriptions[$("transfer-mode").value];});
$("stop-transfer").addEventListener("click", () => request("stop"));
$("refresh-status").addEventListener("click", () => request("status"));
document.addEventListener("visibilitychange", () => {clearTimeout(timer); if (!document.hidden) request("status");});
request("status");

});
