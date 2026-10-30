
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
const el = id => document.getElementById(id);
el("api-url").value = IhaleApp.apiUrl;
el("save-connection").disabled = !IhaleApp.remote;
if (!IhaleApp.remote) {
  el("api-url").readOnly = true;
  el("connection-note").textContent = "Yerel uygulamaya doğrudan bağlısınız. Demo adresi yayımlanan web sitesinde değiştirilebilir.";
}
el("test-connection").addEventListener("click", async () => {
  el("connection-result").textContent = "Bağlantı kontrol ediliyor…";
  try {
    if (IhaleApp.remote) await IhaleApp.probe(el("api-url").value);
    else {
      const response = await IhaleApp.fetch("/health");
      if (!response.ok) throw new Error("API'ye ulaşılamıyor.");
    }
    el("connection-result").textContent = "API bağlantısı başarılı.";
  } catch (error) { el("connection-result").textContent = error.message || "Bağlantı kurulamadı."; }
});
el("connection-form").addEventListener("submit", async event => {
  event.preventDefault();
  el("save-connection").disabled = true;
  try {
    await IhaleApp.saveApi(el("api-url").value);
    location.assign(IhaleApp.href("/account"));
  } catch (error) {
    el("connection-result").textContent = error.message || "Adres kaydedilemedi.";
    el("save-connection").disabled = false;
  }
});
IhaleApp.fetch("/api/local/connection", {cache:"no-store"}).then(async response => {
  if (!response.ok) throw new Error("Yönetici girişi ve API bağlantısını kontrol edin.");
  const info = await response.json();
  el("model-status").textContent = `${info.model} · ${info.llm_ready ? "Hazır" : "Modele ulaşılamıyor"}`;
}).catch(error => { el("model-status").textContent = error.message; });

});
