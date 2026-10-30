"use strict";

const navigation = [
  { href: "/", label: "Ana sayfa" },
  { href: "/tenders", label: "İhaleler" },
  { href: "/sources/ekap/bulletins", label: "Veri aktarımları", adminOnly: true, sources: true },
  { href: "/admin/llm", label: "LLM çağrıları", adminOnly: true },
  { href: "/admin/connection", label: "Bağlantı", adminOnly: true },
  { href: "/favorites", label: "Favorilerim", memberOnly: true },
  { href: "/calendar", label: "Takvim", memberOnly: true },
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
      if (item.adminOnly) {
        link.dataset.adminOnly = "true";
        link.hidden = true;
      }
      if (item.memberOnly) {
        link.dataset.memberOnly = "true";
        link.hidden = true;
      }
      if (item.account) link.dataset.accountLink = "true";
      if (currentPath === item.href || (item.sources &&
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
    this.showAdminLinks();
    this.showAccountLink();
    window.addEventListener("ihale-account-changed", () => { this.showAdminLinks(); this.showAccountLink(); });
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
    } catch (_) {
      // Keep the sign-in link available when account status cannot be checked.
    }
  }
}

customElements.define("site-header", SiteHeader);
