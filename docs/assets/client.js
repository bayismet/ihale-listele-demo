"use strict";
window.IhaleApp = (() => {
  const config = window.IHALE_CONFIG || {};
  const base = (config.basePath || "").replace(/\/$/, "");
  const remote = Boolean(config.remote);
  const settingKey = `ihale-api:${base}`;
  const nativeFetch = window.fetch.bind(window);
  const defaultApi = config.apiUrl || "";
  let resolveAdmin;
  const adminReady = new Promise(resolve => { resolveAdmin = resolve; });
  let resolveMember;
  const memberReady = new Promise(resolve => { resolveMember = resolve; });
  function apiOrigin(value) {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("HTTPS API adresi girin. Yerel denemelerde localhost kullanılabilir.");
    }
    return url.origin;
  }
  let api = defaultApi;
  try { if (remote) api = apiOrigin(localStorage.getItem(settingKey) || defaultApi); } catch (_) {}
  const sessionKey = () => `ihale-session:${base}:${api}`;
  function token() {
    try {
      const value = JSON.parse(sessionStorage.getItem(sessionKey()) || "null");
      return value?.expiresAt > Date.now() ? value.token : null;
    } catch (_) { return null; }
  }
  function clearSession() { sessionStorage.removeItem(sessionKey()); }
  function acceptSession(body) {
    if (remote && body.access_token) {
      sessionStorage.setItem(sessionKey(), JSON.stringify({
        token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000,
      }));
    }
    window.dispatchEvent(new Event("ihale-account-changed"));
  }
  async function request(path, options = {}) {
    if (!path.startsWith("/api/") && path !== "/health" && path !== "/submissions") {
      throw new Error("Geçersiz uygulama isteği.");
    }
    const headers = new Headers(options.headers || {});
    if (remote) {
      headers.set("X-Requested-With", "IhaleListele");
      if (token()) headers.set("Authorization", `Bearer ${token()}`);
      if (["/api/auth/login", "/api/auth/register"].includes(path)) {
        headers.set("X-Ihale-Session", "bearer");
      }
    }
    const response = await nativeFetch(`${remote ? api : ""}${path}`, {
      ...options, headers, credentials: remote ? "omit" : "same-origin", redirect: "error",
    });
    if (response.status === 401 && document.body?.dataset.memberAccess === "true") {
      clearSession();
      location.replace(href(`/account?next=${encodeURIComponent(location.pathname + location.search)}`));
    }
    return response;
  }
  function href(path) {
    if (!path.startsWith("/") || path.startsWith("//")) return path;
    if (base && (path === base || path.startsWith(`${base}/`))) return path;
    const url = new URL(path, location.origin);
    const detail = url.pathname.match(/^\/tenders\/([0-9a-f-]+)$/i);
    if (remote && detail) {
      url.searchParams.set("tender", detail[1]);
      return `${base}/tenders/${url.search}${url.hash}`;
    }
    return `${base}${path}`;
  }
  async function probe(value) {
    const origin = apiOrigin(value);
    // Never send the current login token to an unverified, newly entered address.
    const response = await nativeFetch(`${origin}/api/demo/info`, {
      credentials: "omit", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const info = await response.json();
    if (!response.ok || info.application !== "ihale-listele" || !info.demo_enabled) {
      throw new Error("API'ye ulaşıldı ancak bu demo adresi için bağlantı etkin değil.");
    }
    return origin;
  }
  async function saveApi(value) {
    const current = await request("/api/auth/me", {cache:"no-store"});
    if (!current.ok || (await current.json()).user?.role !== "admin") {
      throw new Error("Bağlantıyı değiştirmek için yönetici girişi yapmalısınız.");
    }
    const next = await probe(value);
    clearSession();
    api = next;
    clearSession();
    localStorage.setItem(settingKey, api);
  }
  async function download(path, filename) {
    const response = await request(path);
    if (!response.ok) throw new Error("Dosya indirilemedi. Girişinizi ve bağlantıyı kontrol edin.");
    const blob = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = blob; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(blob), 60000);
  }
  const result = {
    remote, adminReady, memberReady, fetch: request, href, acceptSession,
    clearSession, probe, saveApi, download,
    get apiUrl() { return api || location.origin; },
    get path() {
      return base && location.pathname.startsWith(`${base}/`)
        ? location.pathname.slice(base.length) : location.pathname;
    },
  };
  document.addEventListener("DOMContentLoaded", async () => {
    const needsAdmin = document.body.hasAttribute("data-requires-admin");
    const needsMember = document.body.hasAttribute("data-requires-member");
    if (!needsAdmin && !needsMember) {
      resolveAdmin(true);
      resolveMember(true);
      return;
    }
    try {
      const response = await request("/api/auth/me", {cache:"no-store"});
      const user = response.ok ? (await response.json()).user : null;
      if (!user) {
        resolveAdmin(false);
        resolveMember(false);
        location.replace(href(`/account?next=${encodeURIComponent(location.pathname + location.search)}`));
      } else if (needsAdmin && user.role !== "admin") {
        document.querySelector("main").textContent = "Bu ekran yönetici hesabı gerektiriyor.";
        document.body.removeAttribute("data-requires-admin");
        resolveAdmin(false);
        resolveMember(true);
      } else {
        document.body.removeAttribute("data-requires-admin");
        document.body.removeAttribute("data-requires-member");
        if (needsMember) document.body.dataset.memberAccess = "true";
        resolveAdmin(true);
        resolveMember(true);
      }
    } catch (_) {
      const main = document.querySelector("main");
      main.textContent = "Mac'teki API'ye ulaşılamıyor. Mac'in ve bağlantının açık olduğunu kontrol edin.";
      document.body.removeAttribute("data-requires-admin");
      document.body.removeAttribute("data-requires-member");
      resolveAdmin(false);
      resolveMember(false);
    }
  });
  return result;
})();
