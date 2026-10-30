"use strict";
(() => {
  const params = new URLSearchParams(location.search);
  const tender = params.get("tender");
  if (tender && /^[0-9a-f-]{36}$/i.test(tender)) {
    params.delete("tender");
    location.replace(IhaleApp.href(`/tenders/${tender}${params.size ? "?" + params : ""}`));
    return;
  }
  const legacyFilters = ["source_id", "q", "category", "city", "activity_status", "page"];
  if (legacyFilters.some(key => params.has(key))) {
    location.replace(IhaleApp.href(`/tenders?${params}`));
    return;
  }
  IhaleApp.fetch("/api/auth/me", {cache:"no-store"}).then(async response => {
    if (!response.ok || !(await response.json()).user) return;
    const start = document.getElementById("home-start");
    start.href = IhaleApp.href("/tenders");
    start.replaceChildren(document.createTextNode("İhaleleri incele "));
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    arrow.setAttribute("aria-hidden", "true");
    start.append(arrow);
    document.getElementById("home-login").hidden = true;
    document.getElementById("home-membership").textContent = "Hesabınız hazır. İhaleleri keşfetmeye devam edin.";
  }).catch(() => {});
})();
