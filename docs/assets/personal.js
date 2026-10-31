"use strict";
const byId = id => document.getElementById(id);
const message = byId("personal-message");
const list = byId("personal-items");
const calendar = byId("calendar-view");
let favorites = [];
let month = new Date();
month = new Date(month.getFullYear(), month.getMonth(), 1);
function el(tag, text, className) {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function dateLabel(value) {
  return new Intl.DateTimeFormat("tr-TR", { day:"numeric", month:"long", year:"numeric" }).format(new Date(`${value}T12:00:00`));
}
function announce(title, copy, login = false) {
  message.replaceChildren(el("h2", title), el("p", copy));
  if (login) {
    const link = el("a", "Giriş yap / üye ol ↗");
    link.href = IhaleApp.href(`/account?next=${encodeURIComponent(location.pathname)}`);
    message.append(link);
  }
  message.hidden = false;
}
async function removeFavorite(item) {
  const response = await IhaleApp.fetch(`/api/me/favorites/${encodeURIComponent(item.id)}`, {
    method: "DELETE", headers: { "X-Requested-With": "IhaleListele", Accept: "application/json" },
  });
  if (!response.ok) throw new Error();
  favorites = favorites.filter(favorite => favorite.id !== item.id);
  window.dispatchEvent(new Event("ihale-notifications-changed"));
  renderFavorites();
}
function renderFavorites() {
  if (!list) return;
  list.replaceChildren();
  if (!favorites.length) {
    announce("Henüz favori ihale yok", "İhale listesindeki yıldız düğmesiyle takip etmek istediklerinizi kaydedin.");
    return;
  }
  message.hidden = true;
  for (const item of favorites) {
    const article = el("article", null, "personal-card");
    const link = el("a", null, "personal-card-link");
    link.href = IhaleApp.href(`/tenders/${encodeURIComponent(item.id)}`);
    link.append(el("span", ({active:"Aktif",inactive:"Pasif",unknown:"Durumu belirsiz"})[item.activity_status] || "Durumu belirsiz", `activity-badge activity-${item.activity_status}`));
    link.append(el("span", item.source_name, "source-tag"), el("h2", item.title), el("p", item.buyer || "Kurum belirtilmemiş"));
    const meta = [item.registration_number ? `İKN ${item.registration_number}` : "", item.city || "", item.deadline ? `Son teklif: ${dateLabel(item.deadline)}` : "Son teklif tarihi belirtilmemiş"].filter(Boolean).join(" · ");
    link.append(el("p", meta, "personal-meta"));
    const button = el("button", "Favorilerden çıkar", "favorite-remove");
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await removeFavorite(item); } catch (_) { button.disabled = false; announce("Kaydedilemedi", "Biraz sonra tekrar deneyin."); }
    });
    article.append(link, button);
    list.append(article);
  }
}
function renderCalendar() {
  const dated = favorites.filter(item => item.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
  byId("calendar-month").textContent = new Intl.DateTimeFormat("tr-TR", { month:"long", year:"numeric" }).format(month);
  const grid = byId("calendar-grid");
  grid.replaceChildren();
  ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].forEach(day => grid.append(el("div", day, "calendar-weekday")));
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let index = 0; index < firstWeekday; index++) grid.append(el("div", null, "calendar-day empty"));
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    const events = dated.filter(item => item.deadline === date);
    const cell = el("div", null, "calendar-day");
    cell.append(el("span", String(day), "calendar-day-number"));
    for (const item of events.slice(0, 2)) {
      const link = el("a", item.title, "calendar-event");
      link.href = IhaleApp.href(`/tenders/${encodeURIComponent(item.id)}`);
      link.title = item.title;
      cell.append(link);
    }
    if (events.length > 2) cell.append(el("span", `+${events.length - 2} ihale`, "calendar-more"));
    grid.append(cell);
  }
  const agenda = byId("calendar-agenda");
  agenda.replaceChildren();
  const monthEvents = dated.filter(item => item.deadline.startsWith(monthKey));
  if (!monthEvents.length) agenda.append(el("p", "Bu ay son teklif tarihi olan favori ihaleniz yok."));
  for (const item of monthEvents) {
    const row = el("a", null, "agenda-item");
    row.href = IhaleApp.href(`/tenders/${encodeURIComponent(item.id)}`);
    row.append(el("strong", dateLabel(item.deadline)), el("span", item.title));
    agenda.append(row);
  }
}
async function init() {
  try {
    const response = await IhaleApp.fetch("/api/me/favorites", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (response.status === 401) {
      announce("Üye girişi gerekli", "Favorilerinizi görmek için hesabınıza giriş yapın.", true);
      return;
    }
    if (!response.ok) throw new Error();
    favorites = (await response.json()).items;
    if (list) renderFavorites();
    if (calendar) {
      const dated = favorites.filter(item => item.deadline);
      if (!dated.length) announce("Takvimde gösterilecek ihale yok", "Son teklif tarihi bilinen ihaleleri favorilerinize eklediğinizde burada görünür.");
      calendar.hidden = false;
      calendar.setAttribute("aria-busy", "false");
      renderCalendar();
    }
  } catch (_) { announce("İçerik yüklenemedi", "Lütfen sayfayı yenileyip tekrar deneyin."); }
}
if (calendar) {
  byId("calendar-prev").addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCalendar(); });
  byId("calendar-next").addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCalendar(); });
}
init();
