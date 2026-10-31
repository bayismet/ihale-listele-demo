"use strict";

const navigation = [
  { href: "/", label: "Ana sayfa" },
  { href: "/tenders", label: "İhaleler" },
  { href: "/sources/ekap/bulletins", label: "Veri aktarımları", adminOnly: true, sources: true },
  { href: "/admin/llm", label: "LLM çağrıları", adminOnly: true },
  { href: "/admin/connection", label: "Bağlantı", adminOnly: true },
  { href: "/favorites", label: "Favorilerim", memberOnly: true },
  { href: "/calendar", label: "Takvim", memberOnly: true },
  { href: "/notifications", label: "Bildirimler", memberOnly: true, notifications: true },
  { href: "/account", label: "Giriş / Üye ol", account: true },
];

class SiteHeader extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";

    const skip = document.createElement("a");
    skip.className = "skip-link";
    skip.href = "#main";
    skip.textContent = "İçeriğe geç";

    const header = document.createElement("header");
    header.className = "site-header";
    const inner = document.createElement("div");
    inner.className = "header-inner";

    const brand = document.createElement("a");
    brand.className = "brand";
    brand.href = IhaleApp.href("/");
    brand.setAttribute("aria-label", "İhale Listele ana sayfa");
    const mark = document.createElement("span");
    mark.className = "brand-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "ı";
    const name = document.createElement("span");
    name.append("ihale");
    const light = document.createElement("span");
    light.className = "brand-light";
    light.textContent = "listele";
    const badge = document.createElement("span");
    badge.className = "beta";
    badge.textContent = "ÖN İZLEME";
    brand.append(mark, name, light, badge);

    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Ana menü");
    const currentPath = IhaleApp.path.startsWith("/tenders/")
      ? "/tenders"
      : IhaleApp.path.replace(/\/$/, "") || "/";

    for (const item of navigation) {
      const link = document.createElement("a");
      link.href = IhaleApp.href(item.href);
      link.textContent = item.label;
      if (item.notifications) {
        link.classList.add("notification-link");
        link.title = "Bildirimler";
        link.setAttribute("aria-label", "Bildirimler");
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("width", "21");
        icon.setAttribute("height", "21");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "1.7");
        icon.setAttribute("aria-hidden", "true");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4");
        icon.append(path);
        const count = document.createElement("span");
        count.className = "notification-count";
        count.hidden = true;
        link.replaceChildren(icon, count);
      }
      if (item.adminOnly) {
        link.dataset.adminOnly = "true";
        link.hidden = true;
      }
      if (item.memberOnly) {
        link.dataset.memberOnly = "true";
        link.hidden = true;
      }
      if (item.account) link.dataset.accountLink = "true";
      if (currentPath === item.href || (item.href === "/admin/llm" && currentPath.startsWith("/admin/llm/")) || (item.sources &&
          ["/sources/bik", "/sources/ekap/bulletins"].includes(currentPath))) {
        link.classList.add("nav-active");
        link.setAttribute("aria-current", "page");
      }
      nav.append(link);
    }

    inner.append(brand, nav);
    header.append(inner);
    this.replaceChildren(skip, header);
    this.showSourceTabs(currentPath);
    this.showLLMTabs(currentPath);
    this.showAdminLinks();
    this.showAccountLink();
    window.addEventListener("ihale-account-changed", () => { this.showAdminLinks(); this.showAccountLink(); });
    window.addEventListener("ihale-notifications-changed", () => this.refreshNotificationCount());
  }

  showSourceTabs(currentPath) {
    const tabs = [
      { href: "/sources/ekap/bulletins", label: "EKAP bültenleri" },
      { href: "/sources/bik", label: "BİK aktarımı" },
    ];
    if (!tabs.some(item => item.href === currentPath)) return;
    const main = document.querySelector("main");
    if (!main || main.querySelector(".source-tabs")) return;
    const nav = document.createElement("nav");
    nav.className = "source-tabs";
    nav.setAttribute("aria-label", "Veri aktarım ekranları");
    for (const item of tabs) {
      const link = document.createElement("a");
      link.href = IhaleApp.href(item.href);
      link.textContent = item.label;
      if (item.href === currentPath) link.setAttribute("aria-current", "page");
      nav.append(link);
    }
    main.prepend(nav);
  }

  showLLMTabs(currentPath) {
    const tabs = [
      {href:"/admin/llm", label:"LLM işlemleri"},
      {href:"/admin/llm/reviews", label:"Eksik bilgileri incele"},
    ];
    if (!tabs.some(item => item.href === currentPath)) return;
    const main = document.querySelector("main");
    if (!main) return;
    const nav = document.createElement("nav");
    nav.className = "source-tabs";
    nav.setAttribute("aria-label", "LLM çağrıları ekranları");
    for (const item of tabs) {
      const link = document.createElement("a");
      link.href = IhaleApp.href(item.href);
      link.textContent = item.label;
      if (item.href === currentPath) link.setAttribute("aria-current", "page");
      nav.append(link);
    }
    main.prepend(nav);
  }

  async showAdminLinks() {
    const links = this.querySelectorAll("[data-admin-only]");
    if (!links.length) return;
    try {
      const [healthResponse, accountResponse] = await Promise.all([
        IhaleApp.fetch("/health", { headers: { Accept: "application/json" } }),
        IhaleApp.fetch("/api/auth/me", { headers: { Accept: "application/json" }, cache: "no-store" }),
      ]);
      if (!healthResponse.ok || !accountResponse.ok) return;
      const [health, account] = await Promise.all([
        healthResponse.json(), accountResponse.json(),
      ]);
      const show = ["dev", "test"].includes(health.env) && account.user?.role === "admin";
      links.forEach(link => {
        link.hidden = !show;
      });
    } catch (_) {
      // Keep development-only links hidden if the environment cannot be verified.
    }
  }

  async showAccountLink() {
    const link = this.querySelector("[data-account-link]");
    try {
      const response = await IhaleApp.fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = await response.json();
      if (!result.user) return;
      if (link) link.textContent = result.user.role === "admin" ? "Yönetici hesabı" : "Hesabım";
      this.querySelectorAll("[data-member-only]").forEach(item => { item.hidden = false; });
      this.refreshNotificationCount();
      if (!this.notificationTimer) this.notificationTimer = setInterval(() => {
        if (!document.hidden) this.refreshNotificationCount();
      }, 60000);
    } catch (_) {
      // Keep the sign-in link available when account status cannot be checked.
    }
  }

  async refreshNotificationCount() {
    const link = this.querySelector(".notification-link");
    if (!link || link.hidden) return;
    if (this.notificationCountPending) { this.notificationCountAgain = true; return; }
    this.notificationCountPending = true;
    try {
      const response = await IhaleApp.fetch("/api/me/notifications/unread-count", {cache:"no-store"});
      if (!response.ok) return;
      const data = await response.json();
      const count = Math.max(0, Number(data.unread_count) || 0);
      const badge = link.querySelector(".notification-count");
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = !count;
      link.setAttribute("aria-label", count ? `Bildirimler, ${count} okunmamış` : "Bildirimler");
    } catch (_) {
      // Preserve navigation when the connection is temporarily unavailable.
    } finally {
      this.notificationCountPending = false;
      if (this.notificationCountAgain) {
        this.notificationCountAgain = false;
        this.refreshNotificationCount();
      }
    }
  }
}

customElements.define("site-header", SiteHeader);
