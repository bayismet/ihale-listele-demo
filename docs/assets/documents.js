import {FolderSync} from "./folder_sync.mjs";
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
const $ = id => document.getElementById(id);
let watching = false;
let watchTimer;
function item(text) { const li = document.createElement("li"); li.textContent = text; return li; }
async function upload(url, file, limit) {
  if (file.size > limit) throw new Error("Dosya izin verilen boyuttan büyük.");
  const response = await IhaleApp.fetch(url, {method:"POST", body:file,
    headers:{"Content-Type":"application/octet-stream", "X-Requested-With":"IhaleListele", Accept:"application/json"}});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Aktarım yapılamadı.");
  return result;
}
async function refresh() {
  const response = await IhaleApp.fetch("/api/local/documents");
  if (!response.ok) throw new Error("Dosya listesi yüklenemedi.");
  const records = await response.json();
  $("document-tenders").replaceChildren();
  $("documents-empty").textContent = records.length ? `${records.length} ihalenin dosyaları hazır.` : "Henüz paket eklenmedi.";
  for (const record of records) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = IhaleApp.href(`/tenders/${encodeURIComponent(record.id)}`);
    link.textContent = `${record.ikn} · ${record.title}`;
    li.append(link, document.createTextNode(` · ${record.files} dosya`));
    $("document-tenders").append(li);
  }
}
$("document-import").addEventListener("submit", async event => {
  event.preventDefault();
  const report = $("capture-file").files[0];
  const files = [...$("package-files").files];
  if (!report && !files.length) { $("import-status").textContent = "Bir ilan raporu veya ZIP paketi seçin."; return; }
  $("import-button").disabled = true;
  $("watch-folder").disabled = true;
  $("capture-file").disabled = true;
  $("package-files").disabled = true;
  $("import-log").replaceChildren();
  let imported = 0, failed = 0;
  try {
    if (report) {
      $("import-status").textContent = "İlan raporu okunuyor…";
      const result = await upload("/api/local/documents/capture", report, 350000);
      $("import-log").append(item(`${result.created} yeni ilan, ${result.updated} güncelleme; ${result.skipped} kayıt zaten mevcut.`));
    }
    for (let index=0; index<files.length; index++) {
      const file = files[index];
      $("import-status").textContent = `${index+1} / ${files.length} paket aktarılıyor…`;
      try {
        const result = await upload(`/api/local/documents/import?filename=${encodeURIComponent(file.name)}`, file, 50000000);
        imported++;
        $("import-log").append(item(`${result.ikn}: ${result.created} dosya eklendi, ${result.skipped} dosya zaten mevcut.`));
      } catch (error) {
        failed++;
        $("import-log").append(item(`${file.name}: ${error.message}`));
      }
    }
    $("import-status").textContent = `Aktarım tamamlandı. ${imported} paket işlendi${failed ? `, ${failed} paket kontrol bekliyor` : ""}.`;
    await refresh();
  } catch (error) { $("import-status").textContent = error.message; }
  finally {
    $("import-button").disabled = false;
    $("capture-file").disabled = false;
    $("package-files").disabled = false;
    $("watch-folder").disabled = watching;
  }
});
refresh().catch(error => { $("documents-empty").textContent = error.message; });
$("watch-folder").addEventListener("click", async () => {
  if (typeof window.showDirectoryPicker !== "function") {
    $("watch-status").textContent = "Klasör bağlantısı için bu sayfayı normal Chrome'da açın. Elle toplu aktarımı da kullanabilirsiniz.";
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({id:"ekap-downloads", mode:"read"});
    watching = true;
    $("watch-folder").disabled = true;
    $("stop-watch").hidden = false;
    $("import-button").disabled = true;
    const sync = new FolderSync(upload, text => $("import-log").prepend(item(text)), () => watching);
    const scan = async () => {
      if (!watching) return;
      try {
        $("watch-status").textContent = "Klasör bağlı. Yeni ilan ve dosyalar bekleniyor; bu ekran açık kalsın.";
        if (await sync.scan(directory)) await refresh();
      } catch (error) {
        watching = false;
        $("watch-status").textContent = `Aktarım durdu: ${error.message}`;
        $("stop-watch").hidden = true;
        $("watch-folder").disabled = false;
        $("import-button").disabled = false;
      }
      if (watching) watchTimer = setTimeout(scan, 5000);
    };
    await scan();
  } catch (error) {
    $("watch-status").textContent = error.name === "AbortError" ? "Klasör seçimi iptal edildi." : "Klasöre okuma erişimi verilemedi.";
  }
});
$("stop-watch").addEventListener("click", () => {
  watching = false;
  clearTimeout(watchTimer);
  $("stop-watch").hidden = true;
  $("watch-folder").disabled = false;
  $("import-button").disabled = false;
  $("watch-status").textContent = "Otomatik aktarım durdu. Başlamış bir dosya aktarımı tamamlanabilir.";
});

});
