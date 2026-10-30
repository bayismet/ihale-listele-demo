
IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
const $ = id => document.getElementById(id);
const methods = {llm: "Yerel model", rules: "Anahtar kelime kuralları", source: "Kaynak eşlemesi", manual: "Elle seçilmiş"};
let items = [], categories = [], selectedId = null, activePage = 1, pages = 0;
let request = null, saving = false, stale = false, optionsReady = false;
const fields = {q: "review-query", source_id: "review-source", method: "review-method"};

function node(tag, text, cls) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (cls) element.className = cls;
  return element;
}
async function json(url, options = {}) {
  const response = await IhaleApp.fetch(url, {cache: "no-store", ...options});
  if (!response.ok) { const error = new Error("request_failed"); error.status = response.status; throw error; }
  return response.json();
}
function dateLabel(value) {
  if (!value) return "Kaynakta belirtilmemiş";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00+03:00`);
  const options = {day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul"};
  if (value.includes("T")) Object.assign(options, {hour: "2-digit", minute: "2-digit"});
  return new Intl.DateTimeFormat("tr-TR", options).format(date);
}
function announce(id, text) { $(id).textContent = text; $(id).hidden = !text; }
function params() {
  const search = new URLSearchParams();
  for (const [name, id] of Object.entries(fields)) if ($(id).value.trim()) search.set(name, $(id).value.trim());
  if (activePage > 1) search.set("page", String(activePage));
  return search;
}
function setBusy(value) {
  $("review-list").setAttribute("aria-busy", String(value));
  $("review-detail").setAttribute("aria-busy", String(value));
  for (const id of [...Object.values(fields), "search-reviews", "clear-review-filters", "reload-reviews"]) $(id).disabled = value || saving;
  $("previous-review-page").disabled = value || saving || activePage <= 1;
  $("next-review-page").disabled = value || saving || activePage >= pages;
  for (const button of document.querySelectorAll(".review-item")) button.disabled = value || saving;
}
function renderList() {
  const list = node("ul", null, "review-list");
  for (const item of items) {
    const entry = node("li"), button = node("button", null, "review-item");
    button.type = "button";
    button.setAttribute("aria-current", String(item.id === selectedId));
    button.setAttribute("aria-controls", "review-detail");
    const top = node("span", null, "review-item-top");
    top.append(node("span", item.source_name), node("span", item.city || "Şehir belirtilmemiş"));
    const bottom = node("span", null, "review-item-bottom");
    bottom.append(node("span", item.proposed_category ? `Öneri: ${item.proposed_category}` : "Sektör önerisi yok", "category-chip"), node("span", methods[item.method] || "Belirlenmemiş"));
    button.append(top, node("span", item.title, "review-item-title"), node("span", item.buyer || "Kurum belirtilmemiş", "review-item-buyer"), bottom);
    button.addEventListener("click", () => {
      if (saving || request) return;
      selectedId = item.id; renderList(); renderDetail(true);
    });
    entry.append(button); list.append(entry);
  }
  $("review-list").replaceChildren(list);
}
function renderDetail(focus = false) {
  stale = false;
  const item = items.find(value => value.id === selectedId);
  if (!item) {
    $("review-detail").replaceChildren(node("div", "İncelemek için listeden bir ilan seçin.", "message"));
    return;
  }
  const panel = node("article", null, "review-panel");
  panel.tabIndex = -1;
  const heading = node("h2", item.title); heading.id = "selected-review-heading";
  panel.setAttribute("aria-labelledby", heading.id);
  panel.append(node("span", item.source_name, "source-tag"), heading, node("p", item.buyer || "Kurum belirtilmemiş", "detail-buyer"));
  const facts = node("dl", null, "review-facts");
  for (const [label, value] of [
    ["Kaynak kategorisi", item.source_category || "Kaynakta belirtilmemiş"], ["Şehir", item.city || "Belirtilmemiş"],
    ["İhale kayıt numarası", item.registration_number || "Kaynakta belirtilmemiş"], ["Kaynak kayıt numarası", item.external_id || "Belirtilmemiş"],
    ["İhale tarih ve saati", dateLabel(item.tender_at || item.tender_date)], ["Son teklif tarihi", dateLabel(item.deadline)],
  ]) {const pair = node("div"); pair.append(node("dt", label), node("dd", value)); facts.append(pair);}
  const links = node("div", null, "review-links");
  for (const [label, href] of [["Kaynak ilanı aç ↗", item.source_url], ["Uygulamada görüntüle ↗", `/tenders/${encodeURIComponent(item.id)}`]]) {
    if (!href) continue;
    const link = node("a", label); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; links.append(link);
  }
  panel.append(facts, links);
  const proposal = node("div", null, "proposal-box"), top = node("div", null, "proposal-top");
  top.append(node("span", "İNCELENECEK ÖNERİ"), node("strong", methods[item.method] || "Öneri kaynağı belirtilmemiş"));
  proposal.append(top, node("p", item.proposed_category || "Belirgin bir sektör bulunamadı", "proposal-name"));
  let explanation = "Bu öneri henüz onaylanmadı. İlanın konusu ve kaynak bilgilerine göre değerlendirin.";
  if (item.method === "llm") explanation = "Yerel modelin önerisi, yüksek güven bildirse de insan onayı bekler. Model güveni doğruluk garantisi değildir.";
  proposal.append(node("p", explanation, "proposal-help")); panel.append(proposal);
  const form = node("form", null, "review-form"); form.id = "resolve-review-form";
  const categoryLabel = node("label", "Doğru sektör"); categoryLabel.htmlFor = "resolve-category";
  const select = node("select"); select.id = "resolve-category"; select.required = true;
  const placeholder = node("option", "Bir sektör seçin"); placeholder.value = ""; placeholder.disabled = true; select.append(placeholder);
  for (const category of categories) {const option = node("option", category); option.value = category; select.append(option);}
  select.value = categories.includes(item.proposed_category) ? item.proposed_category : "";
  const reasonLabel = node("label", "Karar notu "); reasonLabel.htmlFor = "resolve-reason"; reasonLabel.append(node("span", "(isteğe bağlı)"));
  const reason = node("textarea"); reason.id = "resolve-reason"; reason.maxLength = 2000; reason.rows = 2; reason.placeholder = "Bu sektörü seçme nedeniniz";
  const actions = node("div", null, "review-actions"), approve = node("button", "Seçilen sektörü onayla", "primary");
  approve.type = "submit"; approve.id = "approve-review"; approve.disabled = !select.value || !optionsReady;
  select.addEventListener("change", () => { approve.disabled = !select.value || saving || stale || !optionsReady; });
  const skip = node("button", "Sonraki ilana geç →", "text-button"); skip.type = "button";
  skip.disabled = items.length < 2;
  skip.addEventListener("click", () => {
    const index = items.findIndex(value => value.id === selectedId);
    selectedId = items[(index + 1) % items.length].id; renderList(); renderDetail(true);
  });
  actions.append(approve, skip);
  form.append(categoryLabel, select, reasonLabel, reason, actions, node("p", "Onayınız sektörü ilan listesinde görünür yapar ve karar geçmişine kaydedilir. Sonraki ilana geçmek karar kaydetmez.", "review-action-note"));
  form.addEventListener("submit", event => {event.preventDefault(); saveReview(item, select.value, reason.value);});
  panel.append(form); $("review-detail").replaceChildren(panel);
  if (focus) panel.focus({preventScroll: false});
}
async function loadQueue({updateUrl = false, preserve = false} = {}) {
  if (saving) return;
  if (request) request.abort();
  const controller = new AbortController(); request = controller;
  if (!preserve) announce("review-notice", "");
  announce("review-error", ""); setBusy(true);
  $("review-list").replaceChildren(node("div", null, "loading-line"));
  $("review-detail").replaceChildren(node("div", "İlan bilgileri yükleniyor…", "message"));
  $("review-pagination").hidden = true;
  if (updateUrl) history.replaceState(null, "", `${location.pathname}${params().size ? "?" + params() : ""}`);
  try {
    const result = await json(`/api/local/classifications/queue?${params()}`, {signal: controller.signal});
    if (controller.signal.aborted) return;
    if (!result.items.length && activePage > 1 && activePage > result.pages) {
      activePage = Math.max(1, result.pages); request = null; return loadQueue({updateUrl: true, preserve: true});
    }
    items = result.items; pages = result.pages;
    $("pending-total").textContent = result.pending_total.toLocaleString("tr-TR");
    $("queue-heading").textContent = `${result.total.toLocaleString("tr-TR")} ilan incelemeye hazır`;
    $("review-page-label").textContent = `${result.page} / ${result.pages} sayfa`;
    $("review-pagination").hidden = result.pages <= 1;
    if (!items.some(item => item.id === selectedId)) selectedId = items[0]?.id || null;
    renderList(); renderDetail();
    if (!items.length) {
      const empty = node("div", null, "message");
      empty.append(node("h3", result.pending_total ? "Filtrelere uygun ilan yok" : "İnceleme bekleyen ilan yok"), node("p", result.pending_total ? "Filtreleri temizleyerek diğer ilanları inceleyebilirsiniz." : "Yeni öneriler geldiğinde burada görünecek."));
      $("review-list").replaceChildren(empty);
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    items = []; selectedId = null;
    $("queue-heading").textContent = "İnceleme listesi";
    $("pending-total").textContent = "—";
    $("review-list").replaceChildren(); $("review-detail").replaceChildren();
    const restricted = [403, 404].includes(error.status);
    announce("review-error", restricted ? "Bu ekran yalnızca yönetici hesabıyla kullanılabilir." : "İlanlar yüklenemedi. Yenile düğmesiyle tekrar deneyin.");
  } finally {
    if (request === controller) {request = null; setBusy(false);}
  }
}
async function saveReview(item, category, reason) {
  if (saving || request || stale || !optionsReady || !category) return;
  saving = true; setBusy(true);
  for (const element of $("resolve-review-form").elements) element.disabled = true;
  $("approve-review").textContent = "Kaydediliyor…";
  announce("review-error", ""); announce("review-notice", "");
  try {
    await json(`/api/local/classifications/${encodeURIComponent(item.id)}/resolve`, {
      method: "POST", headers: {"Content-Type": "application/json", "X-Requested-With": "IhaleListele"},
      body: JSON.stringify({category, reason: reason.trim() || null, version: item.version}),
    });
    announce("review-notice", `Karar kaydedildi: ${category}. Onaylanan ilan inceleme listesinden çıkarıldı.`);
    const index = items.findIndex(value => value.id === item.id);
    selectedId = items[index + 1]?.id || items[index - 1]?.id || null;
    saving = false; await loadQueue({preserve: true});
  } catch (error) {
    stale = [404, 409].includes(error.status);
    announce("review-error", stale ? "İlan veya öneri bu sırada değişti ya da daha önce onaylandı. Listeyi yenileyip güncel bilgileri inceleyin." : error.status === 403 ? "Karar kaydedilemedi. Sayfayı yerel uygulama üzerinden açıp tekrar deneyin." : "Karar kaydedilemedi veya sonuç doğrulanamadı. Yenile düğmesiyle durumu kontrol edebilirsiniz.");
    for (const element of $("resolve-review-form").elements) element.disabled = false;
    $("approve-review").textContent = "Seçilen sektörü onayla";
    $("approve-review").disabled = stale || !category;
    saving = false; setBusy(false);
  }
}
async function init() {
  try {
    const options = await json("/api/local/classifications/options");
    categories = options.categories; optionsReady = true;
    for (const source of options.sources) {const option = node("option", source.name); option.value = source.id; $("review-source").append(option);}
    const search = new URLSearchParams(location.search);
    for (const [name, id] of Object.entries(fields)) $(id).value = search.get(name) || "";
    const page = Number(search.get("page") || 1); activePage = Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1;
    await loadQueue();
  } catch (_) {
    $("queue-heading").textContent = "İnceleme listesi";
    $("review-list").replaceChildren(); $("review-detail").replaceChildren(); setBusy(false);
    announce("review-error", "İnceleme ekranı açılamadı. Yerel uygulamayı açtığınızdan emin olup sayfayı yenileyin.");
  }
}
$("review-filters").addEventListener("submit", event => {event.preventDefault(); activePage = 1; loadQueue({updateUrl: true});});
$("clear-review-filters").addEventListener("click", () => {for (const id of Object.values(fields)) $(id).value = ""; activePage = 1; loadQueue({updateUrl: true});});
for (const id of ["review-source", "review-method"]) $(id).addEventListener("change", () => {activePage = 1; loadQueue({updateUrl: true});});
$("reload-reviews").addEventListener("click", () => {if (optionsReady) loadQueue(); else init();});
$("previous-review-page").addEventListener("click", () => {activePage--; loadQueue({updateUrl: true});});
$("next-review-page").addEventListener("click", () => {activePage++; loadQueue({updateUrl: true});});
init();

});
