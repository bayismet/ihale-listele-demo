"use strict";
const $ = id => document.getElementById(id);
const form = $("search-form");
const fields = ["q", "activity_status", "source_id", "category", "city", "published_from", "published_to", "tender_from", "tender_to", "deadline_from", "deadline_to", "sort"];
let activePage = 1;
let currentRequest;
const favoriteIds = new Set();
let signedIn = false;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function dateLabel(value) {
  if (!value) return "Belirtilmemiş";
  return new Intl.DateTimeFormat("tr-TR", {day:"numeric", month:"long", year:"numeric"})
    .format(new Date(`${value}T12:00:00`));
}
function favoriteButton(item) {
  const button = node("button", favoriteIds.has(item.id) ? "★" : "☆", "favorite-toggle");
  button.type = "button";
  button.setAttribute("aria-pressed", String(favoriteIds.has(item.id)));
  button.setAttribute("aria-label", favoriteIds.has(item.id) ? "Favorilerden çıkar" : "Favorilere ekle");
  button.title = button.getAttribute("aria-label");
  button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn) {
      location.href = IhaleApp.href(`/account?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    button.disabled = true;
    try {
      const isFavorite = favoriteIds.has(item.id);
      const response = await IhaleApp.fetch(`/api/me/favorites/${encodeURIComponent(item.id)}`, {
        method: isFavorite ? "DELETE" : "PUT",
        headers: { "X-Requested-With": "IhaleListele", Accept: "application/json" },
      });
      if (!response.ok) throw new Error();
      if (isFavorite) favoriteIds.delete(item.id); else favoriteIds.add(item.id);
      button.textContent = favoriteIds.has(item.id) ? "★" : "☆";
      button.setAttribute("aria-pressed", String(favoriteIds.has(item.id)));
      button.setAttribute("aria-label", favoriteIds.has(item.id) ? "Favorilerden çıkar" : "Favorilere ekle");
      button.title = button.getAttribute("aria-label");
    } catch (_) {
      button.title = "Kaydedilemedi. Tekrar deneyin.";
    } finally { button.disabled = false; }
  });
  return button;
}
async function json(url, signal) {
  const response = await IhaleApp.fetch(url, {signal, headers:{Accept:"application/json"}});
  if (!response.ok) throw new Error(response.status === 404 ? "not_found" : "unavailable");
  return response.json();
}
function tenderLabel(item) {
  if (item.tender_at) return new Intl.DateTimeFormat("tr-TR", {
    day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit",
    timeZone:"Europe/Istanbul"
  }).format(new Date(item.tender_at));
  if (item.tender_date) return `${dateLabel(item.tender_date)} · Saat belirtilmemiş`;
  return "Kaynakta belirtilmemiş";
}
function paramsFromForm() {
  const params = new URLSearchParams();
  for (const field of fields) {
    const value = $(field).value.trim();
    if (value && !(field === "sort" && value === "published")) params.set(field, value);
  }
  if (activePage > 1) params.set("page", activePage);
  return params;
}
function restoreForm() {
  const params = new URLSearchParams(location.search);
  for (const field of fields) $(field).value = params.get(field) || (field === "sort" ? "published" : field === "activity_status" ? "active" : "");
  const page = Number(params.get("page") || 1);
  activePage = Number.isInteger(page) && page > 0 && page <= 100000 ? page : 1;
}
function message(title, explanation) {
  const box = $("result-message");
  box.replaceChildren(node("h3", title), node("p", explanation));
  box.hidden = false;
}
function activityLabel(value) { return ({active:"Aktif",inactive:"Pasif",unknown:"Durumu belirsiz"})[value] || "Durumu belirsiz"; }
function card(item) {
  const shell = node("article", null, "tender-card-shell");
  const link = node("a", null, "tender-card");
  link.href = IhaleApp.href(`/tenders/${encodeURIComponent(item.id)}${location.search}`);
  const top = node("div", null, "card-top");
  top.append(node("span", item.source_name, "source-tag"));
  top.append(node("span", activityLabel(item.activity_status), `activity-badge activity-${item.activity_status}`));
  if (item.registration_number || item.external_id) top.append(node("span", item.registration_number ? `İKN ${item.registration_number}` : `Kayıt ${item.external_id}`, "reference"));
  link.append(top);
  if (item.category) link.append(node("span", item.category, "category-chip"));
  link.append(node("h3", item.title), node("p", item.buyer || "Kurum belirtilmemiş", "buyer"));
  const bottom = node("div", null, "card-bottom");
  const meta = node("div", null, "meta");
  if (item.city) meta.append(node("span", item.city));
  if (item.published_at) meta.append(node("span", `Yayın: ${dateLabel(item.published_at)}`));
  if (item.tender_at || item.tender_date) meta.append(node("span", `İhale: ${tenderLabel(item)}`));
  if (item.deadline) {
    const deadline = node("span", "Son teklif: ");
    deadline.append(node("strong", dateLabel(item.deadline)));
    meta.append(deadline);
  }
  const arrow = node("span", "↗", "card-arrow");
  arrow.setAttribute("aria-hidden", "true");
  bottom.append(meta, arrow);
  link.append(bottom);
  shell.append(link, favoriteButton(item));
  return shell;
}
async function loadResults(updateUrl = false) {
  if (currentRequest) currentRequest.abort();
  const controller = new AbortController();
  currentRequest = controller;
  const params = paramsFromForm();
  if (updateUrl) history.pushState(null, "", `${location.pathname}${params.size ? "?" + params : ""}`);
  $("result-message").hidden = true;
  $("pagination").hidden = true;
  $("results").setAttribute("aria-busy", "true");
  $("results").replaceChildren(node("div", null, "loading-line"), node("div", null, "loading-line"));
  $("result-heading").textContent = "İlanlar yükleniyor…";
  const invalidRange = ["published", "deadline"].some(field => $(field+"_from").value && $(field+"_to").value && $(field+"_from").value > $(field+"_to").value);
  if (invalidRange) {
    $("results").replaceChildren();
    $("result-heading").textContent = "İhale listesi";
    $("results").setAttribute("aria-busy", "false");
    message("Tarih aralığını kontrol edin", "Başlangıç tarihi bitiş tarihinden sonra olamaz.");
    return;
  }
  try {
    const result = await json(`/api/tenders?${params}`, controller.signal);
    if (controller.signal.aborted) return;
    $("results").replaceChildren(...result.items.map(card));
    $("result-heading").textContent = `${result.total.toLocaleString("tr-TR")} ilan bulundu`;
    if (result.items.length === 0) message("Aramanızla eşleşen ilan yok", "Farklı bir kelime deneyin veya filtreleri temizleyin.");
    $("pagination").hidden = result.pages <= 1;
    $("previous-page").disabled = result.page <= 1;
    $("next-page").disabled = result.page >= result.pages;
    $("page-label").textContent = `${result.page} / ${result.pages} sayfa`;
  } catch (error) {
    if (error.name === "AbortError") return;
    $("results").replaceChildren();
    $("result-heading").textContent = "İhale listesi";
    message("İlanlar şu anda yüklenemiyor", "Biraz sonra tekrar aramayı deneyin.");
  } finally {
    if (currentRequest === controller) $("results").setAttribute("aria-busy", "false");
  }
}
function addOption(select, value, label) {
  const option = node("option", label);
  option.value = value;
  select.append(option);
}
async function initCatalog() {
  try {
    const filters = await json("/api/tenders/filters");
    filters.sources.forEach(source => addOption($("source_id"), source.id, source.name));
    filters.categories.forEach(category => addOption($("category"), category, category));
    filters.cities.forEach(city => addOption($("city"), city, city));
    // Retain a shared filter value even if it has no currently visible facet.
    const params = new URLSearchParams(location.search);
    $("city-filter").hidden = filters.cities.length === 0 && !params.get("city");
    for (const field of ["source_id", "category", "city"]) {
      const value = params.get(field);
      if (value && ![...$(field).options].some(option => option.value === value)) addOption($(field), value, value);
    }
  } catch (_) { /* The results request presents a single, actionable error. */ }
  restoreForm();
  await loadResults();
}
async function initDetail(id) {
  $("catalog-view").hidden = true;
  $("detail-view").hidden = false;
  const backParams = new URLSearchParams(location.search);
  backParams.delete("tender");
  $("back-to-results").href = IhaleApp.href(`/tenders${backParams.size ? "?" + backParams : ""}`);
  try {
    const item = await json(`/api/tenders/${encodeURIComponent(id)}`);
    document.title = `${item.title} · İhale Listele`;
    const panel = node("article", null, "detail-panel");
    panel.append(node("span", item.source_name, "source-tag"), node("h1", item.title), node("p", item.buyer || "Kurum belirtilmemiş", "detail-buyer"));
    panel.append(favoriteButton(item));
    const facts = node("dl", null, "detail-facts");
    for (const [label, value] of [
      ["İhale kayıt numarası (İKN)", item.registration_number || (/^[0-9]{4}\/[1-9][0-9]*$/.test(item.external_id || "") ? item.external_id : "Kaynakta belirtilmemiş")],
      ["Kaynak kayıt numarası", item.external_id || "Belirtilmemiş"],
      ["Sektör", item.category || "Henüz sınıflandırılmamış"],
      ["Kaynak kategorisi", item.source_category || "Kaynakta belirtilmemiş"],
      ["Şehir", item.city || "Belirtilmemiş"],
      ["İşin yapılacağı / teslim yeri", item.location_text || "Kaynakta belirtilmemiş"],
      ["Yayın tarihi", dateLabel(item.published_at)],
      ["İhale tarih ve saati", tenderLabel(item)],
      ["Son teklif tarihi", item.deadline ? dateLabel(item.deadline) : "Kaynakta ayrıca belirtilmemiş"],
      ["Kaynak", item.source_name],
      ["Aktiflik durumu", activityLabel(item.activity_status)],
    ]) {
      const pair = node("div");
      pair.append(node("dt", label), node("dd", value));
      facts.append(pair);
    }
    panel.append(facts);
    if (item.latest_notice_kind) {
      const labels = {result:"Sonuç ilanı",cancellation:"İptal ilanı",correction:"Düzeltme ilanı",amendment:"Değişiklik ilanı"};
      panel.append(node("p", `Son resmî bildirim: ${labels[item.latest_notice_kind] || item.latest_notice_kind} · ${dateLabel(item.latest_notice_at)}`, "source-explanation"));
    }
    if (item.latest_notice_kind === "cancellation" && item.awards?.length) {
      panel.append(node("p", "İptal ilanı da bulunuyor. Aşağıdaki bilgiler daha önce yayımlanmış sözleşme sonuçlarıdır; güncel durumu kaynaktan kontrol edin.", "source-explanation"));
    }
    if (item.awards?.length) {
      const awards = node("section", null, "award-results");
      awards.append(node("h2", "İhale sonuçları"), node("p", "Sonuç bültenlerinde açıklanan yüklenici ve sözleşme bedelleri. Aynı ihale için birden fazla sözleşme bulunabilir.", "source-explanation"));
      for (const award of item.awards) {
        const entry = node("article", null, "award-card");
        const [whole, fraction = ""] = award.amount.split(".");
        const price = `${new Intl.NumberFormat("tr-TR").format(BigInt(whole))},${fraction.replace(/0+$/,"").padEnd(2,"0")} ${award.currency === "TRY" ? "TL" : award.currency}`;
        entry.append(node("h3", award.winner), node("p", price, "award-price"));
        entry.append(node("p", `Sözleşme tarihi: ${dateLabel(award.contract_date)} · Sonuç ilanı: ${dateLabel(award.published_at)}`, "source-explanation"));
        entry.append(node("p", `${award.bulletin_file} · Sonuç ilanı ${award.notice_number}`, "source-explanation"));
        awards.append(entry);
      }
      panel.append(awards);
    } else if (item.activity_status === "inactive") {
      panel.append(node("p", "Bu kayıt için doğrulanmış yüklenici ve sözleşme bedeli bilgisi henüz bulunmuyor. Pasif ihaleler iptal edilmiş veya yalnızca teklif süresi dolmuş da olabilir.", "source-explanation"));
    }

    if (item.source_url) {
      const sourceLabel = item.source_url.includes("/ekap/search/")
        ? "EKAP ihale ilanını aç ↗"
        : item.source_url.endsWith("/ekap/search")
          ? "Kaynak arama ekranını aç ↗"
          : "İlan kaynağını aç ↗";
      const source = node("a", sourceLabel, "primary source-action");
      source.href = item.source_url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      panel.append(source, node("p", "Belge, başvuru koşulları ve güncel bilgiler için ilanın yayımlandığı kaynağı inceleyin.", "source-explanation"));
    } else panel.append(node("p", "Bu ilan için kaynak bağlantısı belirtilmemiş.", "source-explanation"));
    $("detail-content").replaceChildren(panel);
    await loadDocuments(id, panel);
  } catch (error) {
    $("detail-content").replaceChildren(node("p", error.message === "not_found" ? "Bu ilan bulunamadı veya şu anda gösterilemiyor." : "İlan şu anda yüklenemiyor. Lütfen tekrar deneyin.", "message"));
  }
}
async function initFavorites() {
  try {
    const response = await IhaleApp.fetch("/api/me/favorites", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    signedIn = true;
    result.items.forEach(item => favoriteIds.add(item.id));
  } catch (_) { /* Guests can still open the sign-in flow from a favorite button. */ }
}
async function loadDocuments(id, panel) {
  try {
    const health = await json("/health");
    if (!["dev", "test"].includes(health.env)) return;
  } catch (_) { return; }
  let account;
  try {
    account = await json("/api/auth/me");
  } catch (_) { return; }
  const section = node("section", null, "tender-documents");
  section.append(node("h2", "İhale dosyaları"));
  panel.append(section);
  if (!account.user) {
    section.append(node("p", "Dosyaları görüntülemek için üye girişi yapın."));
    const login = node("a", "Giriş yap / üye ol ↗");
    login.href = IhaleApp.href("/account");
    section.append(login);
    return;
  }
  try {
    const documents = await json(`/api/local/tenders/${encodeURIComponent(id)}/documents`);
    if (!documents.length) section.append(node("p", "Bu ihale için henüz dosya eklenmedi."));
    const list = node("ul", null, "document-list");
    for (const document of documents) {
      const li = node("li");
      const label = document.kind === "tender_package" ? "İhale dokümanını indir" : "Teknik şartnameyi indir";
      const link = node("a", `${label} ↓`);
      link.href = document.url;
      if (IhaleApp.remote) link.addEventListener("click", async event => {
        event.preventDefault();
        try { await IhaleApp.download(document.url, document.filename); }
        catch (error) { link.textContent = error.message; }
      });
      link.setAttribute("download", document.filename);
      li.append(link, node("small", `${document.filename} · ${(document.bytes/1024/1024).toLocaleString("tr-TR", {maximumFractionDigits:2})} MB`));
      list.append(li);
    }
    section.append(list);
  } catch (_) { section.append(node("p", "Dosya listesi şu anda yüklenemiyor.")); }
}
form.addEventListener("submit", event => {event.preventDefault(); activePage = 1; loadResults(true);});
for (const field of fields.filter(field => field !== "q")) $(field).addEventListener("change", () => {activePage = 1; loadResults(true);});
$("clear-filters").addEventListener("click", () => {for (const field of fields) $(field).value = field === "sort" ? "published" : field === "activity_status" ? "active" : ""; activePage = 1; loadResults(true);});
function changePage(delta) {
  activePage = Math.max(1, activePage + delta);
  loadResults(true);
  $("result-heading").scrollIntoView({block:"start"});
}
$("previous-page").addEventListener("click", () => changePage(-1));
$("next-page").addEventListener("click", () => changePage(1));
window.addEventListener("popstate", () => {restoreForm(); loadResults();});
const detailMatch = IhaleApp.path.match(/^\/tenders\/([0-9a-f-]+)$/i) || (IhaleApp.remote && /^[0-9a-f-]{36}$/i.test(new URLSearchParams(location.search).get("tender") || "") ? [null, new URLSearchParams(location.search).get("tender")] : null);
IhaleApp.memberReady.then(allowed => {
  if (!allowed) return;
  initFavorites().finally(() => {
    if (detailMatch) initDetail(detailMatch[1]); else initCatalog();
  });
});
